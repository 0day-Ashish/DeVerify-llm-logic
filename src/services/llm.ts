/*
 * New implementation per module specification: build prompts, call OpenAI chat API,
 * validate with Zod, retry on failure, and fallback to deterministic scoring.
 */

import { z } from 'zod';
import { RepoSummary, Signals, MintEvidence, LLMResult } from '../types/llm';
import { deterministicScore } from './scoring';
import { logger } from '../lib/logger';
import { USE_LOCAL_LLM } from '../config/llm';
import { scoreRepoWithLocalLLM } from './llm-local';

// dynamic require to avoid type dep
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires
let OpenAIModule: any = null;
function getOpenAIClient() {
  if (!OpenAIModule) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    OpenAIModule = require('openai');
  }
  // Support both CJS and ESM shapes
  const Ctor = OpenAIModule?.OpenAI || OpenAIModule?.default || OpenAIModule;
  // Support local Ollama via OPENAI_BASE_URL
  const apiKey = process.env.OPENAI_API_KEY || 'ollama'; // Ollama doesn't require a key; client expects string
  const baseURL = process.env.OPENAI_BASE_URL; // e.g., http://localhost:11434/v1
  const options: Record<string, unknown> = { apiKey };
  if (baseURL) options.baseURL = baseURL;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = new Ctor(options);
  return client;
}

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5-thinking-mini';
const OPENAI_TIMEOUT_MS = process.env.OPENAI_TIMEOUT_MS ? Number(process.env.OPENAI_TIMEOUT_MS) : 15000;

export const llmRespSchema = z.object({
  score: z.number().int().min(0).max(10),
  confidence: z.enum(['low', 'medium', 'high']),
  explanation: z.string().max(500),
  reasons: z.array(z.string()).max(6),
  flags: z.array(z.string())
});

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

export function buildPrompt(repoSummary: RepoSummary, signals: Signals, mintEvidence?: MintEvidence) {
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

export async function callModel(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<string> {
  const client = getOpenAIClient();
  // TODO: add logging/metrics integration for production
  if (process.env.NODE_ENV !== 'production') {
    logger.debug({ promptPreview: rawPromptForDebug(messages) }, 'LLM prompt');
  }
  try {
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.0,
      messages,
      max_tokens: 300,
      timeout: OPENAI_TIMEOUT_MS
    });
    const text = res?.choices?.[0]?.message?.content ?? '';
    if (process.env.NODE_ENV !== 'production') {
      logger.debug({ responsePreview: text.slice(0, 500) }, 'LLM raw response');
    }
    return text;
  } catch (err) {
    // retry once
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.0,
      messages,
      max_tokens: 300,
      timeout: OPENAI_TIMEOUT_MS
    });
    const text = res?.choices?.[0]?.message?.content ?? '';
    if (process.env.NODE_ENV !== 'production') {
      logger.debug({ responsePreview: text.slice(0, 500) }, 'LLM raw response (retry)');
    }
    return text;
  }
}

export function parseAndValidate(rawText: string) {
  const trimmed = (rawText || '').trim();
  const candidate = stripCodeFences(trimmed);
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('llm_parse_error: no JSON object found');
  }
  const jsonSlice = candidate.slice(first, last + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    throw new Error('llm_parse_error: invalid JSON');
  }
  return llmRespSchema.parse(parsed);
}

export async function scoreRepo(
  repoSummary: RepoSummary,
  signals: Signals,
  mintEvidence?: MintEvidence
): Promise<LLMResult> {
  // If configured to use local LLM (Ollama), call that path: build prompt and get raw string
  if (USE_LOCAL_LLM) {
    try {
      const raw = await scoreRepoWithLocalLLM(repoSummary, signals, mintEvidence);
      const parsed = parseAndValidate(raw);
      return { raw, parsed };
    } catch (e) {
      // local path error -> deterministic fallback
      const det = deterministicScore(signals as any, repoSummary as any, {}, mintEvidence as any);
      const parsed = {
        score: Math.max(0, Math.min(10, Math.round(det))),
        confidence: 'low' as const,
        explanation: 'Fallback due to local LLM error',
        reasons: ['local_llm_unavailable'],
        flags: ['local_llm_unavailable']
      };
      return { raw: 'fallback_due_to_local_llm_error', parsed };
    }
  }

  // Default: use remote OpenAI-compatible flow as before
  const { systemMessage, userMessage } = buildPrompt(repoSummary, signals, mintEvidence);
  try {
    const raw = await callModel([
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ]);
    const parsed = parseAndValidate(raw);
    return { raw, parsed };
  } catch {
    // on parse failure or call issue, retry with stricter message
    const stricter = userMessage + '\n\nReturn JSON only. No commentary. No code fences. JSON object ONLY.';
    try {
      const raw2 = await callModel([
        { role: 'system', content: systemMessage },
        { role: 'user', content: stricter }
      ]);
      const parsed2 = parseAndValidate(raw2);
      return { raw: raw2, parsed: parsed2 };
    } catch {
      const det = deterministicScore(signals as any, repoSummary as any, {}, mintEvidence as any);
      const parsed = {
        score: Math.max(0, Math.min(10, Math.round(det))),
        confidence: 'low' as const,
        explanation: 'Fallback due to LLM parse failure',
        reasons: ['llm_parse_error'],
        flags: ['llm_parse_error']
      };
      logger.debug('LLM parse failed twice, returning fallback');
      return { raw: 'fallback_due_to_parse_failure', parsed };
    }
  }
}

function stripCodeFences(s: string) {
  let out = s.trim();
  if (out.startsWith('```')) {
    const idx = out.indexOf('\n');
    if (idx !== -1) out = out.slice(idx + 1);
  }
  if (out.endsWith('```')) out = out.slice(0, -3);
  return out.trim();
}

function escapeForPrompt(s: string) {
  return s.replace(/"/g, '\\"');
}

function numOrZero(n?: number | null) {
  return typeof n === 'number' && isFinite(n) ? n : 0;
}

export function rawPromptForDebug(messages: Array<{ role: string; content: string }>) {
  if (process.env.NODE_ENV === 'production') return '[redacted]';
  return messages.map((m) => `(${m.role}) ${m.content.slice(0, 300)}...`).join('\n---\n');
}

export default scoreRepo;
