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

const SYSTEM_PROMPT = `You are a video director creating promotional demo videos.
Generate a scenario (the recording plan) for a web application demo.

Rules:
- scene "id" fields MUST be strings (e.g. "intro", "feature-1"), never numbers.
- Use ONLY these action types: goto, click, type, wait_visible, wait, scroll, hover, screenshot
- For "goto" actions, ONLY use the exact URLs provided in the feature list below (which are
  already the real target URL + a real discovered route). Never invent or guess a URL.
- For click/type/hover: prefer "text" or "label" over "selector". Never use CSS class selectors.
- For wait_visible: use "text" (visible text on screen) or "selector" (data-testid preferred)
- Every scene needs a non-empty "title" and "narration".
- Keep narration concise and engaging (1-2 sentences per scene)
- Keep the TOTAL number of scenes reasonable for the target duration — roughly one scene per
  10-15 seconds of video is plenty; don't create more scenes than that, since more scenes
  means more chances for something to go wrong.

Respond ONLY with valid JSON matching:
{ meta: ScenarioMeta, scenes: Scene[] }
No markdown, no explanation, no extra top-level fields. JSON only.`;

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

Respond with JSON only — just the scenario object, no "script" field, no other wrapping.`;

    logger.info(`  Calling ${describeProvider(this.llm)}... this can take a while, especially on local models.`);

    const scenario = await withHeartbeat(
      'scenario generation',
      generateValidatedJson<Scenario>(this.llm, ScenarioSchema, prompt, SYSTEM_PROMPT, {
        label: 'scenario',
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
