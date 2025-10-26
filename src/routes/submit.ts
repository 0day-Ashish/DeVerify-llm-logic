import express from 'express';
import { submitSchema, SubmitInput } from '../validators/submitSchema';
import { Submission } from '../models/submission';
import { Queue } from 'bullmq';
import { config } from '../config';
import IORedis from 'ioredis';
import { logger } from '../lib/logger';

const router = express.Router();

// create a queue
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null } as any);
const verifyQueue = new Queue('verify', { connection } as any);

router.post('/', async (req, res) => {
  try {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
    const input = parsed.data as SubmitInput;

    // idempotency: find pending|running created within 30 minutes
    const thirty = new Date(Date.now() - 30 * 60 * 1000);
    const existing = await Submission.findOne({ repoUrl: input.repoUrl, submitterWallet: input.submitterWallet, status: { $in: ['pending','running'] }, createdAt: { $gte: thirty } });
    if (existing) {
      return res.status(200).json({ submissionId: existing._id, note: 'existing_recent_submission' });
    }

    const doc = await Submission.create({ repoUrl: input.repoUrl, demoUrl: input.demoUrl, submitterWallet: input.submitterWallet, mintEvidence: input.mintEvidence || null, status: 'pending' });

    await verifyQueue.add('verify:submission', { submissionId: doc._id.toString() }, { attempts: 3 });

    return res.status(201).json({ submissionId: doc._id });
  } catch (err: any) {
    logger.error({ err }, 'submit route error');
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
