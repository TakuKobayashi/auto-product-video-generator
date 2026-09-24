import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import type { StartedApp } from './server.js';
import { ensureServerRunning, httpReachable, runSetupSteps } from './server.js';

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

  it('does not pass APVG tsx config to target setup commands', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'apvg-project-env-'));
    const scriptPath = join(cwd, 'read-env.cjs');
    const outputPath = join(cwd, 'tsx-env.txt');
    await writeFile(
      scriptPath,
      "require('node:fs').writeFileSync(process.argv[2], process.env.TSX_TSCONFIG_PATH || 'unset')"
    );
    const previous = process.env.TSX_TSCONFIG_PATH;
    process.env.TSX_TSCONFIG_PATH = 'tsconfig.base.json';
    try {
      await runSetupSteps(
        [
          {
            name: 'Read environment',
            command: `"${process.execPath}" "${scriptPath}" "${outputPath}"`,
            background: false,
            readyTimeoutMs: 1000,
          },
        ],
        { cwd, logPath: join(cwd, 'setup.log') }
      );
      expect(await readFile(outputPath, 'utf8')).toBe('unset');
    } finally {
      if (previous === undefined) delete process.env.TSX_TSCONFIG_PATH;
      else process.env.TSX_TSCONFIG_PATH = previous;
    }
  });
});
