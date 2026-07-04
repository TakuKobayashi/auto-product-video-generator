#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { analyzeCommand } from './commands/analyze.js';
import { scenarioCommand } from './commands/scenario.js';
import { recordCommand } from './commands/record.js';
import { voiceCommand } from './commands/voice.js';
import { renderCommand } from './commands/render.js';
import { buildCommand } from './commands/build.js';

const program = new Command();

program
  .name('demo-video-gen')
  .description('AI-powered promotional video generator for web apps and CLI tools')
  .version('0.1.0');

program.addCommand(initCommand());
program.addCommand(analyzeCommand());
program.addCommand(scenarioCommand());
program.addCommand(recordCommand());
program.addCommand(voiceCommand());
program.addCommand(renderCommand());
program.addCommand(buildCommand());

program.parse();
