import { ProjectSummary, ProjectSummarySchema, isConcreteWebRoute, isSafeCliCommand, logger, withHeartbeat } from '@auto-product-video-generator/core';
import { ProjectSourceContext } from '@auto-product-video-generator/source';
import { relative } from 'node:path';
import { LlmProvider } from '../llm/provider.js';
import { generateValidatedJson } from '../utils/validated-json.js';
import { buildPlatformClassificationPrompt } from './platform-classifier.js';
import { buildSetupPlanningPrompt } from './setup-planner.js';
import { PROJECT_SUMMARY_OUTPUT_SCHEMA } from './output-schemas.js';

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

Respond ONLY with one valid JSON object. This is strict JSON, not TypeScript.
Every top-level key shown below is REQUIRED. NEVER output null anywhere.

Copy this structure exactly and replace the example values:
{
  "name": "Example Product",
  "description": "A plain-language description of what the product helps people do.",
  "platform": "web",
  "setupSteps": [
    {"name":"Install dependencies","command":"npm install","background":false},
    {"name":"Start application","command":"npm run dev","background":true,"readyUrl":"http://localhost:3000"}
  ],
  "features": [
    {"id":"browse-items","title":"Browse items","description":"Find useful items quickly.","route":"/items","demoable":true,"priority":"high"}
  ],
  "targetAudience": "People who want to use the product",
  "keyValueProps": ["Find what you need quickly"],
  "suggestedVideoTypes": ["demo"]
}

Hard rules:
- "description" is always required, even when package.json has no description.
- Use exactly one allowed platform key from the platform section.
- setupSteps and features may be empty arrays, but must always be present.
- Every feature must contain id, title, description, demoable, and priority.
- For web projects, set route when it is known. For CLI projects, set each demoable feature's "command" to an exact safe command documented by package.json or README and omit route when it is not meaningful.
- CLI feature commands MUST be finite, read-only discovery commands ending in --help, -h, --version, or -v. Never select commands that publish, authenticate, expose environment/secrets, create/delete files, start servers/watchers, or generate/record/render media.
- Optional setup fields must be OMITTED when unused. NEVER write null.
- A foreground setup step has no readyUrl key.
- A background web-server step has readyUrl as a real URL string.
- No markdown, comments, trailing commas, or explanation. JSON only.`;

export class ProjectAnalyzer {
  constructor(private llm: LlmProvider) {}

  async analyze(context: ProjectSourceContext, targetUrl?: string): Promise<ProjectSummary> {
    logger.step('analyze', 'Calling LLM to analyze project source...');
    logger.info('  This can take a while, especially on local models — progress prints every few seconds.');

    const prompt = buildPrompt(context, targetUrl);

    const summary = await withHeartbeat(
      'project analysis',
      generateValidatedJson<ProjectSummary>(this.llm, ProjectSummarySchema, prompt, SYSTEM_PROMPT, {
        label: 'analyze',
        jsonSchema: PROJECT_SUMMARY_OUTPUT_SCHEMA,
      }),
    );

    if (summary.platform === 'cli') {
      summary.features = summary.features.filter((feature) => !feature.command || isSafeCliCommand(feature.command));
    }

    // Deterministic normalization: whatever URL the LLM guessed for the
    // background (dev-server) setup step, replace it with the real
    // target.url — that's the only URL that actually matters, since it's
    // what Playwright will record against, regardless of what port the LLM
    // assumed from reading scripts.
    if (summary.platform === 'web' && targetUrl) {
      summary.setupSteps = summary.setupSteps.map((step) =>
        step.background ? { ...step, readyUrl: targetUrl } : step,
      );
    }

    // Installation belongs at the workspace root so workspace:* dependencies
    // can be resolved. Application start commands still run in the selected app.
    if (context.projectPath !== '.') {
      const workspaceCwd = relative(context.rootDir, context.repositoryRoot) || '.';
      const installCommand = `${context.packageManager} install`;
      summary.setupSteps = summary.setupSteps.map((step) =>
        /(?:^|\s)(?:install|ci)(?:\s|$)/i.test(step.command) || /install dependencies/i.test(step.name)
          ? { ...step, command: installCommand, cwd: workspaceCwd }
          : step,
      );
      if (!summary.setupSteps.some((step) => step.command === installCommand && step.cwd === workspaceCwd)) {
        summary.setupSteps.unshift({
          name: 'Install workspace dependencies', command: installCommand,
          cwd: workspaceCwd, background: false, readyTimeoutMs: 60000,
        });
      }
    }

    logger.success(
      `Analysis complete: platform=${summary.platform}, ${summary.setupSteps.length} setup step(s), ` +
      `${summary.features.length} feature(s) identified.`,
    );
    if (summary.platform !== 'web') {
      logger.info(
        summary.platform === 'cli'
          ? `Platform classified as 'cli'. Commands will be recorded in the Docker-based terminal recorder.`
          : `Platform classified as '${summary.platform}'. Android, Flutter, React Native, and Unity ` +
            `Android builds can be recorded when target.android is configured; other targets report ` +
            `their required recorder environment before recording.`,
      );
    }
    return summary;
  }
}

function buildPrompt(context: ProjectSourceContext, targetUrl?: string): string {
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

Project name: ${pkg?.name || '(unknown)'}
Description (from package.json): ${pkg?.description || '(none)'}
Web framework detected (if any): ${context.framework}
Selected application path: ${context.projectPath}
Repository package manager: ${context.packageManager}

package.json scripts: ${JSON.stringify(pkg?.scripts || {})}
package.json bin commands: ${JSON.stringify(pkg?.bin || {})}
Key dependencies: ${(pkg?.dependencies || []).slice(0, 40).join(', ') || '(none listed)'}

${context.readme ? `README:\n${context.readme}\n` : '(No README found)'}

${routesSection}

${buildSetupPlanningPrompt(targetUrl, platformHint)}

Workspace rule: the source resolver has already selected the application shown above.
Do not search for or start a different workspace package. If the selected path is not
".", dependency installation must run at the repository root using
"${context.packageManager} install"; the application start command runs in the selected
application directory.

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
