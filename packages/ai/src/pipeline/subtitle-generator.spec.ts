import { describe, expect, it } from 'vitest';
import { buildSubtitleCues, splitSubtitleText, SubtitleGenerator } from './subtitle-generator.js';

describe('splitSubtitleText', () => {
  it('keeps Japanese words intact around the 14-character boundary', () => {
    const chunks = splitSubtitleText('このサービスでは魅力的な動画を簡単に生成できます。', 14);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => [...chunk].length <= 15)).toBe(true);
    expect(chunks.join('')).toBe('このサービスでは魅力的な動画を簡単に生成できます。');
    expect(chunks.some((chunk) => chunk.endsWith('動'))).toBe(false);
    expect(chunks.some((chunk) => chunk.startsWith('画'))).toBe(false);
  });

  it('wraps before an English word instead of splitting it', () => {
    expect(splitSubtitleText('Create polished promotional videos quickly', 14)).toEqual([
      'Create polished',
      'promotional',
      'videos quickly',
    ]);
  });

  it('keeps a single word longer than the limit intact', () => {
    expect(splitSubtitleText('auto-product-video-generator', 14)).toEqual([
      'auto-product-video-generator',
    ]);
  });
});

describe('buildSubtitleCues', () => {
  it('covers the exact audio interval with sequential proportional cues', () => {
    const cues = buildSubtitleCues('Create polished promotional videos quickly', 2, 12, 14);

    expect(cues[0].startTime).toBe(2);
    expect(cues.at(-1)?.endTime).toBe(12);
    for (let index = 1; index < cues.length; index++) {
      expect(cues[index].startTime).toBe(cues[index - 1].endTime);
    }
  });

  it('generates multiple one-line SRT entries without changing narration', () => {
    const narration = 'Create polished promotional videos quickly';
    const srt = new SubtitleGenerator().generateSrt({
      scenes: [{ id: 'demo', narration, startTime: 0, endTime: 10, voiceFile: 'voice/demo.wav' }],
    });

    expect(srt).toContain('Create polished');
    expect(srt).toContain('promotional');
    expect(srt).not.toContain(narration);
  });
});
