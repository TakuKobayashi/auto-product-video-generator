import { ProjectSummary, ProjectSummarySchema, logger, withHeartbeat } from '@demo-video-gen/core';
import { ProjectSourceContext } from '@demo-video-gen/source';
import { LlmProvider } from '../llm/provider.js';
import { generateValidatedJson } from '../utils/validated-json.js';

const SYSTEM_PROMPT = `You are a video production expert analyzing a web application's source code
to plan a promotional demo video.

You will be given: the project's package.json (name/description/scripts/dependencies),
its README, the detected framework, and either a list of discovered routes (URL paths
mapped from actual page/route files) or a general file listing when routes couldn't be
auto-discovered.

Respond ONLY with a JSON object matching this TypeScript type:
{
  name: string;
  description: string;
  features: Array<{
    id: string;                 // a short slug string, e.g. "dashboard-overview"
    title: string;
    description: string;
    route: string;              // REQUIRED. A real URL path from the provided routes list
                                 // (e.g. "/dashboard"), or "/" if no specific route applies.
                                 // Never invent a route that wasn't given to you.
    demoable: boolean;          // true only if this is something a browser can visually demonstrate
    priority: 'high' | 'medium' | 'low';
  }>;
  targetAudience: string;
  keyValueProps: string[];
  suggestedVideoTypes: Array<'teaser' | 'shorts' | 'demo' | 'tutorial'>;
}
No markdown, no explanation. JSON only.`;

export class ProjectAnalyzer {
  constructor(private llm: LlmProvider) {}

  async analyze(context: ProjectSourceContext): Promise<ProjectSummary> {
    logger.step('analyze', 'Calling LLM to analyze project source...');
    logger.info('  This can take a while, especially on local models — progress prints every few seconds.');

    const prompt = buildPrompt(context);

    const summary = await withHeartbeat(
      'project analysis',
      generateValidatedJson<ProjectSummary>(this.llm, ProjectSummarySchema, prompt, SYSTEM_PROMPT, {
        label: 'analyze',
      }),
    );

    logger.success(`Analysis complete: ${summary.features.length} feature(s) identified.`);
    return summary;
  }
}

function buildPrompt(context: ProjectSourceContext): string {
  const pkg = context.packageJson;

  const routesSection =
    context.routes.length > 0
      ? `Discovered routes (use these exact paths for the "route" field — do not invent others):\n` +
        context.routes.map((r) => `- ${r.path}  (from ${r.file})`).join('\n')
      : `No routes could be auto-discovered for this framework (${context.framework}).\n` +
        `Here is a partial file listing instead — infer likely pages/routes from it, and use ` +
        `"/" for the route field if genuinely unsure:\n` +
        context.fileTree.slice(0, 150).map((f) => `- ${f}`).join('\n');

  return `Analyze this web application's source for a promotional demo video.

Project name: ${pkg?.name ?? '(unknown)'}
Description (from package.json): ${pkg?.description ?? '(none)'}
Framework detected: ${context.framework}

package.json scripts: ${JSON.stringify(pkg?.scripts ?? {})}
Key dependencies: ${(pkg?.dependencies ?? []).slice(0, 40).join(', ') || '(none listed)'}

${context.readme ? `README:\n${context.readme}\n` : '(No README found)'}

${routesSection}

Based on the above, identify the features that are visually demonstrable via
browser interaction, each anchored to a real discovered route where possible.
Also determine the target audience, key value propositions, and which video
types suit this project.

Respond with JSON only.`;
}
