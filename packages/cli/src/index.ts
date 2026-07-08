#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { analyzeCommand } from './commands/analyze.js';
import { scenarioCommand } from './commands/scenario.js';
import { recordCommand } from './commands/record.js';
import { voiceCommand } from './commands/voice.js';
import { renderCommand } from './commands/render.js';
import { buildCommand } from './commands/build.js';

// Every command's action handler is async; an unhandled rejection there
// (network errors, missing files, etc.) would otherwise print a raw Node.js
// stack trace, which is more confusing than helpful for end users.
process.on('unhandledRejection', (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n✗ ${message}\n`);
  if (process.env.DVG_DEBUG && err instanceof Error && err.stack) {
    console.error(err.stack);
  } else {
    console.error('(Set DVG_DEBUG=1 for a full stack trace.)');
  }
  process.exit(1);
});

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
