import { Command } from 'commander';

export function renderCommand(): Command {
  return new Command('render')
    .description('Render the final video using ffmpeg')
    .option('-c, --config <path>', 'path to dvg.config.yaml', 'dvg.config.yaml')
    .option('--no-subtitles', 'skip subtitle overlay')
    .option('--no-voice', 'skip voice narration')
    .option('--preview', 'render a fast low-quality preview (ultrafast preset)')
    .option('--ffmpeg <path>', 'path to ffmpeg binary', 'ffmpeg')
    .option('--dry-run', 'print ffmpeg command without executing')
    .action(async (options: Record<string, string | boolean>) => {
      const { runRender } = await import('../runners/render.js');
      await runRender(options);
    });
}
