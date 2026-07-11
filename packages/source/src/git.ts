import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { SourceConfig, logger } from '@demo-video-gen/core';

export interface ResolveSourceOptions {
  source: SourceConfig;
  /** Where to clone a remote repository into, e.g. `.dvg/source-repo`. Unused for `localPath`. */
  cloneDir: string;
}

/**
 * Resolves `source.repository` (git remote) or `source.localPath` (existing
 * checkout) down to a single absolute directory on disk that
 * `@demo-video-gen/source`'s inspector can read. Both paths require `git`
 * to be on PATH — even for `localPath`, since we verify it's actually a git
 * repository (this tool intentionally analyzes *version-controlled*
 * projects, not arbitrary folders).
 */
export async function resolveProjectSource(options: ResolveSourceOptions): Promise<string> {
  const { source } = options;

  if (source.localPath) {
    return resolveLocalPath(source.localPath);
  }

  if (source.repository) {
    return cloneOrUpdate(source.repository, source.ref, options.cloneDir);
  }

  throw new Error(
    'No project source configured. Set source.repository (git URL) or source.localPath in dvg.config.yaml.',
  );
}

async function resolveLocalPath(localPath: string): Promise<string> {
  const absPath = resolve(localPath);

  if (!existsSync(absPath)) {
    throw new Error(`source.localPath does not exist: ${absPath}`);
  }

  const isRepo = await git(['-C', absPath, 'rev-parse', '--is-inside-work-tree']).catch(() => null);
  if (!isRepo) {
    throw new Error(
      `source.localPath is not a git repository: ${absPath}\n` +
      `demo-video-gen analyzes version-controlled projects. Run 'git init' there first, or point ` +
      `source.repository at a remote instead.`,
    );
  }

  logger.info(`Using local git project: ${absPath}`);
  return absPath;
}

async function cloneOrUpdate(repository: string, ref: string | undefined, cloneDir: string): Promise<string> {
  const absCloneDir = resolve(cloneDir);
  await mkdir(dirname(absCloneDir), { recursive: true });

  const alreadyCloned = existsSync(absCloneDir) && (await isGitRepo(absCloneDir));

  if (alreadyCloned) {
    logger.step('source', `Updating existing clone: ${absCloneDir}`);
    try {
      const target = ref ?? 'HEAD';
      await git(['-C', absCloneDir, 'fetch', '--depth', '1', 'origin', target]);
      await git(['-C', absCloneDir, 'reset', '--hard', 'FETCH_HEAD']);
      logger.success('Clone updated.');
      return absCloneDir;
    } catch (err) {
      logger.warn(`Failed to update existing clone (${(err as Error).message}); re-cloning from scratch.`);
      await rm(absCloneDir, { recursive: true, force: true });
    }
  }

  logger.step('source', `Cloning ${repository}${ref ? ` (ref: ${ref})` : ''} into ${absCloneDir}...`);
  const args = ['clone', '--depth', '1'];
  if (ref) args.push('--branch', ref);
  args.push(repository, absCloneDir);

  try {
    await git(args);
  } catch (err) {
    throw new Error(
      `git clone failed: ${(err as Error).message}\n` +
      `Check that '${repository}' is reachable and, if private, that your git credentials are configured.`,
    );
  }

  logger.success(`Cloned into ${absCloneDir}`);
  return absCloneDir;
}

async function isGitRepo(dir: string): Promise<boolean> {
  return !!(await git(['-C', dir, 'rev-parse', '--is-inside-work-tree']).catch(() => null));
}

function git(args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error("git is not installed or not on PATH. Install it: https://git-scm.com/downloads"));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error(stderr.trim() || `git ${args.join(' ')} exited with code ${code}`));
    });
  });
}
