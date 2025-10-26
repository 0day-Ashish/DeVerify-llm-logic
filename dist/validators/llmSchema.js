"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmRespSchema = void 0;
const zod_1 = require("zod");
exports.llmRespSchema = zod_1.z.object({
    score: zod_1.z.number().int().min(0).max(10),
    confidence: zod_1.z.enum(['low', 'medium', 'high']),
    explanation: zod_1.z.string().max(500),
    reasons: zod_1.z.array(zod_1.z.string()).max(6),
    flags: zod_1.z.array(zod_1.z.string())
});
