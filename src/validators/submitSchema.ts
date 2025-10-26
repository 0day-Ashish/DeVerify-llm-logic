import { z } from 'zod';

export const mintEvidenceSchema = z.object({
  chain: z.enum(['alfajores','celo']).optional(),
  contractAddress: z.string().optional(),
  txHash: z.string().optional(),
  tokenId: z.string().optional(),
  tokenURI: z.string().nullable().optional()
}).optional();

export const submitSchema = z.object({
  repoUrl: z.string().url().refine((v) => v.includes('github.com'), { message: 'repoUrl must be a github.com URL' }),
  demoUrl: z.string().url().optional(),
  submitterWallet: z.string().optional(),
  mintEvidence: mintEvidenceSchema
});

export type SubmitInput = z.infer<typeof submitSchema>;
