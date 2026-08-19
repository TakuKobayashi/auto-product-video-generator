import { Command } from 'commander';

export function authCommand(): Command {
  const command = new Command('auth').description('Manage authentication for web recording');

  command.addCommand(
    new Command('login')
      .description('Open a browser for manual login and save Playwright authentication state')
      .option('-c, --config <path>', 'path to apvg.config.yml', 'apvg.config.yml')
      .option('--login-url <url>', 'override target.auth.loginUrl or target.url')
      .option('--storage-state <path>', 'override target.auth.storageStatePath')
      .option('--success-url <url>', 'save automatically after this URL is reached')
      .option('--timeout <seconds>', 'success URL timeout in seconds', '600')
      .option('--slow-mo <ms>', 'slow down browser operations by N milliseconds', '0')
      .action(async (options: Record<string, string>) => {
        const { runAuthLogin } = await import('../runners/auth.js');
        await runAuthLogin(options);
      })
  );

  return command;
}
