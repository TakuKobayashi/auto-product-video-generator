import { Command } from 'commander';
import { serveServices, showServiceStatus, stopServices } from '../runners/services.js';

function addServeOptions(command: Command): Command {
  return command
    .option('--no-ollama', 'do not start Ollama (use with GEMINI_API_KEY)')
    .option('--model <name>', 'Ollama model to pull', 'qwen2.5:7b-instruct')
    .option('--voicevox-image <image>', 'VOICEVOX Docker image', 'voicevox/voicevox_engine:cpu-latest');
}

export function serveCommand(): Command {
  return addServeOptions(new Command('serve')
    .description('Start the VOICEVOX Engine and, when needed, Ollama'))
    .action(serveServices);
}

export function servicesCommand(): Command {
  const command = new Command('services').description('Manage services required by APVG');
  command.addCommand(addServeOptions(new Command('start').description('Start required services')).action(serveServices));
  command.addCommand(new Command('status').description('Check required service availability').action(showServiceStatus));
  command.addCommand(new Command('stop').description('Stop the APVG-managed VOICEVOX container').action(stopServices));
  return command;
}
