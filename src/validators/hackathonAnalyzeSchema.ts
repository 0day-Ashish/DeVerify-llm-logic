import { z } from 'zod';

export const hackathonAnalyzeSchema = z.object({
  hackathonUrl: z.string().url(),
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
  limit: z.number().int().min(1).max(200).optional()
});

export type HackathonAnalyzeInput = z.infer<typeof hackathonAnalyzeSchema>;
