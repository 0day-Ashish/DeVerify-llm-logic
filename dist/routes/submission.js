"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const submission_1 = __importDefault(require("../models/submission"));
const logger_1 = require("../lib/logger");
const router = express_1.default.Router();
router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const doc = await submission_1.default.findById(id).lean();
        if (!doc)
            return res.status(404).json({ error: 'not_found' });
        // redact long logs
        if (doc.llm && doc.llm.raw && doc.llm.raw.length > 8000) {
            doc.llm.raw = doc.llm.raw.slice(0, 8000) + '...[redacted]';
        }
        // remove secrets if flagged
        if (doc.flags && doc.flags.includes('secrets-detected')) {
            // naive redaction
            if (doc.github && doc.github.readme)
                doc.github.readme = doc.github.readme.replace(/(?<=[\w-])([A-Za-z0-9_\-]{8,})/g, '[REDACTED]');
        }
        return res.json(doc);
    }
    catch (err) {
        logger_1.logger.error({ err }, 'submission get error');
        return res.status(500).json({ error: 'internal_error' });
    }
});
exports.default = router;
