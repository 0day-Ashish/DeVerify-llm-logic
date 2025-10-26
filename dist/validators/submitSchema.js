"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitSchema = exports.mintEvidenceSchema = void 0;
const zod_1 = require("zod");
exports.mintEvidenceSchema = zod_1.z.object({
    chain: zod_1.z.enum(['alfajores', 'celo']).optional(),
    contractAddress: zod_1.z.string().optional(),
    txHash: zod_1.z.string().optional(),
    tokenId: zod_1.z.string().optional(),
    tokenURI: zod_1.z.string().nullable().optional()
}).optional();
exports.submitSchema = zod_1.z.object({
    repoUrl: zod_1.z.string().url().refine((v) => v.includes('github.com'), { message: 'repoUrl must be a github.com URL' }),
    demoUrl: zod_1.z.string().url().optional(),
    submitterWallet: zod_1.z.string().optional(),
    mintEvidence: exports.mintEvidenceSchema
});
