import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLATFORM_PRIORITY } from '@auto-product-video-generator/core';
import { selectProjectRoot } from './workspace-selector.js';

async function packageJson(root: string, path: string, value: object): Promise<void> {
  const directory = join(root, path);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify(value));
}

describe('selectProjectRoot', () => {
  it('selects the runnable web application in a mixed monorepo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'apvg-monorepo-'));
    await packageJson(root, '.', { scripts: { dev: 'pnpm --filter @sample/web dev' } });
    await packageJson(root, 'apps/cli', { scripts: { dev: 'tsx src.ts' } });
    await packageJson(root, 'apps/web-ui', { dependencies: { react: '^19.0.0' } });
    await packageJson(root, 'apps/web', {
      name: '@sample/web',
      scripts: { dev: 'next dev' },
      dependencies: { next: '^15.0.0' },
    });
    await packageJson(root, 'packages/shared', { name: '@sample/shared' });

    await expect(
      selectProjectRoot(root, {
        localPath: root,
        installDeps: false,
        platformPriority: DEFAULT_PLATFORM_PRIORITY,
      })
    ).resolves.toBe(join(root, 'apps/web'));
  });

  it('honors an explicit projectPath override', async () => {
    const root = await mkdtemp(join(tmpdir(), 'apvg-monorepo-'));
    await packageJson(root, 'apps/web', {
      scripts: { dev: 'vite' },
      dependencies: { vite: '^7.0.0' },
    });
    await packageJson(root, 'apps/admin', {
      scripts: { dev: 'vite' },
      dependencies: { vite: '^7.0.0' },
    });

    await expect(
      selectProjectRoot(root, {
        localPath: root,
        installDeps: false,
        projectPath: 'apps/admin',
        platformPriority: DEFAULT_PLATFORM_PRIORITY,
      })
    ).resolves.toBe(join(root, 'apps/admin'));
  });

  it('uses configured platform priority before candidate score', async () => {
    const root = await mkdtemp(join(tmpdir(), 'apvg-monorepo-'));
    await packageJson(root, 'apps/web', {
      scripts: { dev: 'vite' },
      dependencies: { vite: '^7.0.0' },
    });
    await packageJson(root, 'apps/mobile', {
      scripts: { dev: 'react-native start' },
      dependencies: { 'react-native': '^0.80.0' },
    });

    await expect(
      selectProjectRoot(root, {
        localPath: root,
        installDeps: false,
        // No iOS candidate exists, so selection proceeds to React Native.
        platformPriority: ['ios', 'react-native', 'web', 'other'],
      })
    ).resolves.toBe(join(root, 'apps/mobile'));
  });

  it('recognizes a package.json bin entry as a CLI application', async () => {
    const root = await mkdtemp(join(tmpdir(), 'apvg-monorepo-'));
    await packageJson(root, 'packages/shared', { name: '@sample/shared' });
    await packageJson(root, 'apps/tool', {
      name: '@sample/tool',
      bin: { sample: './dist/index.js' },
      dependencies: { commander: '^12.0.0' },
    });

    await expect(
      selectProjectRoot(root, {
        localPath: root,
        installDeps: false,
        platformPriority: ['cli', 'other'],
      })
    ).resolves.toBe(join(root, 'apps/tool'));
  });
});
