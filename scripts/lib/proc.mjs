import { spawn, spawnSync } from 'node:child_process';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

export const log = {
  info: (msg) => console.log(`${COLORS.blue}●${COLORS.reset} ${msg}`),
  success: (msg) => console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`),
  warn: (msg) => console.warn(`${COLORS.yellow}⚠${COLORS.reset} ${msg}`),
  error: (msg) => console.error(`${COLORS.red}✗${COLORS.reset} ${msg}`),
  step: (label, msg) => console.log(`${COLORS.blue}[${label}]${COLORS.reset} ${msg}`),
  dim: (msg) => console.log(`${COLORS.gray}${msg}${COLORS.reset}`),
};

/** Parses simple `--key=value` / `--flag` CLI args into an object. */
export function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    out[toCamelCase(key)] = rest.length > 0 ? rest.join('=') : true;
  }
  return out;
}

function toCamelCase(key) {
  return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** Returns true if `cmd` resolves on PATH (cross-platform). */
export function commandExists(cmd) {
  const checker = process.platform === 'win32' ? 'where' : 'command';
  const args = process.platform === 'win32' ? [cmd] : ['-v', cmd];
  const shell = process.platform === 'win32' ? undefined : true;
  const result = spawnSync(checker, args, { stdio: 'ignore', shell });
  return result.status === 0;
}

/** Runs a command, streaming output, resolving on exit code 0. */
export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    log.dim(`  $ ${cmd} ${args.join(' ')}`);
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    proc.on('close', (code) => {
      if (code === 0) resolve(code);
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

/** Runs a command in the background (detached), returning immediately. */
export function runDetached(cmd, args, opts = {}) {
  const proc = spawn(cmd, args, {
    stdio: 'ignore',
    detached: true,
    shell: process.platform === 'win32',
    ...opts,
  });
  proc.unref();
  return proc;
}

export async function httpHealthCheck(url, timeoutMs = 3000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitForHealth(url, { timeoutMs = 30000, intervalMs = 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await httpHealthCheck(url, 2000)) return true;
    await sleep(intervalMs);
  }
  return false;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
