import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { logger } from '@demo-video-gen/core';
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
 * If `url` is already reachable, does nothing. Otherwise, if `startCommand`
 * is set, runs it (installing deps first if requested) as a detached
 * background process and polls `url` until it responds or `timeoutMs`
 * elapses. The process is intentionally left running in the background
 * afterwards (not tracked/killed by this tool) — same lifecycle model as
 * `task serve`'s VOICEVOX/Ollama, and safer than risking an abrupt kill
 * mid-recording or mid-render.
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
    await runToCompletion('npm', ['install'], options.cwd, options.logPath);
  }

  logger.step('server', `Starting dev server: ${options.startCommand}`);
  logger.dim(`  (in ${options.cwd}, logs: ${options.logPath})`);

  const [cmd, ...args] = options.startCommand.split(' ');
  const logFd = openSync(options.logPath, 'a');
  const proc = spawn(cmd, args, {
    cwd: options.cwd,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    shell: process.platform === 'win32',
  });
  proc.unref();

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

function runToCompletion(cmd: string, args: string[], cwd: string, logPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const logFd = openSync(logPath, 'a');
    const proc = spawn(cmd, args, { cwd, stdio: ['ignore', logFd, logFd], shell: process.platform === 'win32' });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code} (see ${logPath})`))));
  });
}
