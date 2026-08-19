import { Command } from 'commander';
import { initCommand } from './init.js';
import { analyzeCommand } from './analyze.js';

export function projectCommand(): Command {
  const command = new Command('project').description('Initialize and analyze the source project');
  command.addCommand(initCommand());
  command.addCommand(analyzeCommand());
  return command;
}
