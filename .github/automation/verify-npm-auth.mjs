import { execFileSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
  throw new Error('GitHub OIDC is unavailable; check the id-token: write permission.');
}

if (process.env.NODE_AUTH_TOKEN) {
  throw new Error('NODE_AUTH_TOKEN must not be set when using trusted publishing.');
}

execFileSync(npmCommand, ['--version'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
