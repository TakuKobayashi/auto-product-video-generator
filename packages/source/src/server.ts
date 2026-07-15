import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { join } from 'node:path';
import { logger, SetupStep } from '@demo-video-gen/core';
import { PackageJsonSummary } from './inspector.js';

/** Picks a sensible default dev-server command from package.json's scripts. */
export function detectStartCommand(packageJson: PackageJsonSummary | null): string | null {
  const scripts = packageJson?.scripts ?? {};
  const preferredOrder = ['dev', 'start', 'serve', 'preview'];
  for (const name of preferredOrder) {
    if (scripts[name]) {
      const pkgManager = detectPackageManagerHint(packageJson);
      return `${pkgManager} run ${name}`;
    }
  }
  return null;
}

function detectPackageManagerHint(packageJson: PackageJsonSummary | null): string {
  // Best-effort only — we don't have access to the lockfile from here, and
  // `npm run` works regardless of which package manager was actually used
  // to install (as long as node_modules exists), so this is a safe default.
  void packageJson;
  return 'npm';
}

export async function httpReachable(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    // Any HTTP response at all (even a 404/500) means something is listening.
    return res.status < 600;
  } catch {
    return false;
  }
}

export interface RunSetupStepsOptions {
  /** Project root — relative `cwd` on individual steps is resolved against this. */
  cwd: string;
  logPath: string;
}

/**
 * Executes an ordered list of SetupStep — the Taskfile-like "how do I get
 * this project running" plan AI-generated during `analyze` and stored in
 * scenario.yaml's `setup` field (see SetupStepSchema in
 * packages/core/src/types/scenario.ts). This is what makes scenario.yaml a
 * fully self-contained execution plan: everything needed to go from a
 * fresh checkout to a recording, not just what to click once something
 * happens to already be running.
 *
 * Non-background steps (e.g. "npm install") run to completion in order,
 * blocking. A background step (e.g. "npm run dev") is started detached —
 * left running afterwards, same lifecycle model as `ensureServerRunning`
 * below — and, if it has a `readyUrl`, polled until reachable before
 * moving on.
 */
export async function runSetupSteps(steps: SetupStep[], options: RunSetupStepsOptions): Promise<void> {
  for (const step of steps) {
    const stepCwd = step.cwd ? join(options.cwd, step.cwd) : options.cwd;
    logger.step('setup', `${step.name}: ${step.command}`);

    if (!step.background) {
      await runToCompletion(step.command, stepCwd, options.logPath);
      continue;
    }

    spawnDetached(step.command, stepCwd, options.logPath);
    logger.dim(`  (started in background, logs: ${options.logPath})`);

    if (!step.readyUrl) continue;

    logger.info(
      `Waiting for ${step.readyUrl} to become reachable (up to ${Math.round(step.readyTimeoutMs / 1000)}s)...`,
    );
    const start = Date.now();
    let up = false;
    while (Date.now() - start < step.readyTimeoutMs) {
      if (await httpReachable(step.readyUrl)) {
        up = true;
        break;
      }
      await sleep(1000);
    }
    if (up) {
      logger.success(`Reachable: ${step.readyUrl}`);
    } else {
      logger.warn(
        `${step.readyUrl} did not become reachable within ${Math.round(step.readyTimeoutMs / 1000)}s. ` +
        `Check ${options.logPath} for errors — proceeding anyway in case it's still starting up.`,
      );
    }
  }
}

export interface EnsureAppRunningOptions {
  url: string;
  /** scenario.yaml's `setup` field — preferred when non-empty. */
  setupSteps: SetupStep[];
  /** Legacy fallback: dvg.config.yaml's source.startCommand, used only when setupSteps is empty. */
  startCommand?: string;
  cwd: string;
  installDeps: boolean;
  logPath: string;
}

/**
 * The single entry point `record`/`build` call before recording. If `url`
 * is already reachable, does nothing. Otherwise:
 *   1. If scenario.yaml has a `setup` plan (the common case for anything
 *      generated after this feature shipped), run it via runSetupSteps —
 *      this is the "execution plan describes its own startup" behavior.
 *   2. Else fall back to the older, simpler dvg.config.yaml
 *      source.startCommand mechanism (ensureServerRunning), for
 *      scenario.yaml files generated before `setup` existed, or as a
 *      manual override.
 *   3. Else warn that nothing could be started automatically.
 */
export async function ensureAppRunning(options: EnsureAppRunningOptions): Promise<void> {
  if (await httpReachable(options.url)) {
    logger.success(`Target already reachable: ${options.url}`);
    return;
  }

  if (options.setupSteps.length > 0) {
    logger.step('setup', `Running scenario.yaml's setup plan (${options.setupSteps.length} step(s))...`);
    if (options.installDeps && !options.setupSteps.some((s) => /install/i.test(s.name))) {
      // The scenario's plan didn't include an explicit install step but
      // installDeps was requested — run it first as a courtesy.
      await runToCompletion('npm install', options.cwd, options.logPath);
    }
    await runSetupSteps(options.setupSteps, { cwd: options.cwd, logPath: options.logPath });
    return;
  }

  await ensureServerRunning({
    url: options.url,
    startCommand: options.startCommand,
    cwd: options.cwd,
    installDeps: options.installDeps,
    logPath: options.logPath,
  });
}

export interface EnsureServerRunningOptions {
  url: string;
  startCommand?: string;
  cwd: string;
  installDeps: boolean;
  logPath: string;
  /** Max time to wait for `url` to become reachable after starting. */
  timeoutMs?: number;
}

/**
 * Legacy/manual-override path: if `url` is already reachable, does
 * nothing. Otherwise, if `startCommand` is set, runs it (installing deps
 * first if requested) as a detached background process and polls `url`
 * until it responds or `timeoutMs` elapses. Prefer `ensureAppRunning` (uses
 * scenario.yaml's `setup` plan when available) — this is what it falls
 * back to when there's no `setup` plan.
 */
export async function ensureServerRunning(options: EnsureServerRunningOptions): Promise<void> {
  if (await httpReachable(options.url)) {
    logger.success(`Target already reachable: ${options.url}`);
    return;
  }

  if (!options.startCommand) {
    logger.warn(`${options.url} is not reachable, and no source.startCommand is configured.`);
    logger.warn('Start your app yourself (e.g. `npm run dev`) before running this command, or set');
    logger.warn('source.startCommand in dvg.config.yaml to have it started automatically.');
    return;
  }

  if (options.installDeps) {
    logger.step('server', `Installing dependencies in ${options.cwd}...`);
    await runToCompletion('npm install', options.cwd, options.logPath);
  }

  logger.step('server', `Starting dev server: ${options.startCommand}`);
  logger.dim(`  (in ${options.cwd}, logs: ${options.logPath})`);

  spawnDetached(options.startCommand, options.cwd, options.logPath);

  const timeoutMs = options.timeoutMs ?? 60000;
  const start = Date.now();
  logger.info(`Waiting for ${options.url} to become reachable (up to ${Math.round(timeoutMs / 1000)}s)...`);

  while (Date.now() - start < timeoutMs) {
    if (await httpReachable(options.url)) {
      logger.success(`Dev server is up: ${options.url}`);
      return;
    }
    await sleep(1000);
  }

  logger.warn(
    `${options.url} did not become reachable within ${Math.round(timeoutMs / 1000)}s. ` +
    `Check ${options.logPath} for errors — proceeding anyway in case it's still starting up.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spawns `command` detached (left running in the background, not tracked/
 * killed by this tool) via a real shell — NOT a naive `.split(' ')` on the
 * command string, which breaks for anything with quoted arguments (e.g.
 * `sh -c "..."`, or values containing spaces). `shell: true` makes Node
 * pass the whole string through `/bin/sh -c` (POSIX) or `cmd.exe /c`
 * (Windows) itself, handling quoting correctly on both.
 */
function spawnDetached(command: string, cwd: string, logPath: string): void {
  const logFd = openSync(logPath, 'a');
  const proc = spawn(command, {
    cwd,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    shell: true,
  });
  proc.unref();
}

/** Same shell-correctness note as spawnDetached — runs to completion instead of backgrounding. */
function runToCompletion(command: string, cwd: string, logPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const logFd = openSync(logPath, 'a');
    const proc = spawn(command, { cwd, stdio: ['ignore', logFd, logFd], shell: true });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code} (see ${logPath})`)),
    );
  });
}
