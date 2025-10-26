import express from 'express';
import bodyParser from 'body-parser';
import submitRoute from './routes/submit';
import hackathonRoute from './routes/hackathon';
import submissionRoute from './routes/submission';
import { logger } from './lib/logger';
import mongoose from 'mongoose';

export function createApp() {
  const app = express();
  app.use(bodyParser.json({ limit: '1mb' }));

  // TODO: add rate-limiting middleware (per-IP or per-wallet)

  app.use('/api/submit', submitRoute);
  app.use('/api/submission', submissionRoute);
  app.use('/api/hackathon', hackathonRoute);

  app.get('/health', (req, res) => {
    const state = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
    res.json({ ok: true, dbConnected: state === 1, dbState: state, dbName: mongoose.connection.name || null });
  });

  // error handler
  app.use((err: any, req: any, res: any, next: any) => {
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

export default createApp;
