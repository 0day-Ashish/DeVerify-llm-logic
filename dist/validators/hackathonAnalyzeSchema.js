"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hackathonAnalyzeSchema = void 0;
const zod_1 = require("zod");
exports.hackathonAnalyzeSchema = zod_1.z.object({
    hackathonUrl: zod_1.z.string().url(),
    startIso: zod_1.z.string().datetime(),
    endIso: zod_1.z.string().datetime(),
    limit: zod_1.z.number().int().min(1).max(200).optional()
});
