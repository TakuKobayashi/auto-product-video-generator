import { runSetupSteps, httpReachable } from './server.js';
import { existsSync } from 'node:fs';

async function main() {
  await runSetupSteps(
    [
      { name: 'Write marker', command: 'sh -c "echo hello > /tmp/setup-test-marker.txt"', background: false, readyTimeoutMs: 5000 },
      { name: 'Start server', command: 'python3 -m http.server 4125', background: true, readyUrl: 'http://localhost:4125', readyTimeoutMs: 15000 },
    ],
    { cwd: '/tmp', logPath: '/tmp/setup-test.log' },
  );
  console.log('marker exists:', existsSync('/tmp/setup-test-marker.txt'));
  console.log('server reachable:', await httpReachable('http://localhost:4125'));
}
main();
