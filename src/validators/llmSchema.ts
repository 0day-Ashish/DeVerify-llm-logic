import { z } from 'zod';

export const llmRespSchema = z.object({
  score: z.number().int().min(0).max(10),
  confidence: z.enum(['low','medium','high']),
  explanation: z.string().max(500),
  reasons: z.array(z.string()).max(6),
  flags: z.array(z.string())
});

export type LLMResp = z.infer<typeof llmRespSchema>;
