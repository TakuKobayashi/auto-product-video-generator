#!/usr/bin/env node
// The single entry point behind `task serve`. Starts every local service
// demo-video-gen depends on, waits until each is healthy, and then exits
// (services keep running in the background — VOICEVOX as a detached Docker
// container, Ollama as the OS-installed background service/daemon).
//
// Re-running is safe: already-running services are detected and left alone.
//
// Usage:
//   node scripts/serve.mjs --profile=local --with-ollama=true
import { log, parseArgs, run, runDetached, commandExists, httpHealthCheck, waitForHealth } from './lib/proc.mjs';
import { resolveModel } from './lib/model-profiles.mjs';

const args = parseArgs(process.argv.slice(2));
const profile = args.profile ?? 'local';
const withOllama = String(args.withOllama ?? 'true') === 'true';
const voicevoxImage = args.voicevoxImage ?? 'voicevox/voicevox_engine:cpu-latest';
const voicevoxContainer = 'dvg-voicevox';
const voicevoxUrl = 'http://localhost:50021/version';
const ollamaUrl = 'http://localhost:11434/api/tags';

async function main() {
  log.info(`Starting local services — profile=${profile} withOllama=${withOllama}`);
  console.log();

  await startVoicevox();
  console.log();

  if (withOllama) {
    await startOllama();
  } else {
    log.step('ollama', 'Skipped (--with-ollama=false) — using Gemini API instead.');
  }

  console.log();
  log.success('All requested services are up.');
  log.dim('  VOICEVOX: http://localhost:50021');
  if (withOllama) log.dim('  Ollama:   http://localhost:11434');
}

async function startVoicevox() {
  log.step('voicevox', 'Checking VOICEVOX Engine...');

  if (await httpHealthCheck(voicevoxUrl, 2000)) {
    log.success('VOICEVOX is already running.');
    return;
  }

  if (!commandExists('docker')) {
    log.error('Docker is required to run VOICEVOX Engine but was not found on PATH.');
    log.error('Install Docker Desktop: https://www.docker.com/products/docker-desktop/');
    log.error('(Alternatively, run VOICEVOX Engine natively — see https://voicevox.hiroshiba.jp/ —');
    log.error(' and point voicevox.host in dvg.config.yaml at it.)');
    process.exitCode = 1;
    return;
  }

  // Clean up any stopped container with the same name from a previous run.
  await run('docker', ['rm', '-f', voicevoxContainer]).catch(() => {});

  log.info(`Starting VOICEVOX Engine (${voicevoxImage}) on port 50021...`);
  await run('docker', [
    'run', '-d', '--rm',
    '--name', voicevoxContainer,
    '-p', '50021:50021',
    voicevoxImage,
  ]);

  log.info('Waiting for VOICEVOX to become healthy...');
  const healthy = await waitForHealth(voicevoxUrl, { timeoutMs: 60000 });
  if (healthy) {
    log.success('VOICEVOX Engine is up: http://localhost:50021');
  } else {
    log.warn('VOICEVOX did not report healthy within 60s — it may still be starting.');
    log.warn(`Check logs with: docker logs ${voicevoxContainer}`);
  }
}

async function startOllama() {
  log.step('ollama', 'Checking Ollama daemon...');

  if (await httpHealthCheck(ollamaUrl, 2000)) {
    log.success('Ollama is already running.');
  } else if (!commandExists('ollama')) {
    log.error("Ollama is not installed. Run: task install:ollama");
    process.exitCode = 1;
    return;
  } else {
    log.info('Starting `ollama serve` in the background...');
    runDetached('ollama', ['serve']);
    const healthy = await waitForHealth(ollamaUrl, { timeoutMs: 20000 });
    if (healthy) {
      log.success('Ollama is up: http://localhost:11434');
    } else {
      log.warn('Ollama did not report healthy within 20s.');
      log.warn('It may already be managed by an OS-level service/tray app — check manually.');
    }
  }

  const model = resolveModel(profile, args.model);
  log.info(`Ensuring model '${model}' is available (this can take a while the first time)...`);
  try {
    await run('ollama', ['pull', model]);
  } catch (err) {
    log.warn(`Could not verify/pull model '${model}': ${err.message}`);
    log.warn(`Run manually: ollama pull ${model}`);
  }
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
