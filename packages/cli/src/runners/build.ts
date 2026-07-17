import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import {
  loadConfig,
  saveConfig,
  readJson,
  readYaml,
  writeJson,
  writeYaml,
  ensureDir,
  logger,
  describeTaskLlm,
  resolveFfmpegPath,
  ProjectSummary,
  ScenarioSchema,
  ScriptSchema,
} from '@demo-video-gen/core';
import {
  createLlmProviderForTask,
  ProjectAnalyzer,
  ScenarioGenerator,
  SubtitleGenerator,
  TimelineBuilder,
} from '@demo-video-gen/ai';
import { SceneRecorder } from '@demo-video-gen/playwright';
import { VoicevoxClient } from '@demo-video-gen/voicevox';
import { FfmpegRenderer } from '@demo-video-gen/renderer';
import { resolveProjectSource, inspectProject, detectStartCommand, ensureAppRunning } from '@demo-video-gen/source';

interface BuildOptions {
  config?: string;
  type?: string;
  url?: string;
  skipAnalyze?: boolean;
  skipScenario?: boolean;
  skipRecord?: boolean;
  skipVoice?: boolean;
  subtitles?: boolean;
  preview?: boolean;
  headed?: boolean;
  dryRun?: boolean;
}

export async function runBuild(options: BuildOptions): Promise<void> {
  logger.header('demo-video-gen build');

  const configPath = options.config ?? 'dvg.config.yaml';
  let config = await loadConfig(configPath);

  // Apply overrides
  if (options.url) config.target.url = options.url;
  if (options.type) config.video.type = options.type as typeof config.video.type;

  const workDir = config.output.workDir;
  await ensureDir(workDir);

  logger.info(`Source:  ${config.source.repository ?? config.source.localPath}`);
  logger.info(`Target:  ${config.target.url}`);
  logger.info(`Video:   ${config.video.type}, ~${config.video.duration}s`);
  logger.info(`LLM (analyze):  ${describeTaskLlm(config.llm, 'analyze')}`);
  logger.info(`LLM (scenario): ${describeTaskLlm(config.llm, 'scenario')}`);
  logger.info('');

  const summaryPath    = join(workDir, 'project-summary.json');
  const contextPath    = join(workDir, 'source-context.json');
  const cloneDir       = join(workDir, 'source-repo');
  const scenarioPath   = join(workDir, 'scenario.yaml');
  const scriptPath     = join(workDir, 'script.yaml');
  const srtPath        = join(workDir, 'subtitles.srt');
  const timelinePath   = join(workDir, 'timeline.json');
  const recordingsDir  = join(workDir, 'recordings');
  const voiceDir       = join(workDir, 'voice');
  const screenshotDir  = join(workDir, 'screenshots');
  const outputPath     = join(config.output.dir, 'final.mp4');

  const analyzeLlm = createLlmProviderForTask(config.llm, 'analyze');
  const scenarioLlm = createLlmProviderForTask(config.llm, 'scenario');
  const dryRun = options.dryRun ?? false;

  // Resolved once upfront (not just in the analyze step) since the record
  // step also needs it to know where to run source.startCommand from.
  let rootDir: string | undefined;
  if (!dryRun) {
    rootDir = await resolveProjectSource({ source: config.source, cloneDir });
  }

  // ── Step 1: Analyze ──────────────────────────────────────────────────────
  let summary: ProjectSummary;
  if (!options.skipAnalyze) {
    logger.step('1/5', 'Analyzing project source...');
    if (!dryRun) {
      const sourceContext = await inspectProject(rootDir!);
      await writeJson(contextPath, sourceContext);

      if (!config.source.startCommand) {
        const detected = detectStartCommand(sourceContext.packageJson);
        if (detected) {
          config.source.startCommand = detected;
          await saveConfig(configPath, config);
          logger.info(`Detected dev server command '${detected}' — saved to ${configPath}.`);
        }
      }

      const analyzer = new ProjectAnalyzer(analyzeLlm);
      summary = await analyzer.analyze(sourceContext, config.target.url);
      await writeJson(summaryPath, summary);
      logger.success(`Saved: ${summaryPath}`);
    } else {
      logger.dryRun(`Would resolve source: ${config.source.repository ?? config.source.localPath}`);
      logger.dryRun(`Would write: ${contextPath}`);
      logger.dryRun(`Would write: ${summaryPath}`);
      summary = {
        name: config.project.name,
        description: '',
        platform: 'web',
        setupSteps: [],
        features: [],
        targetAudience: '',
        keyValueProps: [],
        suggestedVideoTypes: [],
        analyzedAt: new Date().toISOString(),
      };
    }
  } else {
    logger.step('1/5', 'Skipping analyze (--skip-analyze)');
    if (!existsSync(summaryPath)) {
      logger.error(`project-summary.json not found: ${summaryPath}`);
      process.exit(1);
    }
    summary = await readJson<ProjectSummary>(summaryPath);
  }

  // ── Step 2: Scenario ─────────────────────────────────────────────────────
  let scenario: ReturnType<typeof ScenarioSchema.parse>;
  let script: ReturnType<typeof ScriptSchema.parse>;

  if (!options.skipScenario) {
    logger.step('2/5', 'Generating scenario...');
    const generator = new ScenarioGenerator(scenarioLlm);
    const result = await generator.generate(summary, config.video, config.target.url);
    scenario = result.scenario;
    script = result.script;

    if (!dryRun) {
      await writeYaml(scenarioPath, scenario);
      await writeYaml(scriptPath, script);
      const subtitleGen = new SubtitleGenerator();
      await writeFile(srtPath, subtitleGen.generateSrt(script), 'utf-8');
      logger.success(`Saved scenario, script, subtitles`);
    } else {
      logger.dryRun(`Would write: ${scenarioPath}, ${scriptPath}, ${srtPath}`);
    }
  } else {
    logger.step('2/5', 'Skipping scenario (--skip-scenario)');
    for (const [label, p] of [['scenario.yaml', scenarioPath], ['script.yaml', scriptPath]] as const) {
      if (!existsSync(p)) {
        logger.error(`${label} not found: ${p}`);
        process.exit(1);
      }
    }
    scenario = ScenarioSchema.parse(await readYaml(scenarioPath));
    script = ScriptSchema.parse(await readYaml(scriptPath));
  }

  // ── Step 3: Record ───────────────────────────────────────────────────────
  if (!options.skipRecord) {
    logger.step('3/5', 'Recording browser interactions...');
    if (scenario.meta.platform !== 'web') {
      logger.warn(
        `scenario.yaml was generated for platform '${scenario.meta.platform}', but recording ` +
        `currently only supports 'web' (via Playwright). Proceeding anyway, but this likely ` +
        `won't produce a usable recording — a dedicated recorder for that platform doesn't exist yet.`,
      );
    }
    if (!dryRun) {
      await ensureAppRunning({
        url: config.target.url,
        setupSteps: scenario.setup,
        startCommand: config.source.startCommand,
        cwd: rootDir!,
        installDeps: config.source.installDeps,
        logPath: join(workDir, 'dev-server.log'),
      });
    }
    const recorder = new SceneRecorder();
    for (const scene of scenario.scenes) {
      await recorder.recordScene(scene, config.video, {
        headed: options.headed ?? false,
        slowMo: 0,
        outputDir: recordingsDir,
        screenshotDir,
        dryRun,
      });
    }
  } else {
    logger.step('3/5', 'Skipping record (--skip-record)');
  }

  // ── Step 4: Voice ────────────────────────────────────────────────────────
  if (!options.skipVoice) {
    logger.step('4/5', 'Synthesizing voice narration...');
    if (!dryRun) {
      const voicevox = new VoicevoxClient(config.voicevox);
      const healthy = await voicevox.checkHealth();
      if (!healthy) {
        logger.warn(`VOICEVOX not available at ${config.voicevox.host} — skipping voice.`);
        logger.warn('Start: docker run --rm -p 50021:50021 voicevox/voicevox_engine:cpu-latest');
      } else {
        await voicevox.synthesizeAll(script, { outputDir: voiceDir, dryRun });
      }
    } else {
      logger.dryRun(`Would synthesize ${script.scenes.length} voice files`);
    }
  } else {
    logger.step('4/5', 'Skipping voice (--skip-voice)');
  }

  // ── Step 5: Render ───────────────────────────────────────────────────────
  logger.step('5/5', 'Rendering final video...');
  const builder = new TimelineBuilder();
  const timeline = builder.build(scenario, script, config.video);
  if (!dryRun) await writeJson(timelinePath, timeline);

  const renderer = new FfmpegRenderer();
  await renderer.render(timeline, outputPath, {
    noSubtitles: options.subtitles === false,
    noVoice: options.skipVoice ?? false,
    preview: options.preview ?? false,
    dryRun,
    ffmpegPath: resolveFfmpegPath(),
    workDir,
  });

  logger.info('');
  logger.success(dryRun ? 'Dry-run complete.' : `Build complete! → ${outputPath}`);
}
