#!/usr/bin/env node
import { Command } from 'commander';
import { formatUnknownError } from '@auto-product-video-generator/core';
import { projectCommand } from './commands/project.js';
import { videoCommand } from './commands/video.js';

// Every command's action handler is async; an unhandled rejection there
// (network errors, missing files, etc.) would otherwise print a raw Node.js
// stack trace, which is more confusing than helpful for end users.
process.on('unhandledRejection', (err) => {
  console.error(`\n✗ ${formatUnknownError(err)}\n`);
  if (process.env.APVG_DEBUG && err instanceof Error && err.stack) {
    console.error(err.stack);
  } else {
    console.error('(Set APVG_DEBUG=1 for a full stack trace.)');
  }
  process.exit(1);
});

const program = new Command();

program
  .name('apvg')
  .description('AI-powered promotional video generator for web apps and CLI tools')
  .version('0.1.0');

program.addCommand(projectCommand());
program.addCommand(videoCommand());

program.parse();
