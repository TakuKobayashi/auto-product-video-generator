import { Command } from 'commander';

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize a new demo-video-gen project from a git-managed source project')
    .argument('[directory]', 'target directory for dvg.config.yaml', '.')
    .option('--repo <url>', 'git repository URL to clone and analyze (e.g. https://github.com/user/repo.git)')
    .option('--source <path>', 'path to an existing local git project to analyze')
    .option('--ref <ref>', 'git branch/tag/commit to check out (only with --repo)')
    .option('-u, --url <url>', 'URL where the app can be reached once running, e.g. http://localhost:3000', 'http://localhost:3000')
    .option('-t, --type <type>', 'video type: teaser|shorts|demo|tutorial', 'demo')
    .option('-n, --name <name>', 'project name')
    .option('--force', 'overwrite an existing dvg.config.yaml')
    .option('--dry-run', 'preview config without writing files')
    .action(async (directory: string, options: Record<string, string | boolean>) => {
      const { runInit } = await import('../runners/init.js');
      await runInit(directory, options);
    });
}
