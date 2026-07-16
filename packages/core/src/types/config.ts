import { z } from 'zod';

export const VideoTypeSchema = z.enum(['teaser', 'shorts', 'demo', 'tutorial']);
export type VideoType = z.infer<typeof VideoTypeSchema>;

// What kind of project this is, as classified by AI from the actual source
// (see @demo-video-gen/ai's platform-classifier.ts for the prompt, and
// @demo-video-gen/source's inspector.ts for the deterministic file-based
// hints that ground that classification). Recorded in both
// project-summary.json and scenario.yaml's meta.platform.
//
// Recording itself (Playwright) currently only supports "web" — other
// values are still detected/recorded so the groundwork is in place, and
// `record`/`build` warn (without blocking) if the platform isn't "web".
//
// To add a new platform: add it here, then add a one-line description to
// PLATFORM_DESCRIPTIONS in packages/ai/src/pipeline/platform-classifier.ts
// (and, ideally, a deterministic hint in packages/source/src/inspector.ts).
export const ProjectPlatformSchema = z.enum([
  'web',
  'ios',
  'android',
  'unity',
  'flutter',
  'react-native',
  'desktop',
  'other',
]);
export type ProjectPlatform = z.infer<typeof ProjectPlatformSchema>;

export const ProjectConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

// Where the AI-facing project *source* comes from — this is what `analyze`
// reads (package.json, README, route/page files, platform signals) to
// understand what the app actually does. Recording via Playwright is
// web-only for now (see ProjectPlatformSchema above), but source analysis
// itself already detects and records non-web platforms.
//
// Exactly one of `repository` / `localPath` must be set:
//   - repository: a git remote (https:// or git@ form). Shallow-cloned into
//     `<workDir>/source-repo`.
//   - localPath: a path to a project that's already checked out locally
//     (must itself be a git repository — this is not "any folder").
export const SourceConfigSchema = z
  .object({
    repository: z.string().optional(),
    localPath: z.string().optional(),
    ref: z.string().optional(), // branch / tag / commit; only meaningful with `repository`
    installDeps: z.boolean().default(false),
    // Command to start the app's dev server, run from the source root
    // (e.g. "npm run dev", "pnpm dev"). If set, `record`/`build` will
    // automatically run it (installing deps first if `installDeps` is
    // true) whenever `target.url` isn't already reachable, instead of
    // requiring you to start it yourself in another terminal. Left unset
    // by default — `analyze` will suggest one it detects from
    // package.json's scripts (prefers "dev", falls back to "start") and
    // save it into dvg.config.yaml for you to confirm/edit.
    startCommand: z.string().optional(),
  })
  .refine((data) => Boolean(data.repository) !== Boolean(data.localPath), {
    message: 'Specify exactly one of source.repository or source.localPath, not both/neither.',
  });
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

// Where the app can actually be reached once it's running, so Playwright can
// record it. This is NOT the source location — you still need to start the
// dev server yourself (e.g. `npm run dev`) before `record`/`build` run.
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

// LLM providers. 'ollama' runs fully local via the Ollama daemon (see Taskfile `install`/`serve`).
export const LlmProviderNameSchema = z.enum(['gemini', 'openai', 'claude', 'groq', 'ollama']);
export type LlmProviderName = z.infer<typeof LlmProviderNameSchema>;

// Per-task override: analyze (understanding source code, extracting
// features) and scenario (generating the recording plan) are quite
// different tasks — some models are good at one and not the other. Falls
// back to the top-level provider/model/apiKeyEnv when a field is omitted.
export const LlmTaskOverrideSchema = z.object({
  provider: LlmProviderNameSchema.optional(),
  model: z.string().optional(),
  apiKeyEnv: z.string().optional(),
});
export type LlmTaskOverride = z.infer<typeof LlmTaskOverrideSchema>;

export const LlmConfigSchema = z.object({
  // Primary provider used for analyze/scenario generation, unless
  // overridden per-task below.
  provider: LlmProviderNameSchema.default('gemini'),
  model: z.string().default('gemini-2.5-pro'),
  apiKeyEnv: z.string().optional(),

  // Ollama-specific connection settings (used when provider === 'ollama',
  // or as the fallback target when fallbackProvider === 'ollama').
  ollamaHost: z.string().url().default('http://localhost:11434'),

  // Optional fallback provider: if the primary provider's call fails
  // (network error, missing API key, rate limit, model not pulled, etc.)
  // the fallback provider is transparently used instead. This is how
  // Gemini and a local Ollama model can be used together: e.g. provider:
  // ollama (free, offline) with fallbackProvider: gemini (higher quality,
  // needs network + API key), or the other way around.
  fallbackProvider: LlmProviderNameSchema.optional(),
  fallbackModel: z.string().optional(),
  fallbackApiKeyEnv: z.string().optional(),

  // Optional per-task overrides — e.g. a smaller/faster model is often
  // fine for `analyze` (mostly extraction/classification), while
  // `scenario generate` (structured multi-scene JSON) benefits from a
  // stronger model. Unset fields fall back to the top-level
  // provider/model/apiKeyEnv above.
  tasks: z
    .object({
      analyze: LlmTaskOverrideSchema.optional(),
      scenario: LlmTaskOverrideSchema.optional(),
    })
    .optional(),
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
  source: SourceConfigSchema,
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
