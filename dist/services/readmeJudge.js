"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.judgeReadmeWithLLM = judgeReadmeWithLLM;
const logger_1 = require("../lib/logger");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let OpenAIModule = null;
function getOpenAIClient() {
    if (!OpenAIModule) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        OpenAIModule = require('openai');
    }
    const Ctor = OpenAIModule?.OpenAI || OpenAIModule?.default || OpenAIModule;
    const apiKey = process.env.OPENAI_API_KEY || 'ollama';
    const baseURL = process.env.OPENAI_BASE_URL; // e.g., http://localhost:11434/v1 for Ollama
    const options = { apiKey };
    if (baseURL)
        options.baseURL = baseURL;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new Ctor(options);
    return client;
}
const MODEL = process.env.OPENAI_MODEL || 'gpt-5-thinking-mini';
const TIMEOUT = process.env.OPENAI_TIMEOUT_MS ? Number(process.env.OPENAI_TIMEOUT_MS) : 15000;
function buildPrompt(readme) {
    const sys = `You are a strict but fair hackathon README reviewer. Follow this rubric and return ONLY a JSON object:
Required (must-have): one-line project summary; how to run (single command or clear instruction); README present and non-empty.
Helpful extras (bonus): Install step; Usage example; Demo link or screenshot; Tech list; Tests mention / CI; License or contributing; Formatting & clarity (headings and a code block).
Scoring (0-100): Base 40 points if ALL required items are present, otherwise base is 0. Then add extras up to +60 total as follows: Install +10; Usage +10; Demo/screenshot +10; Tech list +8; Tests/CI +6; License/contributing +6; Formatting & clarity +10. Cap at 100.
Label: 85-100 great; 60-84 okay; <60 needs-improvement.`;
    const user = `README (truncated to first 4000 chars):\n\n${readme.slice(0, 4000)}\n\nReturn JSON ONLY with keys: {"score":0-100,"label":"great|okay|needs-improvement","required":{"summary":bool,"howToRun":bool,"hasReadme":bool},"helpful":{"install":bool,"usage":bool,"demoOrShot":bool,"techList":bool,"testsOrCI":bool,"licenseOrContrib":bool,"formatting":bool},"notes":string[]}`;
    return { sys, user };
}
async function judgeReadmeWithLLM(readme) {
    const client = getOpenAIClient();
    const { sys, user } = buildPrompt(readme || '');
    try {
        const res = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.0,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user }
            ],
            max_tokens: 300
        }, { timeout: TIMEOUT });
        const text = res?.choices?.[0]?.message?.content ?? '{}';
        const trimmed = text.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '');
        const first = trimmed.indexOf('{');
        const last = trimmed.lastIndexOf('}');
        const jsonSlice = first !== -1 && last !== -1 && last > first ? trimmed.slice(first, last + 1) : trimmed;
        const parsed = JSON.parse(jsonSlice);
        // basic validation and coercion
        let score = Number(parsed?.score);
        if (!Number.isFinite(score))
            score = 0;
        score = Math.max(0, Math.min(100, Math.round(score)));
        const label = (parsed?.label === 'great' || parsed?.label === 'okay') ? parsed.label : 'needs-improvement';
        const required = {
            summary: !!parsed?.required?.summary,
            howToRun: !!parsed?.required?.howToRun,
            hasReadme: !!parsed?.required?.hasReadme
        };
        const helpful = {
            install: !!parsed?.helpful?.install,
            usage: !!parsed?.helpful?.usage,
            demoOrShot: !!parsed?.helpful?.demoOrShot,
            techList: !!parsed?.helpful?.techList,
            testsOrCI: !!parsed?.helpful?.testsOrCI,
            licenseOrContrib: !!parsed?.helpful?.licenseOrContrib,
            formatting: !!parsed?.helpful?.formatting
        };
        const notes = Array.isArray(parsed?.notes) ? parsed.notes.map(String).slice(0, 10) : [];
        return { score, label, required, helpful, notes };
    }
    catch (err) {
        logger_1.logger.warn({ err }, 'LLM README judge failed');
        return null;
    }
}
exports.default = judgeReadmeWithLLM;
