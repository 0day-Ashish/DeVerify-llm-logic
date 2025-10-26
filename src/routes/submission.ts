import express from 'express';
import Submission from '../models/submission';
import { logger } from '../lib/logger';

const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const doc: any = await Submission.findById(id).lean();
    if (!doc) return res.status(404).json({ error: 'not_found' });

    // redact long logs
    if (doc.llm && doc.llm.raw && doc.llm.raw.length > 8000) {
      doc.llm.raw = doc.llm.raw.slice(0, 8000) + '...[redacted]';
    }

    // remove secrets if flagged
    if (doc.flags && doc.flags.includes('secrets-detected')) {
      // naive redaction
      if (doc.github && doc.github.readme) doc.github.readme = doc.github.readme.replace(/(?<=[\w-])([A-Za-z0-9_\-]{8,})/g, '[REDACTED]');
    }

    return res.json(doc);
  } catch (err: any) {
    logger.error({ err }, 'submission get error');
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
