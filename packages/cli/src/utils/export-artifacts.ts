import { cp, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { logger } from '@auto-product-video-generator/core';

const GENERATED_FILES = [
  'project-summary.json',
  'source-context.json',
  'scenario.yml',
  'script.yml',
  'subtitles.srt',
  'timeline.json',
  'dev-server.log',
];

const GENERATED_DIRS = ['voice', 'recordings', 'screenshots'];

/**
 * Copies user-relevant intermediate results next to final.mp4. The cloned
 * source-repo is intentionally excluded: it is an input/cache and can be
 * very large, rather than a generated video artifact.
 */
export async function exportArtifacts(
  workDir: string,
  outputDir: string,
  configPath: string,
  overrides: {
    files?: Record<string, string>;
    dirs?: Record<string, string>;
    artifactsDir?: string;
  } = {}
): Promise<string> {
  const artifactsDir = overrides.artifactsDir || join(outputDir, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  for (const name of GENERATED_FILES) {
    const source = overrides.files?.[name] || join(workDir, name);
    if (existsSync(source)) await copyFile(source, join(artifactsDir, name));
  }

  for (const name of GENERATED_DIRS) {
    const source = overrides.dirs?.[name] || join(workDir, name);
    const destination = join(artifactsDir, name);
    if (existsSync(source) && resolve(source) !== resolve(destination)) {
      await cp(source, destination, { recursive: true, force: true });
    }
  }

  if (existsSync(configPath)) {
    await copyFile(configPath, join(artifactsDir, basename(configPath)));
  }

  logger.success(`Exported intermediate artifacts: ${artifactsDir}`);
  return artifactsDir;
}
