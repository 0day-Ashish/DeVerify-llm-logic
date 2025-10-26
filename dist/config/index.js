"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Load .env reliably whether the process is started from repo root or backend/
// 1) Prefer CWD/.env (when running `npm run dev` inside backend)
// 2) Fallback to backend/.env resolved relative to this file (when started from repo root)
(() => {
    const cwdEnv = path_1.default.resolve(process.cwd(), '.env');
    const backendEnv = path_1.default.resolve(__dirname, '../../.env');
    if (fs_1.default.existsSync(cwdEnv)) {
        dotenv_1.default.config({ path: cwdEnv });
    }
    else if (fs_1.default.existsSync(backendEnv)) {
        dotenv_1.default.config({ path: backendEnv });
    }
    else {
        // As a last resort, let dotenv search default locations
        dotenv_1.default.config();
    }
})();
exports.config = {
    port: process.env.PORT ? Number(process.env.PORT) : 4000,
    // Default DB changed to 'hackathons' as requested
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/hackathons',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    githubToken: process.env.GITHUB_TOKEN || undefined,
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-5-thinking-mini',
    pinataKey: process.env.PINATA_API_KEY || undefined,
    pinataSecret: process.env.PINATA_API_SECRET || undefined,
    alfajoresRpc: process.env.ALFAJORES_RPC || undefined
};
