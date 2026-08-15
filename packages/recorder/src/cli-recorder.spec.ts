import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { CliRecorder } from './cli-recorder.js';

describe('CliRecorder', () => {
  it('supports dry-run without starting Docker', async () => {
    const recorder = new CliRecorder({
      image: 'apvg-cli-recorder:latest', shell: '/bin/bash', columns: 100, rows: 30, fontSize: 22,
      allowedCommands: [], deniedCommandPatterns: [],
    }, { setupSteps: [], sourceExcludePatterns: [] });
    const output = await recorder.recordScene({
      id: 'help', title: 'Help', narration: 'Help', effects: [],
      actions: [{ type: 'run_command', command: 'example --help' }],
    }, {
      type: 'demo', duration: 10, resolution: '1280x720', fps: 30,
      language: 'ja', pageReadyWaitSeconds: 2, sceneGapSeconds: 1,
    }, {
      headed: false, slowMo: 0, outputDir: '/tmp/apvg-cli-test',
      screenshotDir: '/tmp/apvg-cli-test/screenshots', dryRun: true,
    });
    expect(output).toBe(join('/tmp/apvg-cli-test', 'scene-help.mp4'));
  });
});
