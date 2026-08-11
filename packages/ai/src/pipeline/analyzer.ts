import { ProjectSummary, ProjectSummarySchema, isConcreteWebRoute, logger, withHeartbeat } from '@demo-video-gen/core';
import { ProjectSourceContext } from '@demo-video-gen/source';
import { LlmProvider } from '../llm/provider.js';
import { generateValidatedJson } from '../utils/validated-json.js';
import { buildPlatformClassificationPrompt } from './platform-classifier.js';
import { buildSetupPlanningPrompt } from './setup-planner.js';

const SYSTEM_PROMPT = `You are a video production expert analyzing a project's source code
to plan a promotional demo video.

The resulting video is for general, non-technical viewers. Treat frameworks,
programming languages, hosting services, APIs, architecture, and implementation
details only as internal evidence. NEVER present them as product features or
customer value. Features, descriptions, targetAudience, and keyValueProps must
describe what a person can do, the problem it solves, and the visible benefit in
plain language. Prefer user workflows such as "browse work", "find information",
"submit a request", or "manage items" over how the software was built.

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
        repair: (raw) => repairProjectSummary(raw, context),
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
      logger.info(
        `Platform classified as '${summary.platform}'. Android, Flutter, React Native, and Unity ` +
        `Android builds can be recorded when target.android is configured; other targets report ` +
        `their required recorder environment before recording.`,
      );
    }
    return summary;
  }
}

/**
 * Small local models occasionally omit the top-level description even though
 * they produce the rest of the analysis correctly. Re-querying the model for
 * this deterministic field is slow on CPU CI runners, so recover it from the
 * inspected package metadata/README instead. This deliberately repairs only
 * the missing description; semantic analysis fields still require valid LLM
 * output and retain the normal retry behavior.
 */
export function repairProjectSummary(raw: unknown, context: ProjectSourceContext): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const summary = raw as Record<string, unknown>;
  if (typeof summary.description === 'string') return raw;

  summary.description =
    context.packageJson?.description?.trim() ||
    firstReadmeParagraph(context.readme) ||
    `${context.packageJson?.name ?? 'This product'} promotional overview`;
  logger.info('[analyze] Filled missing description from inspected project metadata.');
  return summary;
}

function firstReadmeParagraph(readme: string | null): string | undefined {
  if (!readme) return undefined;
  return readme
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/^#+\s+.*(?:\r?\n|$)/, '').trim())
    .find((paragraph) => paragraph.length > 0 && !paragraph.startsWith('![') && !paragraph.startsWith('```'));
}

function buildPrompt(context: ProjectSourceContext, targetUrl: string): string {
  const pkg = context.packageJson;
  const concreteRoutes = context.routes.filter((route) => isConcreteWebRoute(route.path));
  const omittedTemplateCount = context.routes.length - concreteRoutes.length;

  const routesSection =
    concreteRoutes.length > 0
      ? `Discovered routes (use these exact paths for the "route" field — do not invent others):\n` +
        concreteRoutes.map((r) => `- ${r.path}  (from ${r.file})`).join('\n') +
        (omittedTemplateCount > 0
          ? `\n${omittedTemplateCount} dynamic route template(s) were omitted because paths such as [slug] cannot be opened directly.`
          : '')
      : context.routes.length > 0
        ? `Only dynamic route templates were discovered. They cannot be opened directly. ` +
          `Use "/" for every feature route; never copy [slug], [...parts], :id, or * into a URL.`
        : `No routes could be auto-discovered for this framework (${context.framework}).\n` +
          `Here is a partial file listing instead. Use "/" unless a concrete path is explicitly present; ` +
          `never invent parameter values:\n` +
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

IMPORTANT: setupSteps may contain technical commands because they are only executed
internally. All viewer-facing fields (description, features, targetAudience,
keyValueProps) must use plain, benefit-focused language and must not advertise the
framework, programming language, API, hosting provider, or architecture.

Respond with JSON only.`;
}
