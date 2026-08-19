import { Command } from 'commander';

export function renderCommand(): Command {
  return new Command('render')
    .description('Render the final video using ffmpeg')
    .option('-c, --config <path>', 'path to apvg.config.yml', 'apvg.config.yml')
    .option('--scenario <path>', 'scenario YML input (default: <workDir>/scenario.yml)')
    .option('--script <path>', 'timed script YML input (default: <workDir>/script.yml)')
    .option('--voice-dir <path>', 'WAV input directory (default: <workDir>/voice)')
    .option(
      '--recordings-dir <path>',
      'recorded MP4 input directory (default: <workDir>/recordings)'
    )
    .option(
      '--screenshots-dir <path>',
      'screenshot artifact input directory (default: <workDir>/screenshots)'
    )
    .option('--subtitles-file <path>', 'SRT subtitles input (default: <workDir>/subtitles.srt)')
    .option('--timeline <path>', 'timeline JSON output (default: <workDir>/timeline.json)')
    .option('-o, --output <path>', 'final video output (default: <outputDir>/final.mp4)')
    .option(
      '--artifacts-dir <path>',
      'intermediate artifact output directory (default: <outputDir>/artifacts)'
    )
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
