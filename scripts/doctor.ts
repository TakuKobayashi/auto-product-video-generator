#!/usr/bin/env -S npx tsx
// Prints a checklist of everything auto-product-video-generator needs, so "it doesn't
// work" turns into a clear list of what's missing. Run via `task doctor`.
//
// This is the one piece of the setup tooling written as an actual script
// rather than directly in Taskfile.yml: checking whether the bundled
// ffmpeg/ffprobe/Playwright binaries resolved correctly requires asking
// Node's module resolution directly (equivalent shell-only checks would be
// fragile, since pnpm's on-disk layout for these isn't a stable path to
// grep for). Everything else (installing, serving, pulling models) is
// plain sequential commands in Taskfile.yml — see the comments there.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

interface CheckResult {
  label: string;
  ok: boolean;
  hint: string;
  optional?: boolean;
  skipped?: boolean;
}

const results: CheckResult[] = [];

function check(label: string, ok: boolean, hint: string, optional = false): void {
  results.push({ label, ok, hint, optional });
}

function skipped(label: string, hint: string): void {
  results.push({ label, ok: false, hint, optional: true, skipped: true });
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
  console.log('auto-product-video-generator doctor — environment check');
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

  // Android tooling is required only after an Android-family project has
  // been detected/configured. An AVD must exist, but it need not be running:
  // the recorder starts it and waits for boot automatically.
  const androidTarget = configuredTargetType() === 'android';
  const adbPath = androidSdkTool('adb');
  const emulatorPath = androidSdkTool('emulator');
  const adbOk = spawnSync(adbPath, ['version'], { stdio: 'ignore' }).status === 0;
  const emulatorResult = spawnSync(emulatorPath, ['-list-avds'], { encoding: 'utf8' });
  const emulatorOk = emulatorResult.status === 0;
  const avds = emulatorOk ? emulatorResult.stdout.split(/\r?\n/).map((v) => v.trim()).filter(Boolean) : [];
  check('Android adb', adbOk, 'Install Android SDK Platform-Tools in Android Studio', !androidTarget);
  check('Android Emulator', emulatorOk, 'Install Android Emulator in Android Studio SDK Manager', !androidTarget);
  check('Android AVD available', avds.length > 0, 'Create an AVD in Android Studio Device Manager', !androidTarget);

  // VOICEVOX reachable
  const voicevoxUp = await httpOk('http://localhost:50021/version');
  check('VOICEVOX Engine reachable (localhost:50021)', voicevoxUp, 'Run: task serve');

  // LLM availability: Gemini OR Ollama is sufficient. Read configured
  // Ollama model names so doctor can also verify they have been pulled.
  const ollamaUp = await httpOk('http://localhost:11434/api/tags');
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  let ollamaModels: string[] = [];

  if (ollamaUp) {
    try {
      const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      ollamaModels = (data.models ?? []).map((m) => m.name);
    } catch {
      /* best-effort only */
    }
  }

  const configuredModels = readConfiguredOllamaModels();
  const allConfiguredModelsPulled = configuredModels.every((model) =>
    ollamaModels.some((name) => normalizeModelName(name) === normalizeModelName(model)),
  );

  check(
    'LLM available (Gemini API key or Ollama)',
    hasGeminiKey || (ollamaUp && allConfiguredModelsPulled),
    configuredModels.length > 0 && ollamaUp
      ? `Pull the configured model: ollama pull ${configuredModels[0]}`
      : 'Set GEMINI_API_KEY, or start Ollama: task serve:ollama',
  );

  if (hasGeminiKey) check('Gemini API key', true, '');
  else skipped('Gemini API key', 'not set (OK because Ollama can be used)');

  if (ollamaUp) {
    check('Ollama daemon reachable (localhost:11434)', true, '');
    for (const model of configuredModels) {
      const pulled = ollamaModels.some((name) => normalizeModelName(name) === normalizeModelName(model));
      check(
        `Ollama model downloaded (${model})`,
        pulled,
        `Run: ollama pull ${model}`,
        hasGeminiKey,
      );
    }
    const names = ollamaModels.join(', ') || '(none)';
    console.log(`  \x1b[90mOllama models available: ${names}\x1b[0m`);
  } else if (hasGeminiKey) {
    skipped('Ollama daemon', 'not running (OK because Gemini is available)');
  } else {
    check('Ollama daemon reachable (localhost:11434)', false, 'Run: task serve:ollama');
  }

  // Config file
  check(
    'apvg.config.yml present in current directory',
    existsSync('apvg.config.yml'),
    'Run: pnpm apvg project init --repo <git-url> --url http://localhost:3000',
  );

  console.log();
  let allCriticalOk = true;
  for (const r of results) {
    const mark = r.ok
      ? '\x1b[32m✓\x1b[0m'
      : r.skipped
        ? '\x1b[90m-\x1b[0m'
        : '\x1b[31m✗\x1b[0m';
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

function readConfiguredOllamaModels(): string[] {
  const defaults = ['qwen2.5:7b-instruct'];
  if (!existsSync('apvg.config.yml')) return defaults;

  try {
    const yaml = require('js-yaml') as { load(input: string): unknown };
    const raw = yaml.load(readFileSync('apvg.config.yml', 'utf-8')) as {
      llm?: {
        provider?: string;
        model?: string;
        fallbackProvider?: string;
        fallbackModel?: string;
        tasks?: Record<string, { provider?: string; model?: string }>;
      };
    };
    const llm = raw?.llm;
    if (!llm) return defaults;

    const models = new Set<string>();
    if (llm.provider === 'ollama') models.add(llm.model ?? defaults[0]);
    if (llm.fallbackProvider === 'ollama') models.add(llm.fallbackModel ?? defaults[0]);
    for (const task of Object.values(llm.tasks ?? {})) {
      const provider = task.provider ?? llm.provider;
      if (provider === 'ollama') models.add(task.model ?? llm.model ?? defaults[0]);
    }
    return [...models];
  } catch {
    return defaults;
  }
}

function normalizeModelName(name: string): string {
  return name.includes(':') ? name : `${name}:latest`;
}

function configuredTargetType(): string | undefined {
  if (!existsSync('apvg.config.yml')) return undefined;
  try {
    const yaml = require('js-yaml') as { load(input: string): unknown };
    return (yaml.load(readFileSync('apvg.config.yml', 'utf8')) as { target?: { type?: string } })?.target?.type;
  } catch { return undefined; }
}

function androidSdkTool(name: 'adb' | 'emulator'): string {
  const executable = process.platform === 'win32' ? `${name}.exe` : name;
  const relative = name === 'adb' ? join('platform-tools', executable) : join('emulator', executable);
  for (const root of [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME]) {
    if (root && existsSync(join(root, relative))) return join(root, relative);
  }
  return executable;
}

main();
