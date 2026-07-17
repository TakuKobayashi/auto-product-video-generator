import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Timeline, VideoTrack, AudioTrack, SubtitleTrack, logger } from '@demo-video-gen/core';

export interface RenderOptions {
  noSubtitles: boolean;
  noVoice: boolean;
  preview: boolean;
  dryRun: boolean;
  ffmpegPath: string;
  workDir: string;
}

export class FfmpegRenderer {
  async render(timeline: Timeline, outputPath: string, options: RenderOptions): Promise<void> {
    const outDir = dirname(outputPath);
    if (!existsSync(outDir)) {
      await mkdir(outDir, { recursive: true });
    }

    const cmd = this.buildCommand(timeline, outputPath, options);
    const cmdStr = cmd.join(' ');

    if (options.dryRun) {
      logger.dryRun('ffmpeg command:');
      logger.dryRun(cmdStr);
      return;
    }

    logger.step('render', `Running ffmpeg...`);
    logger.dim(cmdStr);

    await this.exec(cmd);
    logger.success(`Video rendered: ${outputPath}`);
  }

  private buildCommand(
    timeline: Timeline,
    outputPath: string,
    options: RenderOptions,
  ): string[] {
    const videoTracks = timeline.tracks.filter((t): t is VideoTrack => t.type === 'video');
    const audioTracks = options.noVoice
      ? []
      : timeline.tracks.filter((t): t is AudioTrack => t.type === 'audio');
    const subtitleTracks = options.noSubtitles
      ? []
      : timeline.tracks.filter((t): t is SubtitleTrack => t.type === 'subtitle');

    const args: string[] = [options.ffmpegPath, '-y'];

    // --- Inputs ---
    videoTracks.forEach((t) => args.push('-i', resolve(options.workDir, t.src)));
    audioTracks.forEach((t) => args.push('-i', resolve(options.workDir, t.src)));

    // --- filter_complex ---
    const filterParts: string[] = [];
    const concatInputs: string[] = [];

    videoTracks.forEach((t, i) => {
      const parts: string[] = [`[${i}:v]`];
      if (t.trimStart !== undefined && t.trimEnd !== undefined) {
        parts.push(`trim=start=${t.trimStart}:end=${t.trimEnd},setpts=PTS-STARTPTS`);
      }
      if (t.speed && t.speed !== 1.0) {
        parts.push(`setpts=${(1 / t.speed).toFixed(4)}*PTS`);
      }
      // Scale to target resolution
      const [w, h] = timeline.meta.resolution.split('x');
      parts.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
      parts.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);

      const label = `[v${i}]`;
      filterParts.push(parts.join(',') + label);
      concatInputs.push(label);
    });

    // Concat video
    filterParts.push(
      `${concatInputs.join('')}concat=n=${videoTracks.length}:v=1:a=0[vconcat]`,
    );

    // Subtitles overlay
    const srtPath = resolve(options.workDir, 'subtitles.srt');
    if (subtitleTracks.length > 0 && existsSync(srtPath)) {
      // Escape path for ffmpeg filter
      const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      filterParts.push(
        `[vconcat]subtitles='${escapedSrt}':force_style='` +
        `FontSize=36,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,` +
        `BorderStyle=4,Outline=0,Shadow=0,MarginV=30` +
        `'[vout]`,
      );
    } else {
      filterParts.push(`[vconcat]copy[vout]`);
    }

    // Audio amix
    if (audioTracks.length > 0) {
      const vOffset = videoTracks.length;
      const audioInputs = audioTracks
        .map((t, i) => {
          const idx = vOffset + i;
          const delay = Math.round(t.startTime * 1000);
          const vol = t.volume ?? 0.9;
          return `[${idx}:a]adelay=${delay}|${delay},volume=${vol}[a${i}]`;
        })
        .join(';');

      const aMixInputs = audioTracks.map((_, i) => `[a${i}]`).join('');
      filterParts.push(audioInputs);
      filterParts.push(
        `${aMixInputs}amix=inputs=${audioTracks.length}:duration=longest[aout]`,
      );
    }

    args.push('-filter_complex', filterParts.join(';'));
    args.push('-map', '[vout]');

    if (audioTracks.length > 0) {
      args.push('-map', '[aout]');
    }

    // Encoding options
    const [w, h] = timeline.meta.resolution.split('x');
    args.push(
      '-c:v', 'libx264',
      '-preset', options.preview ? 'ultrafast' : 'medium',
      '-crf', options.preview ? '28' : '18',
      '-s', `${w}x${h}`,
      '-r', String(timeline.meta.fps),
      '-pix_fmt', 'yuv420p',
    );

    if (audioTracks.length > 0) {
      args.push('-c:a', 'aac', '-b:a', '128k');
    }

    args.push('-t', String(timeline.meta.totalDuration));
    args.push(outputPath);

    return args;
  }

  private exec(cmd: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });

      const errLines: string[] = [];
      proc.stderr.on('data', (d: Buffer) => {
        const line = d.toString();
        errLines.push(line);
        // Show ffmpeg progress lines
        if (line.includes('frame=') || line.includes('time=')) {
          process.stdout.write(`\r  ${line.trim()}`);
        }
      });

      proc.on('close', (code) => {
        process.stdout.write('\n');
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `ffmpeg exited with code ${code}\n` +
              errLines.slice(-10).join(''),
            ),
          );
        }
      });

      proc.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error(`ffmpeg not found. Install it: https://ffmpeg.org/download.html`));
        } else {
          reject(err);
        }
      });
    });
  }
}
