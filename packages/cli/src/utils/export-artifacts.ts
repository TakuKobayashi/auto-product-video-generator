import { cp, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { logger } from '@demo-video-gen/core';

const GENERATED_FILES = [
  'project-summary.json',
  'source-context.json',
  'scenario.yaml',
  'script.yaml',
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
): Promise<string> {
  const artifactsDir = join(outputDir, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  for (const name of GENERATED_FILES) {
    const source = join(workDir, name);
    if (existsSync(source)) await copyFile(source, join(artifactsDir, name));
  }

  for (const name of GENERATED_DIRS) {
    const source = join(workDir, name);
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
