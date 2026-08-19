import { Script, formatSrtTime, logger } from '@auto-product-video-generator/core';

export const DEFAULT_SUBTITLE_MAX_CHARACTERS = 14;

export interface SubtitleCue {
  text: string;
  startTime: number;
  endTime: number;
}

export interface SubtitleGenerationOptions {
  singleLine?: boolean;
  maxCharacters?: number;
}

/**
 * Split narration on word boundaries, then distribute the scene's real audio
 * duration proportionally across the resulting one-line subtitle cues.
 * Narration itself is never changed, so voice synthesis still uses the full text.
 */
export function buildSubtitleCues(
  narration: string,
  startTime: number,
  endTime: number,
  maxCharacters = DEFAULT_SUBTITLE_MAX_CHARACTERS,
  singleLine = true,
): SubtitleCue[] {
  const text = narration.trim();
  if (!text) return [];
  if (!singleLine) {
    return [{
      text,
      startTime: roundMilliseconds(startTime),
      endTime: roundMilliseconds(endTime),
    }];
  }

  const chunks = splitSubtitleText(narration, maxCharacters);

  const weights = chunks.map(spokenCharacterCount);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const duration = Math.max(0, endTime - startTime);
  let elapsedWeight = 0;

  return chunks.map((text, index) => {
    const cueStart = index === 0
      ? startTime
      : startTime + duration * (elapsedWeight / totalWeight);
    elapsedWeight += weights[index];
    const cueEnd = index === chunks.length - 1
      ? endTime
      : startTime + duration * (elapsedWeight / totalWeight);
    return {
      text,
      startTime: roundMilliseconds(cueStart),
      endTime: roundMilliseconds(cueEnd),
    };
  });
}

export function splitSubtitleText(
  narration: string,
  maxCharacters = DEFAULT_SUBTITLE_MAX_CHARACTERS,
): string[] {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1) {
    throw new Error('maxCharacters must be a positive integer');
  }

  const text = narration.trim();
  if (!text) return [];

  const locale = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) ? 'ja' : 'en';
  const segments = [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)];
  const chunks: string[] = [];
  let current = '';
  let pendingWhitespace = '';
  let joinNextWord = false;

  const flush = (): void => {
    const chunk = current.trim();
    if (chunk) chunks.push(chunk);
    current = '';
    pendingWhitespace = '';
    joinNextWord = false;
  };

  for (const { segment, isWordLike } of segments) {
    if (/^\s+$/u.test(segment)) {
      if (current) pendingWhitespace = ' ';
      joinNextWord = false;
      continue;
    }

    if (!isWordLike) {
      // Keep punctuation with the preceding word even if it makes the line one
      // character longer. A punctuation-only subtitle is harder to read.
      current += segment;
      joinNextWord = /^[-‐‑‒–—'’]+$/u.test(segment);
      continue;
    }

    const candidate = current + pendingWhitespace + segment;
    if (current && !joinNextWord && layoutCharacterCount(candidate) > maxCharacters) flush();
    current += (current ? pendingWhitespace : '') + segment;
    pendingWhitespace = '';
    joinNextWord = false;
  }
  flush();
  return chunks;
}

export class SubtitleGenerator {
  generateSrt(script: Script, options: SubtitleGenerationOptions = {}): string {
    logger.step('subtitle', 'Generating SRT subtitles...');

    let srt = '';
    let index = 1;

    for (const scene of script.scenes) {
      for (const cue of buildSubtitleCues(
        scene.narration,
        scene.startTime,
        scene.endTime,
        options.maxCharacters ?? DEFAULT_SUBTITLE_MAX_CHARACTERS,
        options.singleLine ?? true,
      )) {
        const start = formatSrtTime(cue.startTime);
        const end = formatSrtTime(cue.endTime);
        srt += `${index}\n${start} --> ${end}\n${cue.text}\n\n`;
        index++;
      }
    }

    return srt.trimEnd() + '\n';
  }
}

function characterCount(text: string): number {
  return [...text].length;
}

function layoutCharacterCount(text: string): number {
  return characterCount(text.replace(/\s/gu, ''));
}

function spokenCharacterCount(text: string): number {
  return Math.max(1, layoutCharacterCount(text));
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
