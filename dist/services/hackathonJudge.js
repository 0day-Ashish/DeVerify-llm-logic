"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.judgeRepoTimeline = judgeRepoTimeline;
const logger_1 = require("../lib/logger");
// Lightweight OpenAI client setup (mirrors services/llm.ts behavior)
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires
let OpenAIModule = null;
function getOpenAIClient() {
    if (!OpenAIModule) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        OpenAIModule = require('openai');
    }
    const Ctor = OpenAIModule?.OpenAI || OpenAIModule?.default || OpenAIModule;
    const apiKey = process.env.OPENAI_API_KEY || 'ollama';
    const baseURL = process.env.OPENAI_BASE_URL;
    const options = { apiKey };
    if (baseURL)
        options.baseURL = baseURL;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new Ctor(options);
    return client;
}
const MODEL = process.env.OPENAI_MODEL || 'gpt-5-thinking-mini';
const TIMEOUT = process.env.OPENAI_TIMEOUT_MS ? Number(process.env.OPENAI_TIMEOUT_MS) : 15000;
function buildPrompt(metrics, startIso, endIso) {
    const sys = `You are a strict hackathon judge focused ONLY on commit timelines.
Return a single JSON object with keys: judgement ("qualified"|"disqualified"), reason (string <=150 chars), flags (string[]).
Primary rule: if ANY commit exists before the hackathon start, judgement="disqualified" with reason "pre_hack_commits".
Otherwise judge conservatively using signals: commitsDuring, commitsBefore, commitsAfter, daysActiveDuring, avgCommitsPerDayDuring.
Prefer disqualification on obvious code-dumps (all activity right before/after), or no commits during.`;
    const user = `Hackathon window: ${startIso} -> ${endIso}
Repo: ${metrics.repo}
Metrics: ${JSON.stringify(metrics)}
Return ONLY JSON, no prose.`;
    return { sys, user };
}
async function judgeRepoTimeline(metrics, startIso, endIso) {
    const client = getOpenAIClient();
    const { sys, user } = buildPrompt(metrics, startIso, endIso);
    // Policy guardrails: deterministic check has absolute precedence
    // - If deterministic marked disqualified, we honor that and skip LLM (or clamp to DQ)
    // - If deterministic did NOT find pre-hack commits, LLM is advisory-only and cannot flip to DQ
    if (metrics.disqualified) {
        return {
            repo: metrics.repo,
            judgement: 'disqualified',
            reason: metrics.disqualificationReason || 'pre_hack_commits_detected',
            // Make it explicit that deterministic guardrail applied and LLM was not consulted
            flags: ['deterministic_precedence', 'llm_skipped_due_to_deterministic', 'pre_hack_commits_detected']
        };
    }
    try {
        const res = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.0,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user }
            ],
            max_tokens: 200
        }, { timeout: TIMEOUT });
        const text = res?.choices?.[0]?.message?.content ?? '{}';
        const trimmed = text.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '');
        const first = trimmed.indexOf('{');
        const last = trimmed.lastIndexOf('}');
        const jsonSlice = first !== -1 && last !== -1 && last > first ? trimmed.slice(first, last + 1) : trimmed;
        const parsed = JSON.parse(jsonSlice);
        let judgement = (parsed?.judgement === 'disqualified' ? 'disqualified' : 'qualified');
        let reason = typeof parsed?.reason === 'string' && parsed.reason ? parsed.reason : (judgement === 'disqualified' ? 'policy_violation' : 'meets_policy');
        let flags = Array.isArray(parsed?.flags) ? parsed.flags.map(String).slice(0, 10) : [];
        // Clamp: deterministic says no pre-hack commits -> never allow LLM to disqualify
        if (judgement === 'disqualified') {
            // Sanitize LLM flags that contradict deterministic result
            flags = flags.filter((f) => !/pre[_-]?hack/i.test(f) && !/pre[_-]?start/i.test(f) && !/disqual/i.test(f));
            judgement = 'qualified';
            reason = 'no_pre_hack_commits_detected';
            // Use clearer, non-confusing flags
            flags.push('llm_disqualification_ignored');
            flags.push('policy_clamped_no_pre_hack_commits');
        }
        return { repo: metrics.repo, judgement, reason, flags };
    }
    catch (err) {
        logger_1.logger.warn({ err }, 'LLM timeline judge failed, defaulting');
        // Conservative fallback: mirror deterministic flag
        const dq = !!metrics.disqualified;
        return {
            repo: metrics.repo,
            judgement: dq ? 'disqualified' : 'qualified',
            reason: dq ? (metrics.disqualificationReason || 'pre_hack_commits') : 'no_pre_hack_commits_detected',
            flags: ['llm_unavailable']
        };
    }
}
exports.default = judgeRepoTimeline;
