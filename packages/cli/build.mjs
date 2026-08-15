import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const source = (name) => fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));

await rm(new URL('./dist', import.meta.url), { recursive: true, force: true });

await build({
  entryPoints: [fileURLToPath(new URL('./src/index.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('./dist/index.js', import.meta.url)),
  absWorkingDir: packageRoot,
  alias: {
    '@auto-product-video-generator/ai': source('ai'),
    '@auto-product-video-generator/core': source('core'),
    '@auto-product-video-generator/playwright': source('playwright'),
    '@auto-product-video-generator/recorder': source('recorder'),
    '@auto-product-video-generator/renderer': source('renderer'),
    '@auto-product-video-generator/source': source('source'),
    '@auto-product-video-generator/voicevox': source('voicevox'),
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  sourcemap: true,
  target: 'node20',
});
