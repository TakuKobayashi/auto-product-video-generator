import {
  Scenario,
  ScenarioSchema,
  Script,
  VideoConfig,
  ProjectSummary,
  isConcreteWebRoute,
  isSafeCliCommand,
  logger,
  withHeartbeat,
} from '@auto-product-video-generator/core';
import { LlmProvider } from '../llm/provider.js';
import { generateValidatedJson } from '../utils/validated-json.js';
import { buildScriptFromScenario } from './script-builder.js';
import { SCENARIO_OUTPUT_SCHEMA } from './output-schemas.js';

const DEFAULT_AUDIENCE =
  'General, non-technical viewers who want to understand how to use the product';

// Every action type gets a concrete example here, not just a name — smaller
// models are much more reliable when shown the exact required fields for
// each type than when given a prose description. "scroll" and "screenshot"
// especially: earlier prompt revisions that only *named* these types (no
// example) reliably produced invalid JSON for them (missing
// direction/amount, missing name).
const SYSTEM_PROMPT = `You are a video director creating promotional demo videos.
Generate a scenario (the recording plan) for a web application or command-line product demo.

## Audience and editorial goal

This is a product-usage video for non-engineers. Show what the viewer can do,
how they move through the product, and why it is useful. Use friendly everyday
language. Do NOT discuss or name implementation details such as frameworks,
programming languages, App Router, TypeScript, Cloudflare, Workers, Hono, APIs,
serverless, frontend/backend, runtime, deployment, static generation, databases,
or architecture. Source-code details are evidence for understanding the product,
not promotional content. Every narration sentence must describe a visible action,
user outcome, use case, or benefit.

Respond ONLY with valid JSON matching this exact shape — no markdown, no
explanation, no extra top-level fields, JSON only:

{
  "meta": {
    "title": "string",
    "description": "string",
    "type": "teaser" | "shorts" | "demo" | "tutorial",
    "duration": number,
    "language": "string"
  },
  "scenes": [ /* Scene objects, see below */ ]
}

## Scene shape

Each scene: { "id": "string", "title": "string", "narration": "string", "actions": [ /* Action objects */ ] }
- "id" MUST be a string (e.g. "intro", "feature-1"), NEVER a number.
- "title" and "narration" are REQUIRED and must be non-empty.
- narration: 1-2 concise, engaging sentences.
- Generate AT MOST 5 scenes total, no matter the target duration. Fewer,
  well-chosen scenes are better than many — every extra scene is another
  chance for something in this JSON to come out wrong.

## Action types — use ONLY these, and copy the exact field names shown

For web projects, the feature list provides verified URLs, but it does NOT
provide verified UI text, labels, selectors, or form fields. Therefore use
ONLY goto / wait / scroll / screenshot. For CLI projects, use ONLY
run_command / wait / screenshot. NEVER generate click, type, hover, or
wait_visible unless the prompt explicitly gives you the exact visible UI text
or selector. Guessing translated labels such as "トップページ" or generic
labels such as "Previous" will make the recording fail.

- {"type":"goto","url":"https://example.com/page"}
- {"type":"wait","ms":1000}
- {"type":"scroll","direction":"down","amount":300}          (direction and amount are BOTH REQUIRED)
- {"type":"screenshot","name":"final-view"}                  ("name" is REQUIRED)
- {"type":"run_command","command":"my-tool --help"}          (CLI projects only; command is REQUIRED)

For "goto" actions, ONLY use the exact URLs given to you in the feature list
below (already the real target URL + a real discovered route). Never invent
or guess a URL.

## Full example (structure only — use the real project's own content)

{
  "meta": {"title": "Acme Demo", "description": "A quick tour of Acme", "type": "demo", "duration": 45, "language": "ja"},
  "scenes": [
    {"id": "intro", "title": "Intro", "narration": "Acmeへようこそ。", "actions": [{"type":"goto","url":"https://example.com/"}]},
    {"id": "feature", "title": "Feature", "narration": "制作実績を一覧で確認し、興味のある内容を詳しく見られます。", "actions": [{"type":"goto","url":"https://example.com/projects"},{"type":"wait","ms":800},{"type":"scroll","direction":"down","amount":300}]}
  ]
}`;

export class ScenarioGenerator {
  constructor(private llm: LlmProvider) {}

  async generate(
    summary: ProjectSummary,
    config: VideoConfig,
    targetUrl: string,
  ): Promise<{ scenario: Scenario; script: Script }> {
    logger.step('scenario', `Generating ${config.type} scenario via LLM...`);

    const baseUrl = targetUrl.replace(/\/$/, '');
    const isCli = summary.platform === 'cli';
    const demoableFeatures = summary.features
      .filter((f) => f.demoable && (isCli ? Boolean(f.command) : isConcreteWebRoute(f.route)))
      .map((f) => isCli
        ? `- ${f.title}: ${f.description}\n  Command: ${f.command}`
        : `- ${f.title}: ${f.description}\n  URL: ${resolveFeatureUrl(baseUrl, f.route)}`)
      .join('\n');
    const prompt = `Create a ${config.type} promotional video scenario.

Project: ${summary.name}
Description: ${summary.description}
Target audience: ${summary.targetAudience}
Key value props:
${summary.keyValueProps.map((v) => `- ${v}`).join('\n')}

Features to demonstrate${isCli ? '' : ' (each with its verified URL — use only these URLs for goto actions)'}:
${demoableFeatures || (isCli
    ? '- (no documented CLI commands were identified; use a safe --help command)'
    : `- (no demoable features identified; use ${baseUrl} as a general intro)`)}

App base URL: ${baseUrl}
Video type: ${config.type}
Target duration: ~${config.duration} seconds
Language: ${config.language}
Intended audience: ${DEFAULT_AUDIENCE}

Editorial direction:
- Introduce the product through realistic user tasks and visible screens.
- Explain what the viewer can accomplish and the benefit they receive.
- Assume the viewer has no software-development knowledge.
- Never mention implementation technology, technical specifications, or source-code structure.

${isCli
    ? 'This is a CLI project. Use only the exact commands listed above. Commands must be finite and read-only, ending in --help or --version. Never publish, authenticate, expose secrets/environment variables, modify files, start a server/watcher, or generate/record/render media. Do not use goto, click, type, scroll, hover, or mobile actions.'
    : `The FIRST scene's first action must be a "goto" to ${baseUrl}. Subsequent scenes that
demonstrate a specific feature should "goto" that feature's URL from the list above.`}
Remember: at most 5 scenes total.

Respond with JSON only — just the scenario object, no "script" field, no other wrapping.`;

    logger.info(`  Calling ${describeProvider(this.llm)}... this can take a while, especially on local models.`);

    const scenario = await withHeartbeat(
      'scenario generation',
      generateValidatedJson<Scenario>(this.llm, PromotionalScenarioSchema, prompt, SYSTEM_PROMPT, {
        label: 'scenario',
        maxRetries: 3,
        jsonSchema: SCENARIO_OUTPUT_SCHEMA,
      }),
    );

    // The platform and setup plan were already determined,
    // deterministically-grounded, in `analyze` (see platform-classifier.ts
    // and setup-planner.ts) — stamp them here rather than letting this LLM
    // call re-decide them, so scenario.yml always agrees with
    // project-summary.json.
    scenario.meta.platform = summary.platform;
    scenario.setup = summary.setupSteps;
    switch (summary.platform) {
      case 'web':
        groundScenarioActions(scenario, summary, baseUrl);
        break;
      case 'cli':
        groundCliScenarioActions(scenario, summary);
        break;
      default:
        groundDeviceScenarioActions(scenario);
    }

    // script.yml is derived deterministically from scenario.yml's
    // narration text — no second LLM call, no risk of the two disagreeing.
    const script = buildScriptFromScenario(scenario, config.sceneGapSeconds);

    logger.success(
      `Scenario generated: platform=${scenario.meta.platform}, ${scenario.setup.length} setup step(s), ` +
      `${scenario.scenes.length} scene(s).`,
    );
    return { scenario, script };
  }
}

function groundCliScenarioActions(scenario: Scenario, summary: ProjectSummary): void {
  const commands = summary.features.flatMap((feature) =>
    feature.command && isSafeCliCommand(feature.command) ? [feature.command] : [],
  );
  const allowed = new Set(commands);
  const fallback = commands[0] || 'npm --help';
  for (const scene of scenario.scenes) {
    scene.actions = scene.actions.filter((action) => {
      if (action.type !== 'run_command') return action.type === 'wait' || action.type === 'screenshot';
      return allowed.size === 0 || allowed.has(action.command);
    });
    if (!scene.actions.some((action) => action.type === 'run_command')) {
      scene.actions.unshift({ type: 'run_command', command: fallback });
    }
  }
}

/**
 * Until source inspection exposes a verified mobile accessibility tree, do
 * not let the LLM guess labels or coordinates. Convert its safe pacing and
 * scrolling intent into Android-executable actions. Users can then enrich
 * scenario.yml with verified tap/input actions before `video record`.
 */
function groundDeviceScenarioActions(scenario: Scenario): void {
  scenario.scenes.forEach((scene, index) => {
    const actions: Scenario['scenes'][number]['actions'] = [];
    if (index === 0) actions.push({ type: 'launch_app' });
    for (const action of scene.actions) {
      if (action.type === 'wait' || action.type === 'screenshot') actions.push(action);
      if (action.type === 'scroll') {
        actions.push(action.direction === 'down'
          ? { type: 'swipe', fromX: 540, fromY: 1500, toX: 540, toY: 500, durationMs: 450 }
          : { type: 'swipe', fromX: 540, fromY: 500, toX: 540, toY: 1500, durationMs: 450 });
      }
    }
    if (!actions.some((action) => action.type === 'wait')) actions.push({ type: 'wait', ms: 800 });
    scene.actions = actions;
  });
  logger.info('[scenario] Generated a conservative device scenario; edit verified tap/input actions in scenario.yml if needed.');
}

const TECHNICAL_TERMS = /\b(?:Next\.js|App Router|TypeScript|JavaScript|React|Cloudflare|Workers?|Hono|API(?:s| routes?)?|serverless|front-?end|back-?end|runtime|framework|deployment|database|architecture|static generation)\b|技術仕様|実装|フレームワーク|プログラミング言語|サーバーレス|アーキテクチャ|静的生成/iu;

const PromotionalScenarioSchema = ScenarioSchema.superRefine((scenario, ctx) => {
  scenario.scenes.forEach((scene, index) => {
    const match = scene.narration.match(TECHNICAL_TERMS);
    if (match) {
      ctx.addIssue({
        code: 'custom',
        path: ['scenes', index, 'narration'],
        message: `Technical term "${match[0]}" is not allowed. Rewrite as a plain user action or benefit.`,
      });
    }
  });
});

/**
 * Enforce executable actions after LLM generation. ProjectSummary currently
 * grounds routes but does not contain DOM text/selectors, so text-dependent
 * actions are unsafe even when they happen to pass schema validation.
 */
function groundScenarioActions(
  scenario: Scenario,
  summary: ProjectSummary,
  baseUrl: string,
): void {
  const featureUrls = summary.features
    .filter((feature) => feature.demoable && isConcreteWebRoute(feature.route))
    .map((feature) => resolveFeatureUrl(baseUrl, feature.route));
  const allowedUrls = new Set([baseUrl, `${baseUrl}/`, ...featureUrls]);
  let removed = 0;

  scenario.scenes.forEach((scene, index) => {
    const safeActions = scene.actions.filter((action) => {
      if (action.type === 'goto') {
        const allowed = allowedUrls.has(action.url);
        if (!allowed) removed++;
        return allowed;
      }
      const safe = action.type === 'wait' || action.type === 'scroll' || action.type === 'screenshot';
      if (!safe) removed++;
      return safe;
    });

    const firstGotoIndex = safeActions.findIndex((action) => action.type === 'goto');
    const existingGoto = firstGotoIndex >= 0 ? safeActions.splice(firstGotoIndex, 1)[0] : undefined;
    const targetUrl = index === 0
      ? `${baseUrl}/`
      : existingGoto?.type === 'goto'
        ? existingGoto.url
        : featureUrls[index % Math.max(featureUrls.length, 1)] || `${baseUrl}/`;
    scene.actions = [
      { type: 'goto', url: targetUrl },
      ...safeActions,
    ];
  });

  if (removed > 0) {
    logger.warn(
      `[scenario] Removed ${removed} ungrounded action(s) that depended on guessed UI text/selectors.`,
    );
  }
}

function resolveFeatureUrl(baseUrl: string, route?: string): string {
  if (!isConcreteWebRoute(route) || route === '/') return baseUrl + '/';
  return baseUrl + (route!.startsWith('/') ? route : `/${route}`);
}

function describeProvider(llm: LlmProvider): string {
  // LlmProvider doesn't expose its name/model directly; this is best-effort
  // for a friendlier log line and falls back gracefully.
  return (llm as { constructor?: { name?: string } }).constructor?.name || 'LLM';
}
