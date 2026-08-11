import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig, readYaml, logger, ScenarioSchema, ScriptSchema } from '@demo-video-gen/core';
import { createPlatformRecorder } from '@demo-video-gen/recorder';
import { resolveProjectSource, ensureAppRunning } from '@demo-video-gen/source';

interface RecordOptions {
  config?: string;
  scene?: string;
  headed?: boolean;
  slowMo?: string;
  dryRun?: boolean;
}

export async function runRecord(options: RecordOptions): Promise<void> {
  logger.header('dvg video record');

  const configPath = options.config ?? 'dvg.config.yaml';
  const config = await loadConfig(configPath);

  const workDir = config.output.workDir;
  const scenarioPath = join(workDir, 'scenario.yaml');
  const scriptPath = join(workDir, 'script.yaml');

  if (!existsSync(scenarioPath)) {
    logger.error(`scenario.yaml not found. Run 'pnpm dvg video scenario generate' first.`);
    process.exit(1);
  }

  const rawScenario = await readYaml(scenarioPath);
  const scenario = ScenarioSchema.parse(rawScenario);

  if (!existsSync(scriptPath)) {
    throw new Error(`script.yaml not found. Run 'pnpm dvg video voice' before recording.`);
  }
  const script = ScriptSchema.parse(await readYaml(scriptPath));

  const recordingsDir = join(workDir, 'recordings');
  const screenshotDir = join(workDir, 'screenshots');

  const scenesToRecord = options.scene
    ? scenario.scenes.filter((s) => s.id === options.scene)
    : scenario.scenes;

  if (scenesToRecord.length === 0) {
    logger.error(`Scene '${options.scene}' not found in scenario.`);
    logger.error(`Available scenes: ${scenario.scenes.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  logger.info(`Scenes to record: ${scenesToRecord.map((s) => s.id).join(', ')}`);
  logger.info(`Output dir:       ${recordingsDir}`);
  logger.info(`Headed:           ${options.headed ?? false}`);
  logger.info(`Slow-mo:          ${options.slowMo ?? '0'}ms`);

  let rootDir: string | undefined;
  if (!options.dryRun) {
    const cloneDir = join(workDir, 'source-repo');
    rootDir = await resolveProjectSource({ source: config.source, cloneDir });
    if (scenario.meta.platform === 'web') {
      await ensureAppRunning({
        url: config.target.url,
        setupSteps: scenario.setup,
        startCommand: config.source.startCommand,
        cwd: rootDir,
        installDeps: config.source.installDeps,
        logPath: join(workDir, 'dev-server.log'),
      });
    }
  }

  const recorder = createPlatformRecorder(scenario.meta.platform, config, { rootDir, workDir });

  for (const scene of scenesToRecord) {
    const scriptIndex = script.scenes.findIndex((item) => item.id === scene.id);
    if (scriptIndex < 0) throw new Error(`Scene '${scene.id}' is missing from script.yaml.`);
    const scriptScene = script.scenes[scriptIndex];
    const voicePath = join(workDir, scriptScene.voiceFile);
    if (!options.dryRun && !existsSync(voicePath)) {
      throw new Error(`Voice file not found: ${voicePath}. Run 'pnpm dvg video voice' before recording.`);
    }
    const nextScene = script.scenes[scriptIndex + 1];
    const targetDurationSeconds = (nextScene?.startTime ?? scriptScene.endTime) - scriptScene.startTime;
    logger.info('');
    await recorder.recordScene(scene, config.video, {
      headed: options.headed ?? false,
      slowMo: parseInt(options.slowMo ?? '0', 10),
      outputDir: recordingsDir,
      screenshotDir,
      dryRun: options.dryRun ?? false,
    }, targetDurationSeconds, scriptScene.endTime - scriptScene.startTime);
  }

  logger.info('');
  logger.success('Recording complete.');
  if (!options.dryRun) {
    logger.info('Next: pnpm dvg video render');
  }
}
