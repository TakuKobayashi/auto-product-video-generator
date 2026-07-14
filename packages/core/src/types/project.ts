import { z } from 'zod';
import { VideoTypeSchema, ProjectPlatformSchema } from './config.js';

export const FeatureSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  // URL path this feature lives at, e.g. "/dashboard/settings" — discovered
  // from the project's route/page files where possible (see
  // @demo-video-gen/source), otherwise inferred by the AI. Combined with
  // `target.url` at scenario-generation time to produce a real `goto` URL.
  // Only meaningful for platform: "web"; other platforms may leave this unset.
  route: z.string().optional(),
  demoable: z.boolean(),
  priority: z.enum(['high', 'medium', 'low']),
});

export const ProjectSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  // AI-classified from the actual source — see
  // @demo-video-gen/ai's platform-classifier.ts.
  platform: ProjectPlatformSchema,
  features: z.array(FeatureSchema),
  targetAudience: z.string(),
  keyValueProps: z.array(z.string()),
  suggestedVideoTypes: z.array(VideoTypeSchema),
  analyzedAt: z.string().default(() => new Date().toISOString()),
});

export type Feature = z.infer<typeof FeatureSchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
