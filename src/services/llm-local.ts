import OpenAI from 'openai';
import { logger } from '../lib/logger';
import { RepoSummary, Signals, MintEvidence } from '../types/llm';
import { LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, LLM_TIMEOUT_MS } from '../config/llm';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function getLocalClient() {
  // Lazily create the client so Jest mocks and env are applied per test/run
  return new OpenAI({ apiKey: LLM_API_KEY, baseURL: LLM_BASE_URL });
}

const SYSTEM_MESSAGE = `You are a factual, conservative repository and on-chain verifier. You will be given sanitized repository metadata, deterministic signals, and optional mint evidence. Output EXACTLY a single JSON object and nothing else, matching this schema:

{
  "score": number,            // integer 0-10
  "confidence": "low"|"medium"|"high",
  "explanation": string,      // 1-3 sentences
  "reasons": string[],        // up to 6 short reasons
  "flags": string[]           // tags like "no-readme","ci-failing","secrets-detected","mint_unverified"
}

Follow the rubric: prefer conservative lower scores for ambiguous evidence. Only use the supplied data. If you cannot verify something, include a reason "could_not_verify_X". Do not add commentary, code blocks, or any text other than the single JSON object.`;

const FEWSHOT = `Start with two examples (copy these exact examples into the prompt before the real input):

Example A (good)

Example:
repoSummary: { readme: "This is a full-stack webapp with setup, usage, and tests. Run \`npm test\` to run 25 unit tests.", latestCommitDaysAgo: 2, ciStatus: "passing", languages: { "javascript": 4000 }, manifestFiles: ["package.json","README.md"], hasTests: true, numContributors: 3, isFork: false }
signals: { hasLockfile: true, largeBinaryDetected: false, secretsDetected: false }
mintEvidence: { present: true, mintVerified: true, chain: "alfajores", tokenURI: "ipfs://Qm..." , metadataStatus: "resolvable" }
→ JSON: {"score":9,"confidence":"high","explanation":"Comprehensive project with tests, passing CI and verified mint.","reasons":["Tests present","CI passing","Verified mint"],"flags":[]}


Example B (poor)

Example:
repoSummary: { readme: "My repo", latestCommitDaysAgo: 400, ciStatus: "none", languages: { "none": 0 }, manifestFiles: ["README.md"], hasTests: false, numContributors: 1, isFork: true }
signals: { hasLockfile: false, largeBinaryDetected: false, secretsDetected: false }
mintEvidence: { present: false, mintVerified: false }
→ JSON: {"score":2,"confidence":"medium","explanation":"Minimal repo with no tests, old commit history and appears forked.","reasons":["No tests","Old commits","Is a fork"],"flags":["no-tests","old-commits","is-fork"]}`;

export async function callLocalModel(messages: ChatMessage[]): Promise<string> {
  try {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug({ promptPreview: rawPromptForDebugFromMessages(messages) }, 'Local LLM prompt');
    }
    const client = getLocalClient();
    const resp = await client.chat.completions.create(
      {
        model: LLM_MODEL,
        messages,
        temperature: 0.0,
        max_tokens: 300
      },
      { timeout: LLM_TIMEOUT_MS }
    );
    const text = resp.choices?.[0]?.message?.content ?? '';
    if (process.env.NODE_ENV !== 'production') {
      logger.debug({ responsePreview: text.slice(0, 500) }, 'Local LLM raw response');
    }
    return text;
  } catch (err: any) {
    // TODO: metrics for local_llm_errors, retry/backoff if desired
    logger.error({ err: err?.message || err }, 'Local LLM call failed');
    throw new Error('Local LLM not available');
  }
}

export async function scoreRepoWithLocalLLM(
  repoSummary: RepoSummary,
  signals: Signals,
  mintEvidence?: MintEvidence
): Promise<string> {
  const { systemMessage, userMessage } = buildPrompt(repoSummary, signals, mintEvidence);
  return callLocalModel([
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage }
  ]);
}

export function rawPromptForDebug(repoSummary: RepoSummary, signals: Signals, mintEvidence?: MintEvidence) {
  if (process.env.NODE_ENV === 'production') return '[redacted]';
  const { systemMessage, userMessage } = buildPrompt(repoSummary, signals, mintEvidence);
  return [
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage }
  ];
}

function buildPrompt(repoSummary: RepoSummary, signals: Signals, mintEvidence?: MintEvidence) {
  const trimmedReadme = (repoSummary.readme || '').slice(0, 4000);
  const me: MintEvidence = {
    present: !!mintEvidence?.present,
    mintVerified: mintEvidence?.mintVerified ?? false,
    chain: mintEvidence?.chain ?? null,
    tokenURI: mintEvidence?.tokenURI ?? null,
    metadataStatus: mintEvidence?.metadataStatus ?? null
  };

  const userMessage = `${FEWSHOT}


Then the actual input (replace placeholders):

Now evaluate the following:
repoSummary: { readme: "${escapeForPrompt(trimmedReadme)}", latestCommitDaysAgo: ${numOrZero(repoSummary.latestCommitDaysAgo)}, ciStatus: "${repoSummary.ciStatus}", languages: ${JSON.stringify(repoSummary.languages || {})}, manifestFiles: ${JSON.stringify(repoSummary.manifestFiles || [])}, hasTests: ${!!repoSummary.hasTests}, numContributors: ${repoSummary.numContributors ?? 0}, isFork: ${!!repoSummary.isFork} }
signals: { hasLockfile: ${!!signals.hasLockfile}, largeBinaryDetected: ${!!signals.largeBinaryDetected}, secretsDetected: ${!!signals.secretsDetected} }
mintEvidence: { present: ${!!me.present}, mintVerified: ${!!me.mintVerified}, chain: "${me.chain}", tokenURI: "${me.tokenURI}", metadataStatus: "${me.metadataStatus}" }
Return EXACTLY the JSON described in the system message above.`;

  return { systemMessage: SYSTEM_MESSAGE, userMessage };
}

function rawPromptForDebugFromMessages(messages: ChatMessage[]) {
  if (process.env.NODE_ENV === 'production') return '[redacted]';
  return messages.map((m) => `(${m.role}) ${m.content.slice(0, 300)}...`).join('\n---\n');
}

function escapeForPrompt(s: string) {
  return (s || '').replace(/"/g, '\\"');
}

function numOrZero(n?: number | null) {
  return typeof n === 'number' && isFinite(n) ? n : 0;
}

export default {
  callLocalModel,
  scoreRepoWithLocalLLM,
  rawPromptForDebug
};
