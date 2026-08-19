import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ApvgConfig, ProjectPlatform } from '@auto-product-video-generator/core';
import { logger } from '@auto-product-video-generator/core';

export function resolveWebStorageState(
  config: ApvgConfig,
  platform: ProjectPlatform,
  dryRun: boolean,
): string | undefined {
  if (platform !== 'web' || !config.target.auth) return undefined;

  const storageStatePath = resolve(config.target.auth.storageStatePath);
  if (!dryRun && !existsSync(storageStatePath)) {
    throw new Error(
      `Web authentication state not found: ${storageStatePath}\n` +
      `Run 'pnpm apvg auth login' before recording, or remove target.auth when login is not required.`,
    );
  }
  logger.info(`Web authentication: ${storageStatePath}${dryRun ? ' (not loaded in dry-run)' : ''}`);
  return storageStatePath;
}
