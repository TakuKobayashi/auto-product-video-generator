#!/usr/bin/env node
// ffmpeg-static's own install script (which downloads the platform ffmpeg
// binary) already runs automatically during `pnpm install`, since it's
// allow-listed in pnpm-workspace.yaml (pnpm requires that — see the comment
// there for why leaving it un-approved isn't actually a safe option).
//
// This script is a defensive double-check / manual retry path: if the
// binary is somehow still missing (partial install, manually cleared
// node_modules/ffmpeg-static/ffmpeg, etc.) it tries again in isolation, and
// if that also fails, it degrades gracefully by confirming whether a system
// `ffmpeg` is available on PATH instead (see
// packages/core/src/utils/bin-resolver.ts for the actual runtime fallback
// logic that demo-video-gen uses).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { run, log, commandExists } from './lib/proc.mjs';

const require = createRequire(import.meta.url);

async function main() {
  let pkgDir;
  try {
    // Resolve the installed package directory (works regardless of pnpm's
    // nested node_modules/.pnpm layout).
    const pkgJsonPath = require.resolve('ffmpeg-static/package.json');
    pkgDir = dirname(pkgJsonPath);
  } catch {
    log.warn("Could not find 'ffmpeg-static' in node_modules — did `pnpm install` run?");
    fallbackNotice();
    return;
  }

  let ffmpegPath;
  try {
    ffmpegPath = require('ffmpeg-static');
  } catch {
    ffmpegPath = null;
  }

  if (ffmpegPath && existsSync(ffmpegPath)) {
    log.success(`ffmpeg binary already present: ${ffmpegPath}`);
    return;
  }

  const installScript = join(pkgDir, 'install.js');
  if (!existsSync(installScript)) {
    log.warn(`ffmpeg-static's install.js not found at ${installScript} (unexpected package layout).`);
    fallbackNotice();
    return;
  }

  log.info('Downloading the bundled ffmpeg binary (ffmpeg-static)...');
  try {
    await run('node', [installScript], { cwd: pkgDir });
    log.success('ffmpeg binary downloaded.');
  } catch (err) {
    log.warn(`Could not download the bundled ffmpeg binary (${err.message}).`);
    fallbackNotice();
  }
}

function fallbackNotice() {
  if (commandExists('ffmpeg')) {
    log.info("A system 'ffmpeg' was found on PATH — demo-video-gen will use that instead.");
    return;
  }
  log.warn('demo-video-gen will need a system ffmpeg on PATH, or FFMPEG_PATH set. Install via:');
  log.warn('  Windows: winget install ffmpeg   |  macOS: brew install ffmpeg   |  Linux (Debian/Ubuntu): sudo apt install ffmpeg');
  log.warn('Then re-run this command, or just proceed — demo-video-gen will pick up system ffmpeg automatically.');
}

main().catch((err) => {
  log.warn(err.message);
  fallbackNotice();
});
