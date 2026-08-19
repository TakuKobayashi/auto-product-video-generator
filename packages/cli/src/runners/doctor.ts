import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

interface Result {
  label: string;
  ok: boolean;
  hint: string;
  optional?: boolean;
}

function commandOk(command: string, args = ['--version']): boolean {
  return (
    spawnSync(command, args, { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0
  );
}

async function httpOk(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

export async function runDoctor(): Promise<void> {
  const results: Result[] = [];
  const add = (label: string, ok: boolean, hint: string, optional = false) =>
    results.push({ label, ok, hint, optional });
  const nodeMajor = Number(process.versions.node.split('.')[0]);

  add(
    `Node.js ${process.version}`,
    nodeMajor >= 20,
    'Install Node.js 20 or newer: https://nodejs.org'
  );
  add('git', commandOk('git'), 'Install git: https://git-scm.com/downloads');
  add(
    'Docker',
    commandOk('docker'),
    'Install and start Docker Desktop to use `apvg serve`: https://www.docker.com/products/docker-desktop/',
    true
  );

  try {
    const ffmpeg = require('ffmpeg-static') as string | null;
    add(
      'ffmpeg',
      !!ffmpeg && existsSync(ffmpeg),
      'Reinstall auto-product-video-generator or install ffmpeg on PATH.'
    );
  } catch {
    add('ffmpeg', false, 'Reinstall auto-product-video-generator or install ffmpeg on PATH.');
  }

  try {
    const ffprobe = (require('ffprobe-static') as { path: string }).path;
    add(
      'ffprobe',
      existsSync(ffprobe),
      'Reinstall auto-product-video-generator or install ffprobe on PATH.'
    );
  } catch {
    add('ffprobe', false, 'Reinstall auto-product-video-generator or install ffprobe on PATH.');
  }

  try {
    const { chromium } = require('playwright') as { chromium: { executablePath(): string } };
    add('Playwright Chromium', existsSync(chromium.executablePath()), 'Run: apvg setup');
  } catch {
    add('Playwright Chromium', false, 'Run: apvg setup');
  }

  add(
    'VOICEVOX Engine (localhost:50021)',
    await httpOk('http://localhost:50021/version'),
    'Run: apvg serve'
  );
  const ollama = await httpOk('http://localhost:11434/api/tags');
  add(
    'LLM (GEMINI_API_KEY or Ollama)',
    !!process.env.GEMINI_API_KEY || ollama,
    'Set GEMINI_API_KEY or run: apvg serve'
  );
  add('apvg.config.yml', existsSync('apvg.config.yml'), 'Run: apvg project init --repo <git-url>');

  console.log('\nauto-product-video-generator doctor\n');
  let failed = false;
  for (const result of results) {
    console.log(`${result.ok ? '✓' : '✗'} ${result.label}${result.optional ? ' (optional)' : ''}`);
    if (!result.ok) {
      console.log(`  → ${result.hint}`);
      if (!result.optional) failed = true;
    }
  }
  if (failed) process.exitCode = 1;
  else console.log('\n✓ Everything required looks good.');
}
