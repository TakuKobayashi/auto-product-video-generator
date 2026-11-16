import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLATFORM_PRIORITY } from '@auto-product-video-generator/core';
import { resolveProjectSource } from './git.js';
import { spawn } from 'node:child_process';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: () => false,
}));
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  mkdir: vi.fn(),
}));
vi.mock('./workspace-selector.js', () => ({
  selectProjectRoot: vi.fn(async (root: string) => root),
}));

function clone(repository: string, ref?: string): Promise<string> {
  return resolveProjectSource({
    source: { repository, ref, installDeps: false, platformPriority: DEFAULT_PLATFORM_PRIORITY },
    cloneDir: '.apvg/test-clone',
  });
}

function cloneResult(code: number, message = ''): ReturnType<typeof spawn> {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
  queueMicrotask(() => {
    proc.stderr.emit('data', Buffer.from(message));
    proc.emit('close', code);
  });
  return proc as ReturnType<typeof spawn>;
}

describe('repository cloning', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockImplementation(() => cloneResult(0));
  });

  it.each(['https://github.com/team/repo', 'git@gitlab.com:team/subgroup/repo'])(
    'passes the normalized URL to git clone: %s',
    async (repository) => {
      await expect(clone(repository, 'release')).resolves.toBe(resolve('.apvg/test-clone'));
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledWith(
        'git',
        [
          'clone',
          '--depth',
          '1',
          '--branch',
          'release',
          `${repository}.git`,
          resolve('.apvg/test-clone'),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
    }
  );

  it('falls back to the original URL for servers without the suffix', async () => {
    vi.mocked(spawn).mockImplementationOnce(() => cloneResult(128, 'Repository not found'));
    await clone('https://git.example.com/custom/repo', 'release');
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(spawn).mock.calls[1][1]).toEqual([
      'clone',
      '--depth',
      '1',
      '--branch',
      'release',
      'https://git.example.com/custom/repo',
      resolve('.apvg/test-clone'),
    ]);
  });

  it('reports both failures when neither URL can be cloned', async () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => cloneResult(128, 'Normalized failed'))
      .mockImplementationOnce(() => cloneResult(128, 'Original failed'));
    await expect(clone('https://git.example.com/team/repo')).rejects.toThrow(
      /Normalized failed[\s\S]*Original failed/
    );
  });

  it.each(['https://github.com/team/repo.git', '../local-repo'])(
    'does not retry an unchanged address: %s',
    async (repository) => {
      vi.mocked(spawn).mockImplementationOnce(() => cloneResult(128, 'Clone failed'));
      await expect(clone(repository)).rejects.toThrow('git clone failed');
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(vi.mocked(spawn).mock.calls[0][1]).toContain(repository);
    }
  );
});
