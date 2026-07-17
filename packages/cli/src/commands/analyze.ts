import { Command } from 'commander';

export function analyzeCommand(): Command {
  return new Command('analyze')
    .description('Analyze target project/URL and extract features via AI')
    .option('-c, --config <path>', 'path to dvg.config.yaml', 'dvg.config.yaml')
    .option('-u, --url <url>', 'override target URL from config')
    .option('--dry-run', 'show what would be analyzed without calling AI')
    .option('--verbose', 'verbose output')
    .action(async (options: Record<string, string | boolean>) => {
      const { runAnalyze } = await import('../runners/analyze.js');
      await runAnalyze(options);
    });
}
