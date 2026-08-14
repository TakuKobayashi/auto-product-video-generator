import { Command } from 'commander';

export function scenarioCommand(): Command {
  const cmd = new Command('scenario').description('Scenario management commands');

  cmd
    .command('generate')
    .description('Generate scenario.yml and script.yml via AI')
    .option('-c, --config <path>', 'path to apvg.config.yml', 'apvg.config.yml')
    .option('-t, --type <type>', 'override video type: teaser|shorts|demo|tutorial')
    .option('--force', 'overwrite existing scenario.yml')
    .option('--dry-run', 'preview scenario without saving')
    .action(async (options: Record<string, string | boolean>) => {
      const { runScenarioGenerate } = await import('../runners/scenario.js');
      await runScenarioGenerate(options);
    });

  cmd
    .command('validate')
    .description('Validate an existing scenario.yml against the schema')
    .argument('[file]', 'scenario file path', '.apvg/scenario.yml')
    .action(async (file: string) => {
      const { runScenarioValidate } = await import('../runners/scenario.js');
      await runScenarioValidate(file);
    });

  return cmd;
}
