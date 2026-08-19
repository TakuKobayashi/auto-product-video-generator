import { spawn } from 'node:child_process';
import { resolveFfprobePath } from './bin-resolver.js';

/** Read an audio/video file's duration using ffprobe. */
export function getAudioDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(resolveFfprobePath(), [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data: Buffer) => (stdout += data.toString()));
    proc.stderr.on('data', (data: Buffer) => (stderr += data.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      const duration = Number.parseFloat(stdout.trim());
      if (code !== 0 || !Number.isFinite(duration) || duration <= 0) {
        reject(
          new Error(
            `Unable to read media duration for ${filePath}: ${stderr.trim() || stdout.trim()}`
          )
        );
        return;
      }
      resolve(duration);
    });
  });
}
