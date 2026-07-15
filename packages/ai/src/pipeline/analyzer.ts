import { ProjectSummary, ProjectSummarySchema, logger, withHeartbeat } from '@demo-video-gen/core';
import { ProjectSourceContext } from '@demo-video-gen/source';
import { LlmProvider } from '../llm/provider.js';
import { generateValidatedJson } from '../utils/validated-json.js';
import { buildPlatformClassificationPrompt } from './platform-classifier.js';
import { buildSetupPlanningPrompt } from './setup-planner.js';

const SYSTEM_PROMPT = `You are a video production expert analyzing a project's source code
to plan a promotional demo video.

You will be given: the project's package.json (name/description/scripts/dependencies),
its README, deterministic platform signals, the detected web framework (if any), and
either a list of discovered routes (URL paths mapped from actual page/route files) or a
general file listing when routes couldn't be auto-discovered.

Respond ONLY with a JSON object matching this TypeScript type:
{
  name: string;
  description: string;
  platform: string;            // REQUIRED. One of the exact platform keys given to you
                                // in the "Platform classification" section below.
  setupSteps: Array<{          // see "Setup plan" section below. Can be an empty array.
    name: string;
    command: string;
    background: boolean;
    readyUrl?: string;
  }>;
  features: Array<{
    id: string;                 // a short slug string, e.g. "dashboard-overview"
    title: string;
    description: string;
    route: string;              // A real URL path from the provided routes list
                                 // (e.g. "/dashboard"), or "/" if no specific route
                                 // applies. Never invent a route that wasn't given to
                                 // you. Only meaningful when platform is "web" — for
                                 // other platforms, just use "/".
    demoable: boolean;          // true only if this is something that can be visually
                                 // demonstrated in a recording
    priority: 'high' | 'medium' | 'low';
  }>;
  targetAudience: string;
  keyValueProps: string[];
  suggestedVideoTypes: Array<'teaser' | 'shorts' | 'demo' | 'tutorial'>;
}
No markdown, no explanation. JSON only.`;

export class ProjectAnalyzer {
  constructor(private llm: LlmProvider) {}

  async analyze(context: ProjectSourceContext, targetUrl: string): Promise<ProjectSummary> {
    logger.step('analyze', 'Calling LLM to analyze project source...');
    logger.info('  This can take a while, especially on local models — progress prints every few seconds.');

    const prompt = buildPrompt(context, targetUrl);

    const summary = await withHeartbeat(
      'project analysis',
      generateValidatedJson<ProjectSummary>(this.llm, ProjectSummarySchema, prompt, SYSTEM_PROMPT, {
        label: 'analyze',
      }),
    );

    // Deterministic normalization: whatever URL the LLM guessed for the
    // background (dev-server) setup step, replace it with the real
    // target.url — that's the only URL that actually matters, since it's
    // what Playwright will record against, regardless of what port the LLM
    // assumed from reading scripts.
    if (summary.platform === 'web') {
      summary.setupSteps = summary.setupSteps.map((step) =>
        step.background ? { ...step, readyUrl: targetUrl } : step,
      );
    }

    logger.success(
      `Analysis complete: platform=${summary.platform}, ${summary.setupSteps.length} setup step(s), ` +
      `${summary.features.length} feature(s) identified.`,
    );
    if (summary.platform !== 'web') {
      logger.warn(
        `Platform classified as '${summary.platform}' — recording currently only supports 'web' ` +
        `(via Playwright). The scenario will still be generated, but 'record'/'build' will warn ` +
        `until a recorder for this platform exists.`,
      );
    }
    return summary;
  }
}

function buildPrompt(context: ProjectSourceContext, targetUrl: string): string {
  const pkg = context.packageJson;

  const routesSection =
    context.routes.length > 0
      ? `Discovered routes (use these exact paths for the "route" field — do not invent others):\n` +
        context.routes.map((r) => `- ${r.path}  (from ${r.file})`).join('\n')
      : `No routes could be auto-discovered for this framework (${context.framework}).\n` +
        `Here is a partial file listing instead — infer likely pages/routes from it, and use ` +
        `"/" for the route field if genuinely unsure:\n` +
        context.fileTree.slice(0, 150).map((f) => `- ${f}`).join('\n');

  const platformHint =
    context.platformHints.length > 0
      ? `Deterministic platform signals were already found: ${context.platformHints.join('; ')}.`
      : '';

  return `Analyze this project's source for a promotional demo video.

${buildPlatformClassificationPrompt(context.platformHints)}

## Project details

Project name: ${pkg?.name ?? '(unknown)'}
Description (from package.json): ${pkg?.description ?? '(none)'}
Web framework detected (if any): ${context.framework}

package.json scripts: ${JSON.stringify(pkg?.scripts ?? {})}
Key dependencies: ${(pkg?.dependencies ?? []).slice(0, 40).join(', ') || '(none listed)'}

${context.readme ? `README:\n${context.readme}\n` : '(No README found)'}

${routesSection}

${buildSetupPlanningPrompt(targetUrl, platformHint)}

Based on all of the above: first classify the platform (see "Platform classification"),
then produce the setup plan (see "Setup plan"), then identify the features that are
visually demonstrable in a recording, each anchored to a real discovered route where
possible (web only). Also determine the target audience, key value propositions, and
which video types suit this project.

Respond with JSON only.`;
}
