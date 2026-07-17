import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig, readYaml, logger, ScriptSchema } from '@demo-video-gen/core';
import { VoicevoxClient } from '@demo-video-gen/voicevox';

interface VoiceOptions {
  config?: string;
  speaker?: string;
  scene?: string;
  dryRun?: boolean;
}

export async function runVoice(options: VoiceOptions): Promise<void> {
  logger.header('demo-video-gen voice');

  const configPath = options.config ?? 'dvg.config.yaml';
  const config = await loadConfig(configPath);

  const workDir = config.output.workDir;
  const scriptPath = join(workDir, 'script.yaml');

  if (!existsSync(scriptPath)) {
    logger.error(`script.yaml not found. Run 'demo-video-gen scenario generate' first.`);
    process.exit(1);
  }

  const rawScript = await readYaml(scriptPath);
  const script = ScriptSchema.parse(rawScript);

  const voicevoxConfig = {
    ...config.voicevox,
    ...(options.speaker ? { speakerId: parseInt(options.speaker, 10) } : {}),
  };

  const voiceDir = join(workDir, 'voice');

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

  logger.info('');
  logger.success('Voice synthesis complete.');
  if (!options.dryRun) {
    logger.info('Next: demo-video-gen render');
  }
}
