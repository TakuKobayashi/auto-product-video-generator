import { Command } from 'commander';

export function voiceCommand(): Command {
  return new Command('voice')
    .description('Generate voice narration via VOICEVOX')
    .option('-c, --config <path>', 'path to dvg.config.yaml', 'dvg.config.yaml')
    .option('--speaker <id>', 'override VOICEVOX speaker ID')
    .option('-s, --scene <id>', 'generate voice for a specific scene only')
    .option('--dry-run', 'validate script without calling VOICEVOX')
    .action(async (options: Record<string, string | boolean>) => {
      const { runVoice } = await import('../runners/voice.js');
      await runVoice(options);
    });
}
