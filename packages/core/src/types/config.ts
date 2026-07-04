import { z } from 'zod';

export const VideoTypeSchema = z.enum(['teaser', 'shorts', 'demo', 'tutorial']);
export type VideoType = z.infer<typeof VideoTypeSchema>;

export const ProjectConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const TargetConfigSchema = z.object({
  url: z.string().url(),
  type: z.enum(['web', 'cli']).default('web'),
  credentials: z.record(z.string()).optional(),
});

export const VideoConfigSchema = z.object({
  type: VideoTypeSchema.default('demo'),
  duration: z.number().int().positive().default(60),
  resolution: z.enum(['1920x1080', '1280x720', '1080x1920']).default('1920x1080'),
  fps: z.union([z.literal(30), z.literal(60)]).default(30),
  language: z.string().default('ja'),
});

export const LlmConfigSchema = z.object({
  provider: z.enum(['gemini', 'openai', 'claude', 'groq', 'ollama']).default('gemini'),
  model: z.string().default('gemini-2.5-pro'),
  apiKeyEnv: z.string().optional(),
});

export const VoicevoxConfigSchema = z.object({
  host: z.string().url().default('http://localhost:50021'),
  speakerId: z.number().int().nonnegative().default(3),
});

export const OutputConfigSchema = z.object({
  dir: z.string().default('./output'),
  workDir: z.string().default('./.dvg'),
});

export const DvgConfigSchema = z.object({
  project: ProjectConfigSchema,
  target: TargetConfigSchema,
  video: VideoConfigSchema.default({}),
  llm: LlmConfigSchema.default({}),
  voicevox: VoicevoxConfigSchema.default({}),
  output: OutputConfigSchema.default({}),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type TargetConfig = z.infer<typeof TargetConfigSchema>;
export type VideoConfig = z.infer<typeof VideoConfigSchema>;
export type LlmConfig = z.infer<typeof LlmConfigSchema>;
export type VoicevoxConfig = z.infer<typeof VoicevoxConfigSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type DvgConfig = z.infer<typeof DvgConfigSchema>;
