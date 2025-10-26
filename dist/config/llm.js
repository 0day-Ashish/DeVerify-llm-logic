"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLM_TIMEOUT_MS = exports.LLM_API_KEY = exports.LLM_MODEL = exports.LLM_BASE_URL = exports.USE_LOCAL_LLM = void 0;
exports.USE_LOCAL_LLM = (process.env.USE_LOCAL_LLM || 'false').toLowerCase() === 'true';
exports.LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://localhost:11434/v1';
exports.LLM_MODEL = process.env.LLM_MODEL || 'mistral';
exports.LLM_API_KEY = process.env.LLM_API_KEY || 'ollama';
exports.LLM_TIMEOUT_MS = process.env.LLM_TIMEOUT_MS ? Number(process.env.LLM_TIMEOUT_MS) : 15000;
