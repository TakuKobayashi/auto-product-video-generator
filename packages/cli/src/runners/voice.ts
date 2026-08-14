import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { loadConfig, readYaml, writeYaml, logger, ScriptSchema } from '@auto-product-video-generator/core';
import { recomputeScriptTimingFromAudio, SubtitleGenerator } from '@auto-product-video-generator/ai';
import { VoicevoxClient } from '@auto-product-video-generator/voicevox';

interface VoiceOptions {
  config?: string;
  speaker?: string;
  scene?: string;
  dryRun?: boolean;
}

export async function runVoice(options: VoiceOptions): Promise<void> {
  logger.header('apvg video voice');

  const configPath = options.config ?? 'apvg.config.yml';
  const config = await loadConfig(configPath);

  const workDir = config.output.workDir;
  const scriptPath = join(workDir, 'script.yml');

  if (!existsSync(scriptPath)) {
    logger.error(`script.yml not found. Run 'pnpm apvg video scenario generate' first.`);
    process.exit(1);
  }

  const rawScript = await readYaml(scriptPath);
  const script = ScriptSchema.parse(rawScript);

  const voicevoxConfig = {
    ...config.voicevox,
    ...(options.speaker ? { speakerId: parseInt(options.speaker, 10) } : {}),
  };

  const voiceDir = join(workDir, 'voice');
  const srtPath = join(workDir, 'subtitles.srt');

  logger.info(`VOICEVOX host:  ${voicevoxConfig.host}`);
  logger.info(`Speaker ID:     ${voicevoxConfig.speakerId}`);
  logger.info(`Output dir:     ${voiceDir}`);

  if (!options.dryRun) {
    const client = new VoicevoxClient(voicevoxConfig);
    const healthy = await client.checkHealth();
    if (!healthy) {
      logger.error(`VOICEVOX Engine is not reachable at ${voicevoxConfig.host}`);
      logger.error('Start it with: docker run --rm -p 50021:50021 voicevox/voicevox_engine:cpu-latest');
      process.exit(1);
    }
  }

  const client = new VoicevoxClient(voicevoxConfig);
  await client.synthesizeAll(script, {
    outputDir: voiceDir,
    dryRun: options.dryRun ?? false,
    sceneId: options.scene,
  });

  if (!options.dryRun) {
    const timedScript = await recomputeScriptTimingFromAudio(
      script,
      voiceDir,
      config.video.sceneGapSeconds,
    );
    await writeYaml(scriptPath, timedScript);
    await writeFile(srtPath, new SubtitleGenerator().generateSrt(timedScript), 'utf-8');
    logger.success(`Updated actual audio timing: ${scriptPath}, ${srtPath}`);
  }

  logger.info('');
  logger.success('Voice synthesis complete.');
  if (!options.dryRun) {
    logger.info('Next: pnpm apvg video record');
  }
}
