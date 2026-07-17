import { z } from 'zod';
import { VideoTypeSchema, ProjectPlatformSchema } from './config.js';

// --- Actions ---

export const GotoActionSchema = z.object({
  type: z.literal('goto'),
  url: z.string().url(),
});

export const ClickActionSchema = z.object({
  type: z.literal('click'),
  text: z.string().optional(),
  selector: z.string().optional(),
  role: z.string().optional(),
  label: z.string().optional(),
});

export const TypeActionSchema = z.object({
  type: z.literal('type'),
  text: z.string().optional(),
  selector: z.string().optional(),
  label: z.string().optional(),
  value: z.string(),
  delay: z.number().int().nonnegative().optional(),
});

export const WaitVisibleActionSchema = z.object({
  type: z.literal('wait_visible'),
  text: z.string().optional(),
  selector: z.string().optional(),
  timeout: z.number().int().positive().optional(),
});

export const WaitActionSchema = z.object({
  type: z.literal('wait'),
  ms: z.number().int().positive(),
});

export const ScrollActionSchema = z.object({
  type: z.literal('scroll'),
  direction: z.enum(['up', 'down']),
  amount: z.number().positive(),
});

export const HoverActionSchema = z.object({
  type: z.literal('hover'),
  text: z.string().optional(),
  selector: z.string().optional(),
  label: z.string().optional(),
});

export const ScreenshotActionSchema = z.object({
  type: z.literal('screenshot'),
  name: z.string(),
});

export const ActionSchema = z.discriminatedUnion('type', [
  GotoActionSchema,
  ClickActionSchema,
  TypeActionSchema,
  WaitVisibleActionSchema,
  WaitActionSchema,
  ScrollActionSchema,
  HoverActionSchema,
  ScreenshotActionSchema,
]);

// --- Effects ---

export const ZoomEffectSchema = z.object({
  type: z.enum(['zoom_in', 'zoom_out']),
  factor: z.number().positive(),
  duration: z.number().positive(),
});

export const PanEffectSchema = z.object({
  type: z.literal('pan'),
  direction: z.enum(['left', 'right', 'up', 'down']),
  amount: z.number().positive(),
  duration: z.number().positive(),
});

export const SpeedEffectSchema = z.object({
  type: z.literal('speed'),
  factor: z.number().positive(),
});

export const HighlightEffectSchema = z.object({
  type: z.literal('highlight'),
  selector: z.string(),
  color: z.string().optional(),
});

export const FadeEffectSchema = z.object({
  type: z.enum(['fade_in', 'fade_out']),
  duration: z.number().positive(),
});

export const EffectSchema = z.discriminatedUnion('type', [
  ZoomEffectSchema,
  PanEffectSchema,
  SpeedEffectSchema,
  HighlightEffectSchema,
  FadeEffectSchema,
]);

// --- Scene & Scenario ---

export const SceneSchema = z.object({
  id: z.string(),
  title: z.string(),
  narration: z.string(),
  duration: z.number().positive().optional(),
  actions: z.array(ActionSchema).default([]),
  effects: z.array(EffectSchema).optional(),
});

export const ScenarioMetaSchema = z.object({
  title: z.string(),
  description: z.string().default(''),
  type: VideoTypeSchema,
  // What kind of project this recording plan is for (web/ios/android/...).
  // Recording (Playwright) currently only supports "web" — `record`/`build`
  // print a warning (without blocking) for any other value, since the
  // corresponding recorder doesn't exist yet. Defaults to "web" for
  // scenario.yaml files written before this field existed.
  platform: ProjectPlatformSchema.default('web'),
  duration: z.number().int().positive(),
  language: z.string().default('ja'),
  createdAt: z.string().default(() => new Date().toISOString()),
});

// One step of the "how to get this project running" plan — a Taskfile-like
// ordered command list, AI-generated during `analyze` (grounded by
// package.json scripts, README, and the platform classification) and
// recorded here so scenario.yaml is a fully self-contained execution plan:
// everything needed to go from a fresh checkout to a recording, not just
// what to click once something is already running.
//
// Steps run in array order. A non-background step (e.g. "npm install")
// blocks until it exits; a background step (e.g. "npm run dev") is started
// detached and, if `readyUrl` is set, polled until reachable before moving
// on to the next step / to recording.
export const SetupStepSchema = z.object({
  name: z.string(), // human-readable label, e.g. "Install dependencies"
  command: z.string(), // shell command, e.g. "npm install" or "npm run dev"
  cwd: z.string().optional(), // relative to the project root; default "."
  background: z.boolean().default(false), // true for long-running processes (dev servers)
  readyUrl: z.string().url().optional(), // only meaningful when background: true
  readyTimeoutMs: z.number().int().positive().default(60000),
});

export const ScenarioSchema = z.object({
  meta: ScenarioMetaSchema,
  // Ordered setup/start commands — see SetupStepSchema above. Empty by
  // default so scenario.yaml files from before this field existed still
  // validate; `record`/`build` fall back to dvg.config.yaml's
  // source.startCommand (or manual startup) when this is empty.
  setup: z.array(SetupStepSchema).default([]),
  scenes: z.array(SceneSchema).min(1),
});

// --- Script ---

export const ScriptSceneSchema = z.object({
  id: z.string(),
  narration: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  voiceFile: z.string(),
});

export const ScriptSchema = z.object({
  scenes: z.array(ScriptSceneSchema),
});

// Types
export type GotoAction = z.infer<typeof GotoActionSchema>;
export type ClickAction = z.infer<typeof ClickActionSchema>;
export type TypeAction = z.infer<typeof TypeActionSchema>;
export type WaitVisibleAction = z.infer<typeof WaitVisibleActionSchema>;
export type WaitAction = z.infer<typeof WaitActionSchema>;
export type ScrollAction = z.infer<typeof ScrollActionSchema>;
export type HoverAction = z.infer<typeof HoverActionSchema>;
export type ScreenshotAction = z.infer<typeof ScreenshotActionSchema>;
export type Action = z.infer<typeof ActionSchema>;

export type ZoomEffect = z.infer<typeof ZoomEffectSchema>;
export type PanEffect = z.infer<typeof PanEffectSchema>;
export type SpeedEffect = z.infer<typeof SpeedEffectSchema>;
export type HighlightEffect = z.infer<typeof HighlightEffectSchema>;
export type FadeEffect = z.infer<typeof FadeEffectSchema>;
export type Effect = z.infer<typeof EffectSchema>;

export type Scene = z.infer<typeof SceneSchema>;
export type ScenarioMeta = z.infer<typeof ScenarioMetaSchema>;
export type SetupStep = z.infer<typeof SetupStepSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScriptScene = z.infer<typeof ScriptSceneSchema>;
export type Script = z.infer<typeof ScriptSchema>;
