import { z } from 'zod';
import { VideoTypeSchema } from './config.js';

export const FeatureSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  demoable: z.boolean(),
  priority: z.enum(['high', 'medium', 'low']),
});

export const ProjectSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  features: z.array(FeatureSchema),
  targetAudience: z.string(),
  keyValueProps: z.array(z.string()),
  suggestedVideoTypes: z.array(VideoTypeSchema),
  analyzedAt: z.string().default(() => new Date().toISOString()),
});

export type Feature = z.infer<typeof FeatureSchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
