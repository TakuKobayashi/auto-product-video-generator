#!/usr/bin/env -S npx tsx
// Prints a checklist of everything demo-video-gen needs, so "it doesn't
// work" turns into a clear list of what's missing. Run via `task doctor`.
//
// This is the one piece of the setup tooling written as an actual script
// rather than directly in Taskfile.yml: checking whether the bundled
// ffmpeg/ffprobe/Playwright binaries resolved correctly requires asking
// Node's module resolution directly (equivalent shell-only checks would be
// fragile, since pnpm's on-disk layout for these isn't a stable path to
// grep for). Everything else (installing, serving, pulling models) is
// plain sequential commands in Taskfile.yml — see the comments there.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

interface CheckResult {
  label: string;
  ok: boolean;
  hint: string;
  optional?: boolean;
}

const results: CheckResult[] = [];

function check(label: string, ok: boolean, hint: string, optional = false): void {
  results.push({ label, ok, hint, optional });
}

async function httpOk(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log();
  console.log('demo-video-gen doctor — environment check');
  console.log();

  // Node
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  check(`Node.js (${process.version})`, nodeMajor >= 20, 'Install Node.js >= 20: https://nodejs.org');

  // git (required for source.repository / source.localPath analysis)
  const gitOk = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
  check('git', gitOk, 'Install git: https://git-scm.com/downloads');

  // ffmpeg (bundled via ffmpeg-static, auto-downloaded by `pnpm install`)
  let ffmpegPath: string | null = null;
  try {
    ffmpegPath = require('ffmpeg-static');
  } catch {
    /* not installed yet */
  }
  check(
    'ffmpeg (bundled via ffmpeg-static)',
    !!ffmpegPath && existsSync(ffmpegPath),
    'Run: task install:node   (or install a system ffmpeg — it will be used as a fallback)',
  );

  // ffprobe (bundled via ffprobe-static — ships pre-built, no download step)
  let ffprobePath: string | null = null;
  try {
    ffprobePath = require('ffprobe-static').path;
  } catch {
    /* not installed yet */
  }
  check(
    'ffprobe (bundled via ffprobe-static)',
    !!ffprobePath && existsSync(ffprobePath),
    'Run: task install:node',
  );

  // Playwright Chromium
  let playwrightOk = false;
  try {
    const { chromium } = require('playwright');
    const exePath = chromium.executablePath();
    playwrightOk = !!exePath && existsSync(exePath);
  } catch {
    /* not installed yet */
  }
  check('Playwright Chromium browser', playwrightOk, 'Run: task install:playwright');

  // VOICEVOX reachable
  const voicevoxUp = await httpOk('http://localhost:50021/version');
  check('VOICEVOX Engine reachable (localhost:50021)', voicevoxUp, 'Run: task serve');

  // Ollama reachable (optional)
  const ollamaUp = await httpOk('http://localhost:11434/api/tags');
  check('Ollama daemon reachable (localhost:11434)', ollamaUp, 'Run: task serve', true);

  if (ollamaUp) {
    try {
      const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const names = (data.models ?? []).map((m) => m.name).join(', ') || '(none)';
      console.log(`  \x1b[90mmodels available: ${names}\x1b[0m`);
    } catch {
      /* best-effort only */
    }
  }

  // Gemini API key (optional)
  check(
    'GEMINI_API_KEY set',
    !!process.env.GEMINI_API_KEY,
    'export GEMINI_API_KEY=... (see .env.example)',
    true,
  );

  // Config file
  check(
    'dvg.config.yaml present in current directory',
    existsSync('dvg.config.yaml'),
    'Run: pnpm dev -- init --repo <git-url> --url http://localhost:3000',
  );

  console.log();
  let allCriticalOk = true;
  for (const r of results) {
    const mark = r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    const suffix = r.optional ? ' (optional)' : '';
    console.log(`${mark} ${r.label}${suffix}`);
    if (!r.ok) {
      console.log(`  \x1b[90m→ ${r.hint}\x1b[0m`);
      if (!r.optional) allCriticalOk = false;
    }
  }

  console.log();
  if (allCriticalOk) {
    console.log('\x1b[32m✓\x1b[0m Everything required looks good.');
  } else {
    console.log("\x1b[33m⚠\x1b[0m Some required items are missing — see hints above, or just run: task install");
  }
}

main();
