import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectProject } from './inspector.js';

describe('Unity source inspection', () => {
  it('starts from enabled Build Settings scenes and resolves referenced scripts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'apvg-unity-inspection-'));
    await Promise.all([
      mkdir(join(root, '.git')),
      mkdir(join(root, 'Assets', 'Game'), { recursive: true }),
      mkdir(join(root, 'Assets', 'IsoTools'), { recursive: true }),
      mkdir(join(root, 'ProjectSettings')),
      mkdir(join(root, 'Packages')),
    ]);
    await Promise.all([
      writeFile(
        join(root, 'ProjectSettings', 'EditorBuildSettings.asset'),
        'm_Scenes:\n- enabled: 1\n  path: Assets/Game/Title.unity\n- enabled: 0\n  path: Assets/Game/Unused.unity\n'
      ),
      writeFile(
        join(root, 'ProjectSettings', 'ProjectVersion.txt'),
        'm_EditorVersion: 6000.3.6f1\n'
      ),
      writeFile(
        join(root, 'Packages', 'manifest.json'),
        '{"dependencies":{"com.unity.recorder":"5.1.4"}}'
      ),
      writeFile(
        join(root, 'Assets', 'Game', 'Title.unity'),
        'GameObject:\n  m_Name: Start Game\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 3}\n'
      ),
      writeFile(join(root, 'Assets', 'Game', 'Title.cs'), 'class Title { void StartGame() {} }'),
      writeFile(
        join(root, 'Assets', 'Game', 'Title.cs.meta'),
        'guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n'
      ),
      writeFile(join(root, 'Assets', 'IsoTools', 'Vendor.cs'), 'class Vendor {}'),
      writeFile(
        join(root, 'Assets', 'IsoTools', 'Vendor.cs.meta'),
        'guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n'
      ),
    ]);

    const context = await inspectProject(root);

    expect(context.unity?.enabledScenes).toHaveLength(1);
    expect(context.unity?.enabledScenes[0]).toMatchObject({
      path: 'Assets/Game/Title.unity',
      objectNames: ['Start Game'],
      referencedScripts: ['Assets/Game/Title.cs'],
    });
    expect(context.unity?.projectScripts.map((script) => script.path)).toContain(
      'Assets/Game/Title.cs'
    );
    expect(context.unity?.projectScripts.map((script) => script.path)).not.toContain(
      'Assets/IsoTools/Vendor.cs'
    );
  });
});
