#!/usr/bin/env node
// The single entry point behind `task install`. Sets up everything needed
// to run demo-video-gen locally:
//   1. Node dependencies (also triggers ffmpeg-static / ffprobe-static
//      postinstall downloads — no manual ffmpeg install needed)
//   2. Playwright's Chromium browser
//   3. (optional) Ollama + a local LLM model, so Gemini isn't required
//
// Usage:
//   node scripts/install.mjs --profile=local --with-ollama=true
//   node scripts/install.mjs --profile=ci    --with-ollama=false
import { log, parseArgs, run } from './lib/proc.mjs';
import { resolveModel } from './lib/model-profiles.mjs';

const args = parseArgs(process.argv.slice(2));
const profile = args.profile ?? 'local';
const withOllama = String(args.withOllama ?? 'true') === 'true';

async function main() {
  log.info(`demo-video-gen install — profile=${profile} withOllama=${withOllama}`);
  console.log();

  log.step('1/4', 'Installing Node.js dependencies (pnpm install)...');
  try {
    await run('pnpm', ['install'], {
      env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
    });
  } catch (err) {
    log.error(`pnpm install failed: ${err.message}`);
    log.error('');
    log.error('This usually means one of the bundled binary downloads was blocked');
    log.error('(ffmpeg, or the optional `task` CLI) — often a restrictive network/proxy.');
    log.error('Things to try:');
    log.error('  - Re-run this command (transient network errors are common)');
    log.error('  - Install ffmpeg yourself and re-run — it will be used automatically:');
    log.error('      Windows: winget install ffmpeg   macOS: brew install ffmpeg   Linux: apt install ffmpeg');
    log.error('  - As a last resort: pnpm install --ignore-scripts, then re-run this command');
    throw err;
  }
  log.success('Node dependencies installed.');
  console.log();

  log.step('2/4', 'Verifying ffmpeg binary...');
  await run('node', ['scripts/install-ffmpeg.mjs']);
  console.log();

  log.step('3/4', 'Installing Playwright Chromium...');
  await run('node', ['scripts/install-playwright.mjs']);
  console.log();

  if (withOllama) {
    log.step('4/4', 'Installing Ollama + local LLM model...');
    const model = resolveModel(profile, args.model);
    await run('node', ['scripts/install-ollama.mjs', `--profile=${profile}`, `--model=${model}`]);
  } else {
    log.step('4/4', 'Skipping Ollama (--with-ollama=false). Gemini API will be used instead.');
    log.dim('  Make sure GEMINI_API_KEY is set (see .env.example).');
  }

  console.log();
  log.success('Install complete!');
  console.log();
  log.info('Next steps:');
  log.dim('  1. pnpm run serve        # start VOICEVOX (+ Ollama) in the background');
  log.dim('  2. pnpm dev -- init --url http://localhost:3000');
  log.dim('  3. pnpm dev -- build');
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
