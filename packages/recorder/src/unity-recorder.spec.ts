import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { ApvgConfigSchema } from '@auto-product-video-generator/core';
import { createPlatformRecorder } from './factory.js';
import {
  resolveUnityEditorPath,
  loadUnityEditorScript,
  UnityRecorder,
  unityEditorCandidates,
} from './unity-recorder.js';

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

  it('loads the external C# batch recorder for enabled Build Settings scenes', async () => {
    const script = await loadUnityEditorScript();
    expect(script).toContain('EditorBuildSettings.scenes');
    expect(script).toContain('RecorderController');
    expect(script).toContain('new RenderTextureInputSettings');
    expect(script).toContain('EditorWindow.GetWindow(gameViewType');
    expect(script).toContain('const string WarmingUp = "warming-up"');
    expect(script).toContain('SetRecordModeToManual');
    expect(script).toContain('controller.StopRecording()');
    expect(script).toContain('IsFileReady(job.output)');
    expect(script).toContain('EditorApplication.ExitPlaymode()');
    expect(script).toContain('EditorApplication.EnterPlaymode()');
    expect(unityEditorCandidates('6000.0.1f1')[0]).toContain('6000.0.1f1');
  });
});
