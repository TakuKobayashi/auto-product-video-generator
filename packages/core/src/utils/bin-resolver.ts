import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Resolves a usable ffmpeg binary path with the following priority:
 *   1. an explicit path passed in (e.g. --ffmpeg CLI flag / config value)
 *   2. the FFMPEG_PATH environment variable
 *   3. the binary bundled by the `ffmpeg-static` npm package
 *      (downloaded automatically during `pnpm install` / `task install`,
 *      so most users never need to install ffmpeg themselves)
 *   4. `ffmpeg` on the system PATH, as a last resort
 */
export function resolveFfmpegPath(explicitPath?: string): string {
  if (explicitPath) return explicitPath;

  const envPath = process.env.FFMPEG_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  const bundled = requireCjsDefault<string>('ffmpeg-static');
  if (bundled && existsSync(bundled)) return bundled;

  return 'ffmpeg';
}

/**
 * Same as resolveFfmpegPath but for ffprobe (used to measure the duration
 * of synthesized VOICEVOX wav files). Bundled via `ffprobe-static`.
 */
export function resolveFfprobePath(explicitPath?: string): string {
  if (explicitPath) return explicitPath;

  const envPath = process.env.FFPROBE_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  const bundled = requireCjsDefault<{ path: string }>('ffprobe-static');
  if (bundled && typeof bundled === 'object' && existsSync(bundled.path)) {
    return bundled.path;
  }

  return 'ffprobe';
}

function requireCjsDefault<T>(moduleName: string): T | null {
  try {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(moduleName);
    return (mod?.default ?? mod) as T;
  } catch {
    return null;
  }
}
