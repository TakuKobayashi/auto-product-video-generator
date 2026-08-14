import { describe, expect, it } from 'vitest';
import { isSourcePathExcluded } from './source-ignore.js';

describe('isSourcePathExcluded', () => {
  it('matches generated directories and binary extensions', () => {
    const patterns = ['output/**', '**/*.mp4', '*.log'];
    expect(isSourcePathExcluded('output/final.mp4', patterns)).toBe(true);
    expect(isSourcePathExcluded('tmp/demo.mp4', patterns)).toBe(true);
    expect(isSourcePathExcluded('logs/server.log', patterns)).toBe(true);
    expect(isSourcePathExcluded('src/index.ts', patterns)).toBe(false);
  });

  it('supports gitignore-style negation', () => {
    expect(isSourcePathExcluded('fixtures/keep.wav', ['**/*.wav', '!fixtures/keep.wav'])).toBe(false);
  });
});
