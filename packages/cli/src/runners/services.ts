import { spawn } from 'node:child_process';
import { logger } from '@auto-product-video-generator/core';

const VOICEVOX_URL = 'http://localhost:50021/version';
const OLLAMA_URL = 'http://localhost:11434/api/tags';
const VOICEVOX_CONTAINER = 'apvg-voicevox';
const DEFAULT_VOICEVOX_IMAGE = 'voicevox/voicevox_engine:cpu-latest';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b-instruct';

export interface ServeOptions {
  ollama?: boolean;
  model?: string;
  voicevoxImage?: string;
}

async function reachable(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}

export function runExternal(
  command: string,
  args: string[],
  options: { detached?: boolean } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: options.detached,
      stdio: options.detached ? 'ignore' : 'inherit',
      windowsHide: true,
      shell: false,
    });
    child.once('error', (error) => reject(new Error(`Could not run ${command}: ${error.message}`)));
    if (options.detached) {
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
      return;
    }
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function waitFor(url: string, label: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)} seconds.`);
}

export async function serveServices(options: ServeOptions): Promise<void> {
  if (await reachable(VOICEVOX_URL)) {
    logger.success('VOICEVOX Engine is already running on localhost:50021');
  } else {
    logger.info('Starting VOICEVOX Engine with Docker...');
    try {
      await runExternal('docker', [
        'run',
        '-d',
        '--rm',
        '--name',
        VOICEVOX_CONTAINER,
        '-p',
        '50021:50021',
        options.voicevoxImage || DEFAULT_VOICEVOX_IMAGE,
      ]);
    } catch (error) {
      throw new Error(
        `Unable to start VOICEVOX Engine. Install and start Docker Desktop, then retry.\n${error instanceof Error ? error.message : String(error)}`
      );
    }
    await waitFor(VOICEVOX_URL, 'VOICEVOX Engine');
    logger.success('VOICEVOX Engine is ready on localhost:50021');
  }

  const useOllama = options.ollama !== false && !process.env.GEMINI_API_KEY;
  if (!useOllama) {
    logger.info(
      process.env.GEMINI_API_KEY
        ? 'GEMINI_API_KEY is set; Ollama startup is not required.'
        : 'Ollama startup was skipped.'
    );
    return;
  }

  if (!(await reachable(OLLAMA_URL))) {
    logger.info('Starting Ollama...');
    try {
      await runExternal('ollama', ['serve'], { detached: true });
      await waitFor(OLLAMA_URL, 'Ollama', 30_000);
    } catch (error) {
      throw new Error(
        `Unable to start Ollama. Install it from https://ollama.com/download or set GEMINI_API_KEY.\n${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    logger.success('Ollama is already running on localhost:11434');
  }

  const model = options.model || DEFAULT_OLLAMA_MODEL;
  logger.info(`Ensuring Ollama model is available: ${model}`);
  await runExternal('ollama', ['pull', model]);
  logger.success(`Ollama model is ready: ${model}`);
}

export async function showServiceStatus(): Promise<void> {
  const voicevox = await reachable(VOICEVOX_URL);
  const ollama = await reachable(OLLAMA_URL);
  console.log(`${voicevox ? '✓' : '✗'} VOICEVOX Engine  http://localhost:50021`);
  console.log(
    `${ollama ? '✓' : '-'} Ollama           http://localhost:11434${process.env.GEMINI_API_KEY ? ' (optional: GEMINI_API_KEY is set)' : ''}`
  );
  if (!voicevox) process.exitCode = 1;
  if (!ollama && !process.env.GEMINI_API_KEY) process.exitCode = 1;
}

export async function stopServices(): Promise<void> {
  try {
    await runExternal('docker', ['rm', '-f', VOICEVOX_CONTAINER]);
    logger.success(`Stopped ${VOICEVOX_CONTAINER}`);
  } catch {
    logger.info('The APVG VOICEVOX container was not running.');
  }
  logger.info(
    'Ollama was left running because it may be managed by the operating system or used by other applications.'
  );
}
