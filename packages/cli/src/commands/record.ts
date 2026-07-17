import { Command } from 'commander';

export function recordCommand(): Command {
  return new Command('record')
    .description('Record browser interactions using Playwright')
    .option('-c, --config <path>', 'path to dvg.config.yaml', 'dvg.config.yaml')
    .option('-s, --scene <id>', 'record a specific scene only')
    .option('--headed', 'show the browser window during recording')
    .option('--slow-mo <ms>', 'slow down each action by N milliseconds', '0')
    .option('--dry-run', 'validate scenario actions without launching a browser')
    .action(async (options: Record<string, string | boolean>) => {
      const { runRecord } = await import('../runners/record.js');
      await runRecord(options);
    });
}
