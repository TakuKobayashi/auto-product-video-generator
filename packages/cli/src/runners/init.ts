import { join, resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { createDefaultConfig, saveConfig, logger } from '@demo-video-gen/core';

interface InitOptions {
  type?: string;
  url?: string;
  name?: string;
  force?: boolean;
  dryRun?: boolean;
}

export async function runInit(directory: string, options: InitOptions): Promise<void> {
  logger.header('demo-video-gen init');

  const configPath = join(directory, 'dvg.config.yaml');

  if (existsSync(configPath) && !options.dryRun && !options.force) {
    logger.warn(`Config already exists: ${configPath}`);
    logger.warn('Delete it, or re-run with --force to overwrite it.');
    process.exit(1);
  }

  const url = options.url ?? 'http://localhost:3000';
  const name = options.name ?? basename(resolve(directory));

  const config = createDefaultConfig(name, url);
  config.video.type = (options.type as 'teaser' | 'shorts' | 'demo' | 'tutorial') ?? 'demo';

  if (options.dryRun) {
    logger.dryRun(`Would write: ${configPath}`);
    logger.dryRun(JSON.stringify(config, null, 2));
    return;
  }

  await saveConfig(configPath, config);

  logger.success(`Created: ${configPath}`);
  logger.info('');
  logger.info(
    `LLM: provider=${config.llm.provider} (${
      config.llm.provider === 'gemini' ? 'GEMINI_API_KEY was set' : 'GEMINI_API_KEY was not set'
    }), fallbackProvider=${config.llm.fallbackProvider}`,
  );
  logger.info('');
  logger.info('Next steps:');
  logger.dim(`  1. Edit dvg.config.yaml to set your target URL and LLM provider`);
  logger.dim(`  2. Run: demo-video-gen analyze`);
  logger.dim(`  3. Run: demo-video-gen scenario generate`);
  logger.dim(`  4. Run: demo-video-gen build`);
}
