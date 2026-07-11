import { Scenario, ScenarioSchema, Script, ScriptSchema, VideoConfig, ProjectSummary, logger } from '@demo-video-gen/core';
import { LlmProvider } from '../llm/provider.js';

const SYSTEM_PROMPT = `You are a video director creating promotional demo videos.
Generate a scenario for a web application demo.

Rules:
- Use ONLY these action types: goto, click, type, wait_visible, wait, scroll, hover, screenshot
- For "goto" actions, ONLY use the exact URLs provided in the feature list below (which are
  already the real target URL + a real discovered route). Never invent or guess a URL.
- For click/type/hover: prefer "text" or "label" over "selector". Never use CSS class selectors.
- For wait_visible: use "text" (visible text on screen) or "selector" (data-testid preferred)
- Keep narration concise and engaging (1-2 sentences per scene)
- Scene durations should sum to approximately the target duration

Respond ONLY with valid JSON matching:
{
  scenario: { meta: ScenarioMeta, scenes: Scene[] },
  script: { scenes: ScriptScene[] }
}
No markdown, no explanation. JSON only.`;

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

For the script, distribute startTime/endTime based on estimated narration length (~3 words/sec).
Voice files follow pattern: voice/scene-{id}.wav

Respond with JSON only.`;

    const raw = await this.llm.generateJson<{ scenario: unknown; script: unknown }>(
      prompt,
      SYSTEM_PROMPT,
    );

    const scenario = ScenarioSchema.parse(raw.scenario);
    const script = ScriptSchema.parse(raw.script);

    return { scenario, script };
  }
}

function resolveFeatureUrl(baseUrl: string, route?: string): string {
  if (!route || route === '/') return baseUrl + '/';
  return baseUrl + (route.startsWith('/') ? route : `/${route}`);
}
