import { Command } from 'commander';

export function analyzeCommand(): Command {
  return new Command('analyze')
    .description('Analyze target project/URL and extract features via AI')
    .option('-c, --config <path>', 'path to apvg.config.yml', 'apvg.config.yml')
    .option('-u, --url <url>', 'override target URL from config')
    .option('--source-dir <path>', 'source clone/cache directory (default: <workDir>/source-repo)')
    .option(
      '--source-context <path>',
      'source context JSON output (default: <workDir>/source-context.json)'
    )
    .option(
      '--project-summary <path>',
      'project summary JSON output (default: <workDir>/project-summary.json)'
    )
    .option('--dry-run', 'show what would be analyzed without calling AI')
    .option('--verbose', 'verbose output')
    .action(async (options: Record<string, string | boolean>) => {
      const { runAnalyze } = await import('../runners/analyze.js');
      await runAnalyze(options);
    });
}
