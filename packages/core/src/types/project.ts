import { z } from 'zod';
import { VideoTypeSchema, ProjectPlatformSchema } from './config.js';
import { SetupStepSchema } from './scenario.js';

export const FeatureSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  // URL path this feature lives at, e.g. "/dashboard/settings" — discovered
  // from the project's route/page files where possible (see
  // @auto-product-video-generator/source), otherwise inferred by the AI. Combined with
  // `target.url` at scenario-generation time to produce a real `goto` URL.
  // Only meaningful for platform: "web"; other platforms may leave this unset.
  route: z.string().optional(),
  // Exact documented command used to demonstrate a CLI feature.
  command: z.string().min(1).optional(),
  demoable: z.boolean(),
  priority: z.enum(['high', 'medium', 'low']),
});

export const ProjectSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  // AI-classified from the actual source — see
  // @auto-product-video-generator/ai's platform-classifier.ts.
  platform: ProjectPlatformSchema,
  // AI-generated "how to get this project running" plan (install deps,
  // start the dev server, ...), grounded by package.json scripts / README /
  // platform signals — see @auto-product-video-generator/ai's analyzer.ts. Copied
  // verbatim into scenario.yml's `setup` field when the scenario is
  // generated (not re-decided there), so project-summary.json and
  // scenario.yml always agree. Can be empty if nothing could be
  // determined — `record`/`build` fall back to apvg.config.yml's
  // source.startCommand or manual startup in that case.
  setupSteps: z.array(SetupStepSchema).default([]),
  features: z.array(FeatureSchema),
  targetAudience: z.string(),
  keyValueProps: z.array(z.string()),
  suggestedVideoTypes: z.array(VideoTypeSchema),
  analyzedAt: z.string().default(() => new Date().toISOString()),
});

export type Feature = z.infer<typeof FeatureSchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
