import { join } from 'node:path';
import { loadConfig, writeJson, logger } from '@demo-video-gen/core';
import { createLlmProvider, ProjectAnalyzer } from '@demo-video-gen/ai';

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
  const outputPath = join(config.output.workDir, 'project-summary.json');

  logger.info(`Target URL: ${targetUrl}`);
  logger.info(`LLM:        ${config.llm.provider} / ${config.llm.model}`);
  logger.info(`Output:     ${outputPath}`);

  if (options.dryRun) {
    logger.dryRun('Would call LLM to analyze project.');
    logger.dryRun(`Would write: ${outputPath}`);
    return;
  }

  const llm = createLlmProvider(config.llm);
  const analyzer = new ProjectAnalyzer(llm);
  const summary = await analyzer.analyze(targetUrl);

  await writeJson(outputPath, summary);

  logger.success(`Saved: ${outputPath}`);
  logger.info('');
  logger.info(`Found ${summary.features.length} features:`);
  for (const f of summary.features) {
    const mark = f.priority === 'high' ? '★' : f.priority === 'medium' ? '◆' : '◇';
    logger.dim(`  ${mark} [${f.priority}] ${f.title}`);
  }
  logger.info('');
  logger.info('Next: demo-video-gen scenario generate');
}
