/**
 * Builds the "how do I get this project running" section of the analysis
 * prompt. Kept as its own function (mirroring platform-classifier.ts) so
 * it's a single, obvious place to extend if a platform needs different
 * guidance (e.g. once Android/iOS/Unity get their own deterministic
 * detection, add platform-specific examples here).
 */
export function buildSetupPlanningPrompt(targetUrl: string | undefined, platformHint: string): string {
  const readyUrl = targetUrl ?? 'http://localhost:3000';
  const urlRule = targetUrl
    ? `A background web-server step MUST use "readyUrl":"${targetUrl}".`
    : `The shown port 3000 is only an example. Infer readyUrl from the actual script and README. ` +
      `Use only localhost or 127.0.0.1, never a deployed/public URL. If no port is stated, use the ` +
      `framework's conventional local development port.`;
  return `## Setup plan

Also produce an ordered list of shell commands ("setupSteps") that take this project from
a fresh checkout to actually running and reachable — the same idea as a Taskfile: a short
sequence of named steps, each either run-to-completion (e.g. installing dependencies) or
long-running/backgrounded (e.g. starting a dev server).

Base this on package.json's "scripts" and any setup instructions in the README — prefer
what the project's own scripts/README actually say over generic assumptions. ${platformHint}

For non-web projects, build/install commands are valid setup steps when the project
files support them. Examples of the intended shape are \`./gradlew installDebug\` for a
standard Android app or the project's documented Flutter/React Native build-and-install
command. For Unity, use its documented command-line build method only when that method
actually exists in the repository; never invent a \`-executeMethod\` target.

Use these exact JSON shapes. Do not use TypeScript notation and NEVER output null.

Foreground step (install/build):
{"name":"Install dependencies","command":"npm install","background":false}

Background web-server step:
{"name":"Start application","command":"npm run dev","background":true,"readyUrl":"${readyUrl}"}

Rules:
- name, command, and background are required on every step.
- A foreground step MUST OMIT readyUrl, cwd, and readyTimeoutMs unless they have real values.
- ${urlRule}
- Never write "readyUrl":null. Never write null for any optional field.
- There may be at most one background step and it must be last.

If you can't determine a reliable setup command (e.g. no scripts, unfamiliar tooling,
non-web platform with no clear single command), return an empty array for "setupSteps"
rather than guessing — an empty list just means the person starts the app manually.`;
}
