import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import mongoose from 'mongoose';
import { config } from '../config';
import { Submission } from '../models/submission';
import { fetchGitHubMetadata } from '../services/github';
import callLLM from '../services/llm';
import { deterministicScore, combineScores } from '../services/scoring';
import { evaluateReadme } from '../services/readmeScore';
import { judgeReadmeWithLLM } from '../services/readmeJudge';
import pinToIpfs from '../services/ipfs';
import verifyMint from '../services/mintVerify';
import { logger } from '../lib/logger';
import { scrapeDevpostHackathons } from '../services/hackathonScraper';

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null } as any);

const worker = new Worker('verify', async (job: any) => {
  const { submissionId } = job.data as { submissionId: string };
  const log = logger.child({ submissionId });
  log.info('starting job');

  await mongoose.connect(config.mongoUri);
  const doc = await Submission.findById(submissionId);
  if (!doc) throw new Error('submission not found');

  doc.status = 'running';
  doc.attempts = (doc.attempts || 0) + 1;
  await doc.save();

  try {
    const gh = await fetchGitHubMetadata(doc.repoUrl);
    doc.github = gh;

    // README evaluation per rubric
    try {
      const evalRes = evaluateReadme(gh.readme || '');
      doc.github.readmeEval = evalRes;
      if (!evalRes.required.hasReadme || !evalRes.required.summary || !evalRes.required.howToRun) {
        doc.flags = Array.from(new Set([...(doc.flags || []), 'readme-needs-fix']));
      }
      // Optional LLM-based README critique, controlled by OPENAI envs; best-effort, ignore errors
      try {
        const llmEval = await judgeReadmeWithLLM(gh.readme || '');
        if (llmEval) {
          (doc.github as any).readmeEvalLlm = llmEval;
        }
      } catch (e) {
        log.warn({ e }, 'llm readme eval failed');
      }
    } catch (e) {
      log.warn({ e }, 'readme evaluation failed');
    }

    const signals = {
      hasLockfile: gh.manifestFiles && gh.manifestFiles.includes('package-lock.json'),
      largeBinaryDetected: gh.largeBinaryDetected,
      secretsDetected: false // TODO: integrate secret scanner
    };
    doc.signals = signals;

    if (doc.mintEvidence) {
      const ver = await verifyMint(doc.mintEvidence);
      doc.mintEvidence = { ...doc.mintEvidence, mintVerified: ver.ok, metadataStatus: doc.mintEvidence.tokenURI ? (ver.details?.metadataOk ? 'pinned' : 'mismatch') : null };
    }

    // LLM
    const payload = { repoSummary: {
      readme: gh.readme,
      latestCommitDaysAgo: gh.latestCommitDaysAgo,
      ciStatus: gh.ciStatus || 'none',
      languages: gh.languages || {},
      manifestFiles: gh.manifestFiles || [],
      hasTests: gh.hasTests || false,
      numContributors: gh.numContributors || 0,
      isFork: gh.fork || false
    }, signals, mintEvidence: { present: !!doc.mintEvidence, ...doc.mintEvidence } };

    let llmResult = null;
    try {
      llmResult = await callLLM(payload.repoSummary as any, payload.signals as any, payload.mintEvidence as any);
      doc.llm = { raw: llmResult.raw, parsed: llmResult.parsed };
    } catch (err) {
      log.error({ err }, 'LLM failed, falling back to deterministic only');
      doc.llm = { raw: String(err), parsed: null };
    }

  const det = deterministicScore(signals, gh, {}, doc.mintEvidence || {});
    let finalScore = det;
    if (llmResult && llmResult.parsed) {
      finalScore = combineScores(llmResult.parsed, det);
    }

    doc.score = finalScore;
    doc.explanation = llmResult?.parsed?.explanation || 'Deterministic-only score used';
    doc.flags = (llmResult?.parsed?.flags || []).slice(0, 10);
    doc.status = 'scored';

    // Optionally pin summary to IPFS
    try {
      const ipfsRes = await pinToIpfs({ submissionId: doc._id.toString(), summary: { score: doc.score, explanation: doc.explanation } });
      if (ipfsRes) doc.ipfsProof = ipfsRes;
    } catch (err) {
      log.warn({ err }, 'ipfs pin failed');
    }

    await doc.save();
    log.info({ score: doc.score }, 'job finished');
  } catch (err: any) {
    logger.error({ err, submissionId }, 'job processing failed');
    if (doc) {
      doc.status = 'failed';
      await doc.save();
    }
    throw err;
  }
}, { connection } as any);

worker.on('failed', (job: any, err: any) => {
  logger.error({ jobId: job?.id, err }, 'job failed');
});

worker.on('completed', (job: any) => {
  logger.info({ jobId: job.id }, 'job completed');
});

// keep process alive
process.on('SIGINT', async () => {
  await worker.close();
  process.exit(0);
});

const url = "https://devpost.com/hackathons?open_to[]=public&status[]=ended";
const hacks = await scrapeDevpostHackathons(url);
console.log(hacks);

export default worker;
