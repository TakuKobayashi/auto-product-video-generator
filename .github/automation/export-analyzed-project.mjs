import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const workDir = process.env.APVG_WORK_DIR;
const githubOutput = process.env.GITHUB_OUTPUT;
if (!workDir) throw new Error('APVG_WORK_DIR is required');
if (!githubOutput) throw new Error('GITHUB_OUTPUT is required');

const resolved = JSON.parse(await readFile(join(workDir, 'resolved-config.json'), 'utf8'));
const source = JSON.parse(await readFile(join(workDir, 'source-context.json'), 'utf8'));
const platform = resolved.platform;
const lines = [`platform=${platform}`];

if (platform === 'unity') {
  if (!source.rootDir) throw new Error('Unity project root was not recorded by project analyze');
  lines.push(`unity-project-path=${source.rootDir}`);
  lines.push(`unity-version-file=${join(source.rootDir, 'ProjectSettings', 'ProjectVersion.txt')}`);
}

await appendFile(githubOutput, `${lines.join('\n')}\n`, 'utf8');
