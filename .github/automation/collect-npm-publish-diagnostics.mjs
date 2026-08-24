import { execFileSync } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const diagnostics = join(process.env.RUNNER_TEMP || tmpdir(), 'npm-publish-diagnostics');
const npmLogsDestination = join(diagnostics, 'npm-logs');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
await mkdir(npmLogsDestination, { recursive: true });

function output(command, args) {
  try {
    return (
      execFileSync(command, args, {
        encoding: 'utf8',
        shell: process.platform === 'win32',
      }).trim() + '\n'
    );
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message : String(error)}\n`;
  }
}

await Promise.all([
  writeFile(join(diagnostics, 'npm-version.txt'), output(npmCommand, ['--version'])),
  writeFile(join(diagnostics, 'node-version.txt'), `${process.version}\n`),
  writeFile(join(diagnostics, 'registry.txt'), output(npmCommand, ['config', 'get', 'registry'])),
  writeFile(
    join(diagnostics, 'environment.txt'),
    [
      `repository=${process.env.GITHUB_REPOSITORY || ''}`,
      `workflow_ref=${process.env.GITHUB_WORKFLOW_REF || ''}`,
      `ref=${process.env.GITHUB_REF || ''}`,
      `runner_environment=${process.env.RUNNER_ENVIRONMENT || ''}`,
      `oidc_request_url=${process.env.ACTIONS_ID_TOKEN_REQUEST_URL ? 'present' : 'missing'}`,
      `oidc_request_token=${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ? 'present' : 'missing'}`,
      `node_auth_token=${process.env.NODE_AUTH_TOKEN ? 'present' : 'missing'}`,
      '',
    ].join('\n')
  ),
]);

await cp(join(homedir(), '.npm', '_logs'), npmLogsDestination, {
  recursive: true,
  force: true,
}).catch(() => undefined);
