import { chromium } from 'playwright';
import { chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { logger } from '@auto-product-video-generator/core';

export interface CaptureWebAuthOptions {
  loginUrl: string;
  storageStatePath: string;
  successUrl?: string;
  timeoutMs?: number;
  slowMo?: number;
  waitForManualConfirmation?: () => Promise<void>;
}

/** Open an isolated headed browser and persist its authenticated state. */
export async function captureWebAuthState(options: CaptureWebAuthOptions): Promise<void> {
  await mkdir(dirname(options.storageStatePath), { recursive: true, mode: 0o700 });

  const browser = await chromium.launch({ headless: false, slowMo: options.slowMo ?? 0 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    logger.info(`Opening login page: ${options.loginUrl}`);
    await page.goto(options.loginUrl, { waitUntil: 'domcontentloaded' });

    if (options.successUrl) {
      logger.info(`Waiting for successful login at: ${options.successUrl}`);
      await page.waitForURL((url) => url.href.startsWith(options.successUrl!), {
        timeout: options.timeoutMs ?? 10 * 60 * 1000,
      });
    } else {
      if (!options.waitForManualConfirmation) {
        throw new Error(
          'Manual login confirmation is unavailable. Configure target.auth.successUrl.'
        );
      }
      await options.waitForManualConfirmation();
    }

    await context.storageState({
      path: options.storageStatePath,
      indexedDB: true,
      credentials: true,
    });
    // Best effort on POSIX; Windows ACLs are managed by the current account.
    await chmod(options.storageStatePath, 0o600).catch(() => undefined);
  } finally {
    await context.close();
    await browser.close();
  }
}
