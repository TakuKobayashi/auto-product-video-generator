import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { logger } from '@auto-product-video-generator/core';
import { runExternal } from './services.js';

const require = createRequire(import.meta.url);

export async function runSetup(): Promise<void> {
  logger.info('Installing Playwright Chromium...');
  const playwrightCli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');
  await runExternal(process.execPath, [playwrightCli, 'install', 'chromium']);
  logger.success('Playwright Chromium is installed.');

  logger.success('APVG-managed tooling is installed.');
  logger.info(
    'Next, run `apvg doctor` to check Docker, Ollama/Gemini, git, and other system dependencies.'
  );
  logger.info('After the environment is ready, run `apvg serve` to start the required services.');
}
