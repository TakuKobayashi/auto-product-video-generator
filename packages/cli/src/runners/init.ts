import { join, resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { createDefaultConfig, saveConfig, logger, SourceConfig } from '@demo-video-gen/core';

interface InitOptions {
  repo?: string;
  source?: string;
  ref?: string;
  serveCommand?: string;
  installDeps?: boolean;
  type?: string;
  url?: string;
  name?: string;
  force?: boolean;
  dryRun?: boolean;
}

export async function runInit(directory: string, options: InitOptions): Promise<void> {
  logger.header('demo-video-gen init');

  if (!options.repo && !options.source) {
    logger.error('You must specify exactly one of --repo <git-url> or --source <local-path>.');
    logger.error('');
    logger.error('demo-video-gen analyzes an actual (version-controlled) project to plan the');
    logger.error('recording, so it needs to know where that project lives:');
    logger.error('  demo-video-gen init --repo https://github.com/user/repo.git');
    logger.error('  demo-video-gen init --source ../my-local-project');
    process.exit(1);
  }

  if (options.repo && options.source) {
    logger.error('Specify only one of --repo or --source, not both.');
    process.exit(1);
  }

  const configPath = join(directory, 'dvg.config.yaml');

  if (existsSync(configPath) && !options.dryRun && !options.force) {
    logger.warn(`Config already exists: ${configPath}`);
    logger.warn('Delete it, or re-run with --force to overwrite it.');
    process.exit(1);
  }

  // --url is optional (defaults to http://localhost:3000 via the CLI option
  // default) and can always be overridden later — every command that needs
  // it (analyze/record/build) also accepts its own -u/--url, which takes
  // priority over whatever's saved in dvg.config.yaml.
  const url = options.url ?? 'http://localhost:3000';
  const name = options.name ?? basename(resolve(options.source ?? directory));

  const source: SourceConfig = options.repo
    ? { repository: options.repo, ref: options.ref, installDeps: options.installDeps ?? false, startCommand: options.serveCommand }
    : { localPath: options.source, installDeps: options.installDeps ?? false, startCommand: options.serveCommand };

  const config = createDefaultConfig(name, url, source);
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
    `Source: ${options.repo ? `git repository ${options.repo}${options.ref ? ` (ref: ${options.ref})` : ' (default branch)'}` : `local path ${resolve(options.source!)}`}`,
  );
  logger.info(`Target: ${url}`);
  logger.info(
    `Serve:  ${
      source.startCommand
        ? `'${source.startCommand}' will be run automatically if ${url} isn't already reachable`
        : `not set — 'analyze' will try to detect one from package.json, or start the app yourself before 'record'/'build'`
    }`,
  );
  logger.info(
    `LLM: provider=${config.llm.provider} (${
      config.llm.provider === 'gemini' ? 'GEMINI_API_KEY was set' : 'GEMINI_API_KEY was not set'
    }), fallbackProvider=${config.llm.fallbackProvider}`,
  );
  logger.info('');
  logger.info('Next steps:');
  logger.dim(`  1. Run: demo-video-gen analyze`);
  logger.dim(`  2. Run: demo-video-gen scenario generate`);
  logger.dim(`  3. Run: demo-video-gen build`);
}
