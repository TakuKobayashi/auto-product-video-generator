#!/usr/bin/env node
import { Command } from 'commander';
import { formatUnknownError } from '@demo-video-gen/core';
import { initCommand } from './commands/init.js';
import { analyzeCommand } from './commands/analyze.js';
import { scenarioCommand } from './commands/scenario.js';
import { recordCommand } from './commands/record.js';
import { voiceCommand } from './commands/voice.js';
import { renderCommand } from './commands/render.js';
import { buildCommand } from './commands/build.js';
import { projectCommand } from './commands/project.js';
import { videoCommand } from './commands/video.js';

// Every command's action handler is async; an unhandled rejection there
// (network errors, missing files, etc.) would otherwise print a raw Node.js
// stack trace, which is more confusing than helpful for end users.
process.on('unhandledRejection', (err) => {
  console.error(`\n✗ ${formatUnknownError(err)}\n`);
  if (process.env.DVG_DEBUG && err instanceof Error && err.stack) {
    console.error(err.stack);
  } else {
    console.error('(Set DVG_DEBUG=1 for a full stack trace.)');
  }
  process.exit(1);
});

const program = new Command();

program
  .name('dvg')
  .description('AI-powered promotional video generator for web apps and CLI tools')
  .version('0.1.0');

// Primary, organized interface.
program.addCommand(projectCommand());
program.addCommand(videoCommand());

// Backward-compatible legacy commands. Existing scripts keep working while
// documentation and init output use the grouped interface above.
program.addCommand(initCommand(), { hidden: true });
program.addCommand(analyzeCommand(), { hidden: true });
program.addCommand(scenarioCommand(), { hidden: true });
program.addCommand(recordCommand(), { hidden: true });
program.addCommand(voiceCommand(), { hidden: true });
program.addCommand(renderCommand(), { hidden: true });
program.addCommand(buildCommand(), { hidden: true });

// Keep accepting a forwarded `--` for backward compatibility with the old
// `pnpm dev -- ...` interface. The primary interface (`pnpm dvg ...`) does
// not require this separator.
const argv = process.argv.slice();
if (argv[2] === '--') {
  argv.splice(2, 1);
}

program.parse(argv);
