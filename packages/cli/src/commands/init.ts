import { Command } from 'commander';

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize a new demo-video-gen project')
    .argument('[directory]', 'target directory', '.')
    .option('-t, --type <type>', 'video type: teaser|shorts|demo|tutorial', 'demo')
    .option('-u, --url <url>', 'target application URL')
    .option('-n, --name <name>', 'project name')
    .option('--dry-run', 'preview config without writing files')
    .action(async (directory: string, options: Record<string, string | boolean>) => {
      const { runInit } = await import('../runners/init.js');
      await runInit(directory, options);
    });
}
