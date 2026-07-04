import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { Script, VoicevoxConfig, logger } from '@demo-video-gen/core';

export interface SynthesizeOptions {
  outputDir: string;
  dryRun: boolean;
  sceneId?: string;
}

export class VoicevoxClient {
  constructor(private config: VoicevoxConfig) {}

  async synthesizeAll(script: Script, options: SynthesizeOptions): Promise<void> {
    const scenes = options.sceneId
      ? script.scenes.filter((s) => s.id === options.sceneId)
      : script.scenes;

    if (scenes.length === 0) {
      throw new Error(`Scene '${options.sceneId}' not found in script.`);
    }

    for (const scene of scenes) {
      const outputPath = `${options.outputDir}/scene-${scene.id}.wav`;
      await this.synthesize(scene.narration, this.config.speakerId, outputPath, options.dryRun);
    }
  }

  async synthesize(
    text: string,
    speakerId: number,
    outputPath: string,
    dryRun: boolean,
  ): Promise<void> {
    logger.step('voice', `Synthesizing: "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`);
    logger.dim(`  → ${outputPath}`);

    if (dryRun) {
      logger.dryRun(`Would call VOICEVOX at ${this.config.host} with speaker=${speakerId}`);
      return;
    }

    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Step 1: audio_query
    const queryUrl = `${this.config.host}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`;
    const queryRes = await fetch(queryUrl, { method: 'POST' });

    if (!queryRes.ok) {
      const body = await queryRes.text();
      throw new Error(
        `VOICEVOX audio_query failed (${queryRes.status}): ${body}\n` +
        `Make sure VOICEVOX Engine is running at ${this.config.host}`,
      );
    }

    const query = await queryRes.json();

    // Step 2: synthesis
    const synthUrl = `${this.config.host}/synthesis?speaker=${speakerId}`;
    const synthRes = await fetch(synthUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });

    if (!synthRes.ok) {
      const body = await synthRes.text();
      throw new Error(`VOICEVOX synthesis failed (${synthRes.status}): ${body}`);
    }

    const buffer = await synthRes.arrayBuffer();
    await writeFile(outputPath, Buffer.from(buffer));
    logger.success(`Voice saved: ${outputPath}`);
  }

  async getWavDuration(wavPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        wavPath,
      ]);

      let stdout = '';
      proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed with code ${code}`));
          return;
        }
        try {
          const data = JSON.parse(stdout) as { format: { duration: string } };
          resolve(parseFloat(data.format.duration));
        } catch (e) {
          reject(new Error(`Failed to parse ffprobe output: ${stdout}`));
        }
      });
      proc.on('error', reject);
    });
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.host}/version`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
