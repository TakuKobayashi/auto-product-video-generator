import { Command } from 'commander';

export function recordCommand(): Command {
  return new Command('record')
    .description('Record interactions using the recorder selected for the detected platform')
    .option('-c, --config <path>', 'path to dvg.config.yaml', 'dvg.config.yaml')
    .option('-s, --scene <id>', 'record a specific scene only')
    .option('--headed', 'show the browser window during recording')
    .option('--slow-mo <ms>', 'slow down each action by N milliseconds', '0')
    .option('--dry-run', 'validate the recording plan without launching a browser or device')
    .action(async (options: Record<string, string | boolean>) => {
      const { runRecord } = await import('../runners/record.js');
      await runRecord(options);
    });
}
