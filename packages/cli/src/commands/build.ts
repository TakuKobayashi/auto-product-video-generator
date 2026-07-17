import { Command } from 'commander';

export function buildCommand(): Command {
  return new Command('build')
    .description('Run the full pipeline: analyze → scenario → record → voice → render')
    .option('-c, --config <path>', 'path to dvg.config.yaml', 'dvg.config.yaml')
    .option('-t, --type <type>', 'video type: teaser|shorts|demo|tutorial', 'demo')
    .option('-u, --url <url>', 'target application URL (overrides config)')
    .option('--skip-analyze', 'skip analyze step (use existing project-summary.json)')
    .option('--skip-scenario', 'skip scenario generation (use existing scenario.yaml)')
    .option('--skip-record', 'skip recording (use existing recordings)')
    .option('--skip-voice', 'skip voice generation (use existing wav files)')
    .option('--no-subtitles', 'skip subtitle overlay in final render')
    .option('--preview', 'render a fast low-quality preview')
    .option('--headed', 'show browser during recording')
    .option('--dry-run', 'dry-run all steps')
    .action(async (options: Record<string, string | boolean>) => {
      const { runBuild } = await import('../runners/build.js');
      await runBuild(options);
    });
}
