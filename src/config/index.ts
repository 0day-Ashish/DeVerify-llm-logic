import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env reliably whether the process is started from repo root or backend/
// 1) Prefer CWD/.env (when running `npm run dev` inside backend)
// 2) Fallback to backend/.env resolved relative to this file (when started from repo root)
(() => {
  const cwdEnv = path.resolve(process.cwd(), '.env');
  const backendEnv = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(cwdEnv)) {
    dotenv.config({ path: cwdEnv });
  } else if (fs.existsSync(backendEnv)) {
    dotenv.config({ path: backendEnv });
  } else {
    // As a last resort, let dotenv search default locations
    dotenv.config();
  }
})();

export const config = {
  port: process.env.PORT ? Number(process.env.PORT) : 4000,
  // Default DB changed to 'hackathons' as requested; prefer localhost loopback for Windows
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/hackathons',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  githubToken: process.env.GITHUB_TOKEN || undefined,
  openaiApiKey: process.env.OPENAI_API_KEY || undefined,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5-thinking-mini',
  pinataKey: process.env.PINATA_API_KEY || undefined,
  pinataSecret: process.env.PINATA_API_SECRET || undefined,
  alfajoresRpc: process.env.ALFAJORES_RPC || undefined
};
