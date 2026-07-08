#!/usr/bin/env node
// Installs the Chromium browser Playwright needs for `demo-video-gen record`.
// On Linux, also attempts to install OS-level dependencies (needs sudo /
// root — this succeeds unmodified on GitHub Actions runners, and is
// best-effort locally: if it fails we just warn and continue, since the
// browser itself will still work in most cases).
import { log, run, commandExists } from './lib/proc.mjs';

async function main() {
  log.step('playwright', 'Installing Chromium browser...');
  await run('npx', ['playwright', 'install', 'chromium']);

  if (process.platform === 'linux') {
    log.step('playwright', 'Installing Linux OS dependencies for Chromium...');
    try {
      await run('npx', ['playwright', 'install-deps', 'chromium']);
    } catch (err) {
      log.warn(`install-deps failed (${err.message}). This usually needs root/sudo.`);
      log.warn('If recording fails later, run manually:');
      log.warn('  sudo npx playwright install-deps chromium');
    }
  }

  log.success('Playwright Chromium is ready.');
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
