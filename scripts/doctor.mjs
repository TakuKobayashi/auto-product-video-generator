#!/usr/bin/env node
// Prints a checklist of everything demo-video-gen needs, so "it doesn't
// work" turns into a clear list of what's missing. Run via `task doctor`.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { log, commandExists, httpHealthCheck } from './lib/proc.mjs';

const require = createRequire(import.meta.url);

const rows = [];

function check(label, ok, hint) {
  rows.push({ label, ok, hint });
}

async function main() {
  console.log();
  log.info('demo-video-gen doctor — environment check\n');

  // Node
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  check(`Node.js (${process.version})`, nodeMajor >= 20, 'Install Node.js >= 20: https://nodejs.org');

  // pnpm
  check('pnpm', commandExists('pnpm'), 'npm install -g pnpm');

  // ffmpeg (bundled)
  let ffmpegPath = null;
  try {
    ffmpegPath = require('ffmpeg-static');
  } catch {
    /* not installed yet */
  }
  check(
    'ffmpeg (bundled via ffmpeg-static)',
    !!ffmpegPath && existsSync(ffmpegPath),
    'Run: pnpm install  (or: task install)',
  );

  // ffprobe (bundled)
  let ffprobePath = null;
  try {
    ffprobePath = require('ffprobe-static').path;
  } catch {
    /* not installed yet */
  }
  check(
    'ffprobe (bundled via ffprobe-static)',
    !!ffprobePath && existsSync(ffprobePath),
    'Run: pnpm install  (or: task install)',
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

  // Docker
  check('Docker CLI', commandExists('docker'), 'Install Docker Desktop, needed for VOICEVOX Engine');

  // VOICEVOX reachable
  const voicevoxUp = await httpHealthCheck('http://localhost:50021/version', 2000);
  check('VOICEVOX Engine reachable (localhost:50021)', voicevoxUp, 'Run: task serve');

  // Ollama binary + reachable (optional)
  const ollamaInstalled = commandExists('ollama');
  check('Ollama binary installed (optional)', ollamaInstalled, 'Run: task install:ollama');

  const ollamaUp = await httpHealthCheck('http://localhost:11434/api/tags', 2000);
  check('Ollama daemon reachable (optional, localhost:11434)', ollamaUp, 'Run: task serve');

  // Gemini API key (optional)
  check(
    'GEMINI_API_KEY set (optional, needed for provider: gemini)',
    !!process.env.GEMINI_API_KEY,
    'export GEMINI_API_KEY=... (see .env.example)',
  );

  // Config file
  check(
    'dvg.config.yaml present in current directory',
    existsSync('dvg.config.yaml'),
    'Run: pnpm dev -- init --url http://localhost:3000',
  );

  console.log();
  let allCriticalOk = true;
  for (const r of rows) {
    const mark = r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`${mark} ${r.label}`);
    if (!r.ok) {
      console.log(`  \x1b[90m→ ${r.hint}\x1b[0m`);
      if (!r.label.includes('optional')) allCriticalOk = false;
    }
  }

  console.log();
  if (allCriticalOk) {
    log.success('Everything required looks good. If something still fails, check the hints above for optional pieces.');
  } else {
    log.warn('Some required items are missing — see hints above, or just run: task install');
  }
}

main();
