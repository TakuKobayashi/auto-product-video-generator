import { describe, expect, it } from 'vitest';
import type { Timeline } from '@auto-product-video-generator/core';
import { FfmpegRenderer } from './ffmpeg.js';

describe('FfmpegRenderer narration mix', () => {
  it('does not attenuate early clips and normalizes the final narration loudly', () => {
    const timeline: Timeline = {
      meta: {
        totalDuration: 10,
        resolution: '1280x720',
        fps: 30,
        generatedAt: new Date().toISOString(),
      },
      tracks: [
        { type: 'video', id: 'v1', sceneId: 'one', src: 'one.webm', startTime: 0, endTime: 10 },
        { type: 'audio', id: 'a1', sceneId: 'one', src: 'one.wav', startTime: 0, endTime: 2 },
        { type: 'audio', id: 'a2', sceneId: 'two', src: 'two.wav', startTime: 5, endTime: 7 },
      ],
    };
    const renderer = new FfmpegRenderer() as unknown as {
      buildCommand(timeline: Timeline, outputPath: string, options: object): string[];
    };

    const command = renderer.buildCommand(timeline, 'output.mp4', {
      noSubtitles: true,
      noVoice: false,
      preview: false,
      dryRun: true,
      ffmpegPath: 'ffmpeg',
      workDir: '.',
    });
    const filter = command[command.indexOf('-filter_complex') + 1];

    expect(filter).toContain('volume=1');
    expect(filter).toContain('amix=inputs=2:duration=longest:normalize=0');
    expect(filter).toContain('loudnorm=I=-14:LRA=7:TP=-1[aout]');
  });
});
