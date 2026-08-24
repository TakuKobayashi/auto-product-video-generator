import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { StartedApp } from './server.js';
import { ensureServerRunning, httpReachable } from './server.js';

describe('dev server lifecycle', () => {
  let startedApp: StartedApp | undefined;

  afterEach(async () => {
    await startedApp?.stop();
  });

  it('stops the process tree that APVG started', async () => {
    const port = 38471;
    const url = `http://127.0.0.1:${port}`;
    const script = `require('http').createServer((req,res)=>res.end('ok')).listen(${port})`;

    startedApp = await ensureServerRunning({
      url,
      startCommand: `node -e "${script}"`,
      cwd: process.cwd(),
      installDeps: false,
      logPath: join(tmpdir(), `apvg-server-lifecycle-${process.pid}.log`),
      timeoutMs: 10000,
    });

    expect(startedApp).toBeDefined();
    expect(await httpReachable(url)).toBe(true);
    await startedApp?.stop();
    startedApp = undefined;

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(await httpReachable(url, 500)).toBe(false);
  });
});
