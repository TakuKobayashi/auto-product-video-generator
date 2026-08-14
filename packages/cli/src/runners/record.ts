import { basename, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { ensureDir, loadConfig, readYaml, logger, ScenarioSchema, ScriptSchema } from '@auto-product-video-generator/core';
import { createPlatformRecorder } from '@auto-product-video-generator/recorder';
import { resolveProjectSource, ensureAppRunning } from '@auto-product-video-generator/source';

interface RecordOptions {
  config?: string;
  scenario?: string;
  script?: string;
  voiceDir?: string;
  recordingsDir?: string;
  screenshotsDir?: string;
  sourceDir?: string;
  serverLog?: string;
  scene?: string;
  headed?: boolean;
  slowMo?: string;
  dryRun?: boolean;
}

export async function runRecord(options: RecordOptions): Promise<void> {
  logger.header('apvg video record');

  const configPath = options.config || 'apvg.config.yml';
  const config = await loadConfig(configPath);

  const workDir = config.output.workDir;
  const scenarioPath = options.scenario || join(workDir, 'scenario.yml');
  const scriptPath = options.script || join(workDir, 'script.yml');

  if (!existsSync(scenarioPath)) {
    logger.error(`scenario.yml not found. Run 'pnpm apvg video scenario generate' first.`);
    process.exit(1);
  }

  const rawScenario = await readYaml(scenarioPath);
  const scenario = ScenarioSchema.parse(rawScenario);

  if (!existsSync(scriptPath)) {
    throw new Error(`script.yml not found. Run 'pnpm apvg video voice' before recording.`);
  }
  const script = ScriptSchema.parse(await readYaml(scriptPath));

  const voiceDir = options.voiceDir || join(workDir, 'voice');
  const recordingsDir = options.recordingsDir || join(workDir, 'recordings');
  const screenshotDir = options.screenshotsDir || join(workDir, 'screenshots');

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
  logger.info(`Headed:           ${options.headed || false}`);
  logger.info(`Slow-mo:          ${options.slowMo || '0'}ms`);

  let rootDir: string | undefined;
  if (!options.dryRun) {
    const cloneDir = options.sourceDir || join(workDir, 'source-repo');
    rootDir = await resolveProjectSource({ source: config.source, cloneDir });
    if (scenario.meta.platform === 'web') {
      const serverLogPath = options.serverLog || join(workDir, 'dev-server.log');
      await ensureDir(dirname(serverLogPath));
      await ensureAppRunning({
        url: config.target.url,
        setupSteps: scenario.setup,
        startCommand: config.source.startCommand,
        cwd: rootDir,
        installDeps: config.source.installDeps,
        logPath: serverLogPath,
      });
    }
  }

  const recorder = createPlatformRecorder(scenario.meta.platform, config, { rootDir, workDir, setupSteps: scenario.setup });

  try {
    for (const scene of scenesToRecord) {
      const scriptIndex = script.scenes.findIndex((item) => item.id === scene.id);
      if (scriptIndex < 0) throw new Error(`Scene '${scene.id}' is missing from script.yml.`);
      const scriptScene = script.scenes[scriptIndex];
      const voicePath = join(voiceDir, basename(scriptScene.voiceFile));
      if (!options.dryRun && !existsSync(voicePath)) {
        throw new Error(`Voice file not found: ${voicePath}. Run 'pnpm apvg video voice' before recording.`);
      }
      const nextScene = script.scenes[scriptIndex + 1];
      const targetDurationSeconds = (nextScene?.startTime ?? scriptScene.endTime) - scriptScene.startTime;
      logger.info('');
      await recorder.recordScene(scene, config.video, {
        headed: options.headed || false,
        slowMo: parseInt(options.slowMo || '0', 10),
        outputDir: recordingsDir,
        screenshotDir,
        dryRun: options.dryRun || false,
      }, targetDurationSeconds, scriptScene.endTime - scriptScene.startTime);
    }
  } finally {
    await recorder.dispose?.();
  }

  logger.info('');
  logger.success('Recording complete.');
  if (!options.dryRun) {
    logger.info('Next: pnpm apvg video render');
  }
}
