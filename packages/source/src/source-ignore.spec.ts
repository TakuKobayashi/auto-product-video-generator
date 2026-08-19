import { describe, expect, it } from 'vitest';
import { DEFAULT_SOURCE_EXCLUDES, isSourcePathExcluded } from './source-ignore.js';

describe('isSourcePathExcluded', () => {
  it('matches generated directories and binary extensions', () => {
    const patterns = ['output/**', '**/*.mp4', '*.log'];
    expect(isSourcePathExcluded('output/final.mp4', patterns)).toBe(true);
    expect(isSourcePathExcluded('tmp/demo.mp4', patterns)).toBe(true);
    expect(isSourcePathExcluded('logs/server.log', patterns)).toBe(true);
    expect(isSourcePathExcluded('src/index.ts', patterns)).toBe(false);
  });

  it('supports gitignore-style negation', () => {
    expect(isSourcePathExcluded('fixtures/keep.wav', ['**/*.wav', '!fixtures/keep.wav'])).toBe(
      false
    );
  });

  it('excludes non-source packages, binaries, datasets, and model weights by default', () => {
    for (const path of [
      'release/game.unitypackage',
      'bin/tool.wasm',
      'data/catalog.parquet',
      'models/detector.onnx',
      'docs/guide.pdf',
      'fonts/product.woff2',
    ]) {
      expect(isSourcePathExcluded(path, DEFAULT_SOURCE_EXCLUDES), path).toBe(true);
    }
  });

  it('keeps promotional assets available for the separately capped asset index', () => {
    for (const path of ['public/logo.png', 'Assets/hero.glb', 'audio/theme.wav']) {
      expect(isSourcePathExcluded(path, DEFAULT_SOURCE_EXCLUDES), path).toBe(false);
    }
    expect(isSourcePathExcluded('src/index.ts', DEFAULT_SOURCE_EXCLUDES)).toBe(false);
  });
});
