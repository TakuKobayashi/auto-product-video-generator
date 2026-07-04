import { Script, formatSrtTime, logger } from '@demo-video-gen/core';

export class SubtitleGenerator {
  generateSrt(script: Script): string {
    logger.step('subtitle', 'Generating SRT subtitles...');

    let srt = '';
    let index = 1;

    for (const scene of script.scenes) {
      const start = formatSrtTime(scene.startTime);
      const end = formatSrtTime(scene.endTime);
      srt += `${index}\n${start} --> ${end}\n${scene.narration}\n\n`;
      index++;
    }

    return srt.trimEnd() + '\n';
  }
}
