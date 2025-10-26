"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = require("../config");
const submission_1 = require("../models/submission");
const github_1 = require("../services/github");
const llm_1 = __importDefault(require("../services/llm"));
const scoring_1 = require("../services/scoring");
const readmeScore_1 = require("../services/readmeScore");
const readmeJudge_1 = require("../services/readmeJudge");
const ipfs_1 = __importDefault(require("../services/ipfs"));
const mintVerify_1 = __importDefault(require("../services/mintVerify"));
const logger_1 = require("../lib/logger");
const connection = new ioredis_1.default(config_1.config.redisUrl, { maxRetriesPerRequest: null });
const worker = new bullmq_1.Worker('verify', async (job) => {
    const { submissionId } = job.data;
    const log = logger_1.logger.child({ submissionId });
    log.info('starting job');
    await mongoose_1.default.connect(config_1.config.mongoUri);
    const doc = await submission_1.Submission.findById(submissionId);
    if (!doc)
        throw new Error('submission not found');
    doc.status = 'running';
    doc.attempts = (doc.attempts || 0) + 1;
    await doc.save();
    try {
        const gh = await (0, github_1.fetchGitHubMetadata)(doc.repoUrl);
        doc.github = gh;
        // README evaluation per rubric
        try {
            const evalRes = (0, readmeScore_1.evaluateReadme)(gh.readme || '');
            doc.github.readmeEval = evalRes;
            if (!evalRes.required.hasReadme || !evalRes.required.summary || !evalRes.required.howToRun) {
                doc.flags = Array.from(new Set([...(doc.flags || []), 'readme-needs-fix']));
            }
            // Optional LLM-based README critique, controlled by OPENAI envs; best-effort, ignore errors
            try {
                const llmEval = await (0, readmeJudge_1.judgeReadmeWithLLM)(gh.readme || '');
                if (llmEval) {
                    doc.github.readmeEvalLlm = llmEval;
                }
            }
            catch (e) {
                log.warn({ e }, 'llm readme eval failed');
            }
        }
        catch (e) {
            log.warn({ e }, 'readme evaluation failed');
        }
        const signals = {
            hasLockfile: gh.manifestFiles && gh.manifestFiles.includes('package-lock.json'),
            largeBinaryDetected: gh.largeBinaryDetected,
            secretsDetected: false // TODO: integrate secret scanner
        };
        doc.signals = signals;
        if (doc.mintEvidence) {
            const ver = await (0, mintVerify_1.default)(doc.mintEvidence);
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
            llmResult = await (0, llm_1.default)(payload.repoSummary, payload.signals, payload.mintEvidence);
            doc.llm = { raw: llmResult.raw, parsed: llmResult.parsed };
        }
        catch (err) {
            log.error({ err }, 'LLM failed, falling back to deterministic only');
            doc.llm = { raw: String(err), parsed: null };
        }
        const det = (0, scoring_1.deterministicScore)(signals, gh, {}, doc.mintEvidence || {});
        let finalScore = det;
        if (llmResult && llmResult.parsed) {
            finalScore = (0, scoring_1.combineScores)(llmResult.parsed, det);
        }
        doc.score = finalScore;
        doc.explanation = llmResult?.parsed?.explanation || 'Deterministic-only score used';
        doc.flags = (llmResult?.parsed?.flags || []).slice(0, 10);
        doc.status = 'scored';
        // Optionally pin summary to IPFS
        try {
            const ipfsRes = await (0, ipfs_1.default)({ submissionId: doc._id.toString(), summary: { score: doc.score, explanation: doc.explanation } });
            if (ipfsRes)
                doc.ipfsProof = ipfsRes;
        }
        catch (err) {
            log.warn({ err }, 'ipfs pin failed');
        }
        await doc.save();
        log.info({ score: doc.score }, 'job finished');
    }
    catch (err) {
        logger_1.logger.error({ err, submissionId }, 'job processing failed');
        if (doc) {
            doc.status = 'failed';
            await doc.save();
        }
        throw err;
    }
}, { connection });
worker.on('failed', (job, err) => {
    logger_1.logger.error({ jobId: job?.id, err }, 'job failed');
});
worker.on('completed', (job) => {
    logger_1.logger.info({ jobId: job.id }, 'job completed');
});
// keep process alive
process.on('SIGINT', async () => {
    await worker.close();
    process.exit(0);
});
exports.default = worker;
