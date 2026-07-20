import {
  Scenario,
  ScenarioSchema,
  Script,
  VideoConfig,
  ProjectSummary,
  logger,
  withHeartbeat,
} from '@demo-video-gen/core';
import { LlmProvider } from '../llm/provider.js';
import { generateValidatedJson } from '../utils/validated-json.js';
import { buildScriptFromScenario } from './script-builder.js';

// Every action type gets a concrete example here, not just a name — smaller
// models are much more reliable when shown the exact required fields for
// each type than when given a prose description. "scroll" and "screenshot"
// especially: earlier prompt revisions that only *named* these types (no
// example) reliably produced invalid JSON for them (missing
// direction/amount, missing name).
const SYSTEM_PROMPT = `You are a video director creating promotional demo videos.
Generate a scenario (the recording plan) for a web application demo.

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

Prefer goto / click / type / wait_visible / wait for almost everything — they
cover most demos. Only reach for scroll or screenshot when truly needed, and
when you do, include EVERY field shown in their example below (both are
required for scroll; "name" is required for screenshot):

- {"type":"goto","url":"https://example.com/page"}
- {"type":"click","text":"Sign up"}                         (or "label" or "selector" instead of "text")
- {"type":"type","label":"Email","value":"user@example.com"}
- {"type":"wait_visible","text":"Dashboard","timeout":5000}  ("timeout" optional)
- {"type":"wait","ms":1000}
- {"type":"scroll","direction":"down","amount":300}          (direction and amount are BOTH REQUIRED)
- {"type":"hover","text":"Settings"}
- {"type":"screenshot","name":"final-view"}                  ("name" is REQUIRED)

For click/type/hover: prefer "text" or "label" over "selector". Never use CSS
class selectors.

For "goto" actions, ONLY use the exact URLs given to you in the feature list
below (already the real target URL + a real discovered route). Never invent
or guess a URL.

## Full example (structure only — use the real project's own content)

{
  "meta": {"title": "Acme Demo", "description": "A quick tour of Acme", "type": "demo", "duration": 45, "language": "ja"},
  "scenes": [
    {"id": "intro", "title": "Intro", "narration": "Acmeへようこそ。", "actions": [{"type":"goto","url":"https://example.com/"}]},
    {"id": "feature", "title": "Feature", "narration": "ダッシュボードでタスクを管理できます。", "actions": [{"type":"goto","url":"https://example.com/dashboard"},{"type":"wait_visible","text":"Dashboard"},{"type":"click","text":"New Task"}]}
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
    const highPriorityFeatures = summary.features
      .filter((f) => f.priority === 'high')
      .map((f) => `- ${f.title}: ${f.description}\n  URL: ${resolveFeatureUrl(baseUrl, f.route)}`)
      .join('\n');

    const prompt = `Create a ${config.type} promotional video scenario.

Project: ${summary.name}
Description: ${summary.description}
Target audience: ${summary.targetAudience}
Key value props:
${summary.keyValueProps.map((v) => `- ${v}`).join('\n')}

High-priority features to demonstrate (each with its real URL — use these exact URLs for goto actions):
${highPriorityFeatures || `- (no high-priority features identified; use ${baseUrl} as a general intro)`}

App base URL: ${baseUrl}
Video type: ${config.type}
Target duration: ~${config.duration} seconds
Language: ${config.language}

The FIRST scene's first action must be a "goto" to ${baseUrl}. Subsequent scenes that
demonstrate a specific feature should "goto" that feature's URL from the list above.
Remember: at most 5 scenes total.

Respond with JSON only — just the scenario object, no "script" field, no other wrapping.`;

    logger.info(`  Calling ${describeProvider(this.llm)}... this can take a while, especially on local models.`);

    const scenario = await withHeartbeat(
      'scenario generation',
      generateValidatedJson<Scenario>(this.llm, ScenarioSchema, prompt, SYSTEM_PROMPT, {
        label: 'scenario',
        maxRetries: 3,
        repair: repairCommonActionMistakes,
      }),
    );

    // The platform and setup plan were already determined,
    // deterministically-grounded, in `analyze` (see platform-classifier.ts
    // and setup-planner.ts) — stamp them here rather than letting this LLM
    // call re-decide them, so scenario.yaml always agrees with
    // project-summary.json.
    scenario.meta.platform = summary.platform;
    scenario.setup = summary.setupSteps;

    // script.yaml is derived deterministically from scenario.yaml's
    // narration text — no second LLM call, no risk of the two disagreeing.
    const script = buildScriptFromScenario(scenario);

    logger.success(
      `Scenario generated: platform=${scenario.meta.platform}, ${scenario.setup.length} setup step(s), ` +
      `${scenario.scenes.length} scene(s).`,
    );
    return { scenario, script };
  }
}

function resolveFeatureUrl(baseUrl: string, route?: string): string {
  if (!route || route === '/') return baseUrl + '/';
  return baseUrl + (route.startsWith('/') ? route : `/${route}`);
}

function describeProvider(llm: LlmProvider): string {
  // LlmProvider doesn't expose its name/model directly; this is best-effort
  // for a friendlier log line and falls back gracefully.
  return (llm as { constructor?: { name?: string } }).constructor?.name ?? 'LLM';
}

/**
 * Fixes a small set of known-safe, common near-misses in generated action
 * JSON before validation — cosmetic defaults only, never anything that
 * changes an action's meaning. This is specifically for the two action
 * types that models most often get wrong in practice: "scroll" (missing
 * direction/amount) and "screenshot" (missing name). Anything else is left
 * untouched and, if invalid, still goes through the normal retry-with-
 * feedback path in generateValidatedJson.
 */
function repairCommonActionMistakes(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !('scenes' in raw)) return raw;

  const scenes = (raw as { scenes: unknown }).scenes;
  if (!Array.isArray(scenes)) return raw;

  let sceneIndex = 0;
  for (const scene of scenes) {
    sceneIndex++;
    if (typeof scene !== 'object' || scene === null || !('actions' in scene)) continue;

    const actions = (scene as { actions: unknown }).actions;
    if (!Array.isArray(actions)) continue;

    let actionIndex = 0;
    for (const action of actions) {
      actionIndex++;
      if (typeof action !== 'object' || action === null) continue;
      const a = action as Record<string, unknown>;

      if (a.type === 'scroll') {
        if (a.direction !== 'up' && a.direction !== 'down') a.direction = 'down';
        if (typeof a.amount !== 'number' || a.amount <= 0) a.amount = 300;
      } else if (a.type === 'screenshot') {
        if (typeof a.name !== 'string' || a.name.trim() === '') {
          a.name = `scene-${sceneIndex}-shot-${actionIndex}`;
        }
      }
    }
  }

  return raw;
}
