import { Command } from 'commander';

export function scenarioCommand(): Command {
  const cmd = new Command('scenario').description('Scenario management commands');

  cmd
    .command('generate')
    .description('Generate scenario.yaml and script.yaml via AI')
    .option('-c, --config <path>', 'path to dvg.config.yaml', 'dvg.config.yaml')
    .option('-t, --type <type>', 'override video type: teaser|shorts|demo|tutorial')
    .option('--force', 'overwrite existing scenario.yaml')
    .option('--dry-run', 'preview scenario without saving')
    .action(async (options: Record<string, string | boolean>) => {
      const { runScenarioGenerate } = await import('../runners/scenario.js');
      await runScenarioGenerate(options);
    });

  cmd
    .command('validate')
    .description('Validate an existing scenario.yaml against the schema')
    .argument('[file]', 'scenario file path', '.dvg/scenario.yaml')
    .action(async (file: string) => {
      const { runScenarioValidate } = await import('../runners/scenario.js');
      await runScenarioValidate(file);
    });

  return cmd;
}
