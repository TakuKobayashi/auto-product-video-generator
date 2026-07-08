import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  loadConfig,
  readJson,
  readYaml,
  writeJson,
  logger,
  resolveFfmpegPath,
  ScenarioSchema,
  ScriptSchema,
  TimelineSchema,
} from '@demo-video-gen/core';
import { TimelineBuilder } from '@demo-video-gen/ai';
import { FfmpegRenderer } from '@demo-video-gen/renderer';

interface RenderOptions {
  config?: string;
  subtitles?: boolean;
  voice?: boolean;
  preview?: boolean;
  ffmpeg?: string;
  dryRun?: boolean;
}

export async function runRender(options: RenderOptions): Promise<void> {
  logger.header('demo-video-gen render');

  const configPath = options.config ?? 'dvg.config.yaml';
  const config = await loadConfig(configPath);

  const workDir = config.output.workDir;
  const scenarioPath = join(workDir, 'scenario.yaml');
  const scriptPath = join(workDir, 'script.yaml');
  const timelinePath = join(workDir, 'timeline.json');
  const outputPath = join(config.output.dir, 'final.mp4');

  // Validate prerequisites
  for (const [label, p] of [['scenario.yaml', scenarioPath], ['script.yaml', scriptPath]] as const) {
    if (!existsSync(p)) {
      logger.error(`${label} not found: ${p}`);
      logger.error(`Run 'demo-video-gen scenario generate' first.`);
      process.exit(1);
    }
  }

  // Build timeline.json (deterministic from scenario + script)
  const rawScenario = await readYaml(scenarioPath);
  const scenario = ScenarioSchema.parse(rawScenario);

  const rawScript = await readYaml(scriptPath);
  const script = ScriptSchema.parse(rawScript);

  const builder = new TimelineBuilder();
  const timeline = builder.build(scenario, script, config.video);

  await writeJson(timelinePath, timeline);
  logger.success(`Built: ${timelinePath}`);

  const noSubtitles = options.subtitles === false;
  const noVoice = options.voice === false;

  const ffmpegPath = resolveFfmpegPath(options.ffmpeg);
  logger.info(`ffmpeg:       ${ffmpegPath}`);
  logger.info(`Output:       ${outputPath}`);
  logger.info(`Subtitles:    ${!noSubtitles}`);
  logger.info(`Voice:        ${!noVoice}`);
  logger.info(`Preview mode: ${options.preview ?? false}`);
  logger.info(`Total scenes: ${timeline.tracks.filter((t) => t.type === 'video').length}`);
  logger.info(`Duration:     ${timeline.meta.totalDuration.toFixed(1)}s`);

  const renderer = new FfmpegRenderer();
  await renderer.render(timeline, outputPath, {
    noSubtitles,
    noVoice,
    preview: options.preview ?? false,
    dryRun: options.dryRun ?? false,
    ffmpegPath,
    workDir,
  });

  if (!options.dryRun) {
    logger.info('');
    logger.success(`Done! Video saved to: ${outputPath}`);
  }
}
