import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { ApvgConfigSchema } from '@auto-product-video-generator/core';
import { createPlatformRecorder } from './factory.js';
import { resolveUnityEditorPath, UnityRecorder, unityEditorCandidates } from './unity-recorder.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe('UnityRecorder', () => {
  it('is selected for Unity when recorder mode is configured', () => {
    const config = ApvgConfigSchema.parse({
      project: { name: 'Unity game' },
      source: { localPath: '.' },
      target: {
        url: 'http://localhost:3000',
        type: 'unity',
        unity: {},
      },
    });
    expect(createPlatformRecorder('unity', config, { workDir: '.apvg' })).toBeInstanceOf(
      UnityRecorder
    );
  });

  it('accepts an explicitly configured Unity executable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'apvg-unity-'));
    temporaryDirectories.push(root);
    const executable = join(root, process.platform === 'win32' ? 'Unity.exe' : 'Unity');
    await writeFile(executable, '');
    await expect(resolveUnityEditorPath(root, executable)).resolves.toBe(executable);
  });

  it('builds a platform-specific Unity Hub editor candidate', () => {
    expect(unityEditorCandidates('6000.0.1f1')[0]).toContain('6000.0.1f1');
  });
});
