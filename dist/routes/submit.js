"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const submitSchema_1 = require("../validators/submitSchema");
const submission_1 = require("../models/submission");
const bullmq_1 = require("bullmq");
const config_1 = require("../config");
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../lib/logger");
const router = express_1.default.Router();
// create a queue
const connection = new ioredis_1.default(config_1.config.redisUrl, { maxRetriesPerRequest: null });
const verifyQueue = new bullmq_1.Queue('verify', { connection });
router.post('/', async (req, res) => {
    try {
        const parsed = submitSchema_1.submitSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.errors });
        const input = parsed.data;
        // idempotency: find pending|running created within 30 minutes
        const thirty = new Date(Date.now() - 30 * 60 * 1000);
        const existing = await submission_1.Submission.findOne({ repoUrl: input.repoUrl, submitterWallet: input.submitterWallet, status: { $in: ['pending', 'running'] }, createdAt: { $gte: thirty } });
        if (existing) {
            return res.status(200).json({ submissionId: existing._id, note: 'existing_recent_submission' });
        }
        const doc = await submission_1.Submission.create({ repoUrl: input.repoUrl, demoUrl: input.demoUrl, submitterWallet: input.submitterWallet, mintEvidence: input.mintEvidence || null, status: 'pending' });
        await verifyQueue.add('verify:submission', { submissionId: doc._id.toString() }, { attempts: 3 });
        return res.status(201).json({ submissionId: doc._id });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'submit route error');
        return res.status(500).json({ error: 'internal_error' });
    }
});
exports.default = router;
