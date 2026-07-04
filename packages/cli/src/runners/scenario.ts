import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import {
  loadConfig,
  readJson,
  writeYaml,
  ensureDir,
  logger,
  ProjectSummary,
  ScenarioSchema,
} from '@demo-video-gen/core';
import { createLlmProvider, ScenarioGenerator, SubtitleGenerator } from '@demo-video-gen/ai';

interface ScenarioGenerateOptions {
  config?: string;
  type?: string;
  force?: boolean;
  dryRun?: boolean;
}

export async function runScenarioGenerate(options: ScenarioGenerateOptions): Promise<void> {
  logger.header('demo-video-gen scenario generate');

  const configPath = options.config ?? 'dvg.config.yaml';
  const config = await loadConfig(configPath);

  const workDir = config.output.workDir;
  const summaryPath = join(workDir, 'project-summary.json');
  const scenarioPath = join(workDir, 'scenario.yaml');
  const scriptPath = join(workDir, 'script.yaml');
  const srtPath = join(workDir, 'subtitles.srt');

  if (!existsSync(summaryPath)) {
    logger.error(`project-summary.json not found. Run 'demo-video-gen analyze' first.`);
    process.exit(1);
  }

  if (existsSync(scenarioPath) && !options.force && !options.dryRun) {
    logger.warn(`${scenarioPath} already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  const summary = await readJson<ProjectSummary>(summaryPath);

  const videoConfig = {
    ...config.video,
    ...(options.type ? { type: options.type as 'teaser' | 'shorts' | 'demo' | 'tutorial' } : {}),
  };

  if (options.dryRun) {
    logger.dryRun(`Would generate scenario for: ${summary.name}`);
    logger.dryRun(`Video type: ${videoConfig.type}, duration: ~${videoConfig.duration}s`);
    logger.dryRun(`Would write: ${scenarioPath}`);
    logger.dryRun(`Would write: ${scriptPath}`);
    logger.dryRun(`Would write: ${srtPath}`);
    return;
  }

  await ensureDir(workDir);

  const llm = createLlmProvider(config.llm);
  const generator = new ScenarioGenerator(llm);
  const { scenario, script } = await generator.generate(summary, videoConfig);

  await writeYaml(scenarioPath, scenario);
  logger.success(`Saved: ${scenarioPath}`);

  await writeYaml(scriptPath, script);
  logger.success(`Saved: ${scriptPath}`);

  const subtitleGen = new SubtitleGenerator();
  const srt = subtitleGen.generateSrt(script);
  await writeFile(srtPath, srt, 'utf-8');
  logger.success(`Saved: ${srtPath}`);

  logger.info('');
  logger.info(`Generated ${scenario.scenes.length} scenes:`);
  for (const scene of scenario.scenes) {
    logger.dim(`  • [${scene.id}] ${scene.title} (${scene.actions.length} actions)`);
  }
  logger.info('');
  logger.info('Review and edit the files above, then run:');
  logger.dim('  demo-video-gen record');
}

export async function runScenarioValidate(filePath: string): Promise<void> {
  logger.header('demo-video-gen scenario validate');

  if (!existsSync(filePath)) {
    logger.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const { readYaml } = await import('@demo-video-gen/core');
  const raw = await readYaml(filePath);

  const result = ScenarioSchema.safeParse(raw);
  if (result.success) {
    logger.success(`Valid scenario: ${filePath}`);
    logger.dim(`  ${result.data.scenes.length} scenes, type: ${result.data.meta.type}`);
  } else {
    logger.error(`Invalid scenario: ${filePath}`);
    for (const issue of result.error.issues) {
      logger.error(`  ${issue.path.join('.')} — ${issue.message}`);
    }
    process.exit(1);
  }
}
