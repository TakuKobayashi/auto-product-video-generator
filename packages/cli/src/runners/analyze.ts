import { join } from 'node:path';
import { loadConfig, saveConfig, writeJson, logger } from '@demo-video-gen/core';
import { createLlmProvider, ProjectAnalyzer } from '@demo-video-gen/ai';
import { resolveProjectSource, inspectProject, detectStartCommand } from '@demo-video-gen/source';

interface AnalyzeOptions {
  config?: string;
  url?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

export async function runAnalyze(options: AnalyzeOptions): Promise<void> {
  logger.header('demo-video-gen analyze');

  const configPath = options.config ?? 'dvg.config.yaml';
  const config = await loadConfig(configPath);

  const targetUrl = options.url ?? config.target.url;
  const cloneDir = join(config.output.workDir, 'source-repo');
  const contextPath = join(config.output.workDir, 'source-context.json');
  const summaryPath = join(config.output.workDir, 'project-summary.json');

  logger.info(`Source:     ${config.source.repository ?? config.source.localPath}`);
  logger.info(`Target URL: ${targetUrl}`);
  logger.info(`LLM:        ${config.llm.provider} / ${config.llm.model}`);

  if (options.dryRun) {
    logger.dryRun('Would resolve project source (clone/verify) and inspect it for routes.');
    logger.dryRun(`Would write: ${contextPath}`);
    logger.dryRun('Would call LLM to analyze project.');
    logger.dryRun(`Would write: ${summaryPath}`);
    return;
  }

  // Deterministic: resolve (clone or verify local) + inspect the actual source.
  logger.step('source', 'Resolving project source (this may take a moment for a fresh clone)...');
  const rootDir = await resolveProjectSource({ source: config.source, cloneDir });
  const sourceContext = await inspectProject(rootDir);

  await writeJson(contextPath, sourceContext);
  logger.success(`Saved: ${contextPath}`);

  if (sourceContext.routes.length === 0) {
    logger.warn(
      `No routes could be auto-discovered for framework '${sourceContext.framework}'. ` +
      `The AI will infer routes from the file listing instead — review scenario.yaml carefully after generation.`,
    );
  }

  // If dvg.config.yaml doesn't already say how to start the dev server,
  // suggest one from package.json's scripts and save it — 'record'/'build'
  // will use it to start the app automatically instead of requiring it to
  // already be running.
  if (!config.source.startCommand) {
    const detected = detectStartCommand(sourceContext.packageJson);
    if (detected) {
      config.source.startCommand = detected;
      await saveConfig(configPath, config);
      logger.info(`Detected dev server command '${detected}' — saved to ${configPath} (source.startCommand).`);
      logger.dim(`  Edit dvg.config.yaml if this isn't right, or clear it to start the app yourself.`);
    }
  }

  // AI: turn the deterministic source context into a feature summary.
  const llm = createLlmProvider(config.llm);
  const analyzer = new ProjectAnalyzer(llm);
  const summary = await analyzer.analyze(sourceContext);

  await writeJson(summaryPath, summary);

  logger.success(`Saved: ${summaryPath}`);
  logger.info('');
  logger.info(`Found ${summary.features.length} features:`);
  for (const f of summary.features) {
    const mark = f.priority === 'high' ? '★' : f.priority === 'medium' ? '◆' : '◇';
    logger.dim(`  ${mark} [${f.priority}] ${f.title}  ${f.route ? `(${f.route})` : ''}`);
  }
  logger.info('');
  logger.info('Next: demo-video-gen scenario generate');
}
