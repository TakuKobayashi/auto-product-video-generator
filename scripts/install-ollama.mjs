#!/usr/bin/env node
// Installs the Ollama daemon (if missing) and pulls the model appropriate
// for the given profile. Safe to re-run — every step checks current state
// first.
//
// Usage:
//   node scripts/install-ollama.mjs --profile=local
//   node scripts/install-ollama.mjs --profile=ci --model=qwen2.5:3b-instruct
import { log, parseArgs, commandExists, run } from './lib/proc.mjs';
import { resolveModel, MODEL_PROFILES } from './lib/model-profiles.mjs';

const args = parseArgs(process.argv.slice(2));
const profile = args.profile ?? 'local';
const model = resolveModel(profile, args.model);

async function main() {
  log.step('ollama', `Profile: ${profile} → model: ${model}`);
  if (MODEL_PROFILES[profile]) {
    log.dim(`  ${MODEL_PROFILES[profile].description}`);
  }

  await ensureOllamaInstalled();
  await pullModel(model);

  log.success(`Ollama ready with model '${model}'.`);
}

async function ensureOllamaInstalled() {
  if (commandExists('ollama')) {
    log.success('Ollama binary already installed.');
    return;
  }

  log.info('Ollama not found — attempting automatic install...');

  switch (process.platform) {
    case 'linux': {
      // Official install script; works unmodified on GitHub Actions'
      // ubuntu-latest runners (root, systemd available).
      await run('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh']);
      break;
    }
    case 'darwin': {
      if (commandExists('brew')) {
        await run('brew', ['install', 'ollama']);
      } else {
        printManualInstallInstructions();
        throw new Error('Homebrew not found. Install Ollama manually and re-run this command.');
      }
      break;
    }
    case 'win32': {
      if (commandExists('winget')) {
        try {
          await run('winget', [
            'install', '--id', 'Ollama.Ollama', '-e',
            '--accept-package-agreements', '--accept-source-agreements',
          ]);
        } catch (err) {
          printManualInstallInstructions();
          throw err;
        }
      } else {
        printManualInstallInstructions();
        throw new Error('winget not found. Install Ollama manually and re-run this command.');
      }
      break;
    }
    default:
      printManualInstallInstructions();
      throw new Error(`Unsupported platform: ${process.platform}`);
  }

  if (!commandExists('ollama')) {
    log.warn(
      'Ollama was installed but is not yet on PATH in this shell. ' +
      'Open a new terminal (or re-login) and re-run this command.',
    );
    throw new Error('ollama not found on PATH after install.');
  }
}

function printManualInstallInstructions() {
  log.warn('Automatic install did not succeed. Install manually from:');
  log.warn('  https://ollama.com/download');
  log.warn('Then re-run: task install:ollama');
}

async function pullModel(modelName) {
  log.info(`Pulling model '${modelName}' (skipped automatically if already present)...`);
  await run('ollama', ['pull', modelName]);
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
