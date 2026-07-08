#!/usr/bin/env node
// Stops services started by scripts/serve.mjs. Ollama is intentionally left
// running since on macOS/Windows it's installed as an OS-level background
// service/tray app, not something we started ourselves.
import { log, run, commandExists } from './lib/proc.mjs';

async function main() {
  if (commandExists('docker')) {
    log.step('voicevox', 'Stopping container dvg-voicevox (if running)...');
    await run('docker', ['rm', '-f', 'dvg-voicevox']).catch(() => {
      log.dim('  (nothing to stop)');
    });
  }
  log.success('Done. (Ollama, if running as an OS service, was left untouched.)');
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
