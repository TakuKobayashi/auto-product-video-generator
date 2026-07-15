/**
 * Builds the "how do I get this project running" section of the analysis
 * prompt. Kept as its own function (mirroring platform-classifier.ts) so
 * it's a single, obvious place to extend if a platform needs different
 * guidance (e.g. once Android/iOS/Unity get their own deterministic
 * detection, add platform-specific examples here).
 */
export function buildSetupPlanningPrompt(targetUrl: string, platformHint: string): string {
  return `## Setup plan

Also produce an ordered list of shell commands ("setupSteps") that take this project from
a fresh checkout to actually running and reachable — the same idea as a Taskfile: a short
sequence of named steps, each either run-to-completion (e.g. installing dependencies) or
long-running/backgrounded (e.g. starting a dev server).

Base this on package.json's "scripts" and any setup instructions in the README — prefer
what the project's own scripts/README actually say over generic assumptions. ${platformHint}

Each item in "setupSteps" must match:
{
  name: string;            // short label, e.g. "Install dependencies", "Start dev server"
  command: string;         // a single shell command, e.g. "npm install" or "npm run dev"
  background: boolean;     // false = run to completion and wait (installs, builds);
                            // true = long-running process that keeps running (dev servers) —
                            // there should be at most ONE background: true step, and it
                            // should be the LAST step in the list
  readyUrl?: string;       // only for the background step, if platform is "web": the URL
                            // it will end up serving on. The app should end up reachable at
                            // roughly ${targetUrl} — if you're not sure it'll be exactly that
                            // port, still set readyUrl to ${targetUrl} (it gets normalized
                            // afterward regardless).
}

If you can't determine a reliable setup command (e.g. no scripts, unfamiliar tooling,
non-web platform with no clear single command), return an empty array for "setupSteps"
rather than guessing — an empty list just means the person starts the app manually.`;
}
