import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { resolve } from 'node:path';
import { loadConfig, logger } from '@auto-product-video-generator/core';
import { captureWebAuthState } from '@auto-product-video-generator/playwright';

interface AuthLoginOptions {
  config?: string;
  loginUrl?: string;
  storageState?: string;
  successUrl?: string;
  timeout?: string;
  slowMo?: string;
}

export async function runAuthLogin(options: AuthLoginOptions): Promise<void> {
  logger.header('apvg auth login');

  const config = await loadConfig(options.config || 'apvg.config.yml');
  if (config.target.type !== 'web') {
    throw new Error(`Manual browser login currently supports only target.type: web (received '${config.target.type}').`);
  }

  const auth = config.target.auth;
  if (!auth) {
    throw new Error(
      "target.auth is not configured. Add a manual auth block to apvg.config.yml before running 'apvg auth login'.",
    );
  }
  const loginUrl = options.loginUrl || auth?.loginUrl || config.target.url;
  const successUrl = options.successUrl || auth?.successUrl;
  const storageStatePath = resolve(
    options.storageState || auth.storageStatePath,
  );
  const timeoutSeconds = parseNonNegativeNumber(options.timeout || '600', '--timeout');
  const slowMo = parseNonNegativeNumber(options.slowMo || '0', '--slow-mo');

  logger.info('A browser window will open. Complete the product login there.');
  logger.info(`Authentication state: ${storageStatePath}`);
  logger.warn('This file can impersonate the test account. Never commit or share it.');

  await captureWebAuthState({
    loginUrl,
    successUrl,
    storageStatePath,
    timeoutMs: timeoutSeconds * 1000,
    slowMo,
    waitForManualConfirmation: successUrl ? undefined : waitForEnter,
  });

  logger.success(`Saved authenticated browser state: ${storageStatePath}`);
  logger.info('Future web recordings will reuse this state automatically.');
}

async function waitForEnter(): Promise<void> {
  if (!stdin.isTTY) {
    throw new Error('Interactive input is unavailable. Configure target.auth.successUrl or pass --success-url.');
  }
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    await readline.question('Complete login in the browser, then press Enter here to save the session...');
  } finally {
    readline.close();
  }
}

function parseNonNegativeNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${option} must be a non-negative number.`);
  }
  return parsed;
}
