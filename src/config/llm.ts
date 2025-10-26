export const USE_LOCAL_LLM = (process.env.USE_LOCAL_LLM || 'false').toLowerCase() === 'true';
export const LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://localhost:11434/v1';
export const LLM_MODEL = process.env.LLM_MODEL || 'mistral';
export const LLM_API_KEY = process.env.LLM_API_KEY || 'ollama';
export const LLM_TIMEOUT_MS = process.env.LLM_TIMEOUT_MS ? Number(process.env.LLM_TIMEOUT_MS) : 15000;
