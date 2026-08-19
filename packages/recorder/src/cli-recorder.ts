import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type {
  Scene,
  SetupStep,
  TargetConfig,
  VideoConfig,
} from '@auto-product-video-generator/core';
import { isSafeCliCommand, logger } from '@auto-product-video-generator/core';
import type { PlatformRecordOptions, PlatformRecorder } from './types.js';

export interface CliRecorderOptions {
  rootDir?: string;
  repositoryRoot?: string;
  setupSteps: SetupStep[];
  sourceExcludePatterns: string[];
}

export class CliRecorder implements PlatformRecorder {
  private containerName?: string;
  private setupComplete = false;

  constructor(
    private readonly config: TargetConfig['cli'],
    private readonly context: CliRecorderOptions
  ) {}

  async recordScene(
    scene: Scene,
    video: VideoConfig,
    options: PlatformRecordOptions,
    targetDurationSeconds = 1
  ): Promise<string> {
    const outputPath = join(options.outputDir, `scene-${scene.id}.mp4`);
    logger.step('cli:record', `Scene: ${scene.id} → ${outputPath}`);

    const commands = scene.actions.filter((action) => action.type === 'run_command');
    if (options.dryRun) {
      for (const action of commands) logger.dryRun(`Would run in Docker: ${action.command}`);
      return outputPath;
    }

    await this.ensureContainer();
    await this.ensureSetup();
    await Promise.all([
      mkdir(options.outputDir, { recursive: true }),
      mkdir(options.screenshotDir, { recursive: true }),
    ]);

    const [width, height] = video.resolution.split('x').map(Number);
    const browser = await chromium.launch({ headless: !options.headed, slowMo: options.slowMo });
    const context = await browser.newContext({
      viewport: { width, height },
      recordVideo: { dir: options.outputDir, size: { width, height } },
    });
    const page = await context.newPage();
    await page.setContent(
      terminalDocument(this.config.fontSize, this.config.columns, this.config.rows)
    );

    const startedAt = Date.now();
    let failure: Error | undefined;
    try {
      for (const action of scene.actions) {
        if (action.type === 'run_command') {
          await appendTerminal(page, `$ ${action.command}\n`, 18);
          if (
            !isSafeCliCommand(
              action.command,
              this.config.allowedCommands,
              this.config.deniedCommandPatterns
            )
          ) {
            throw new Error(`Refusing unsafe CLI recording command: ${action.command}`);
          }
          const result = await runProcess(
            'docker',
            [
              'exec',
              '--workdir',
              '/workspace',
              this.containerName!,
              this.config.shell,
              '-lc',
              action.command,
            ],
            false
          );
          const output = stripAnsi(result.stdout + result.stderr).trimEnd();
          if (output)
            await appendTerminal(page, `${output}\n`, outputDelay(output, targetDurationSeconds));
          if (result.code !== 0) {
            await appendTerminal(page, `[exit ${result.code}]\n`, 8);
            failure = new Error(`CLI command failed (${result.code}): ${action.command}`);
            break;
          }
        } else if (action.type === 'wait') {
          await page.waitForTimeout(action.ms);
        } else if (action.type === 'screenshot') {
          await page.screenshot({ path: join(options.screenshotDir, `${action.name}.png`) });
        }
      }

      const elapsed = (Date.now() - startedAt) / 1000;
      const holdSeconds = Math.max(0, targetDurationSeconds - elapsed);
      if (holdSeconds > 0) await page.waitForTimeout(holdSeconds * 1000);
    } finally {
      const videoPath = await page.video()?.path();
      await context.close();
      await browser.close();
      if (videoPath && existsSync(videoPath)) await rename(videoPath, outputPath);
    }

    if (failure) throw failure;
    logger.success(`Saved: ${outputPath}`);
    return outputPath;
  }

  async dispose(): Promise<void> {
    if (!this.containerName) return;
    const name = this.containerName;
    this.containerName = undefined;
    await runProcess('docker', ['rm', '-f', name], false).catch(() => undefined);
    logger.info(`Stopped CLI recording container: ${name}`);
  }

  private async ensureContainer(): Promise<void> {
    if (this.containerName) return;
    if (!this.context.rootDir)
      throw new Error('CLI recording requires a resolved source directory.');

    await runProcess('docker', ['version', '--format', '{{.Server.Version}}']);
    const image = this.config.image;
    const dockerfile = resolve(this.config.dockerfile || defaultDockerfile());
    await runProcess('docker', ['build', '-t', image, '-f', dockerfile, dirname(dockerfile)]);

    const name = `apvg-cli-${process.pid}-${Date.now().toString(36)}`;
    const repositoryRoot = resolve(this.context.repositoryRoot || this.context.rootDir);
    const copyCommand = dockerCopyCommand(this.context.sourceExcludePatterns);
    await runProcess('docker', [
      'run',
      '-d',
      '--rm',
      '--name',
      name,
      '--label',
      'dev.apvg.owner=cli-recorder',
      '--mount',
      `type=bind,source=${repositoryRoot},target=/source,readonly`,
      image,
      this.config.shell,
      '-lc',
      `${copyCommand} && sleep infinity`,
    ]);
    this.containerName = name;
    logger.success(`CLI recording container ready: ${name}`);
  }

  private async ensureSetup(): Promise<void> {
    if (this.setupComplete) return;
    for (const step of this.context.setupSteps) {
      logger.step('cli:setup', `${step.name}: ${step.command}`);
      const repositoryRoot = resolve(this.context.repositoryRoot || this.context.rootDir!);
      const projectPath = relative(repositoryRoot, resolve(this.context.rootDir!))
        .split('\\')
        .join('/');
      const cwd = posix.resolve('/workspace', projectPath, step.cwd || '.');
      if (cwd !== '/workspace' && !cwd.startsWith('/workspace/')) {
        throw new Error(`CLI setup cwd must stay inside the recording workspace: ${step.cwd}`);
      }
      const command = step.background
        ? `nohup ${step.command} >/tmp/apvg-setup.log 2>&1 &`
        : step.command;
      const result = await runProcess(
        'docker',
        ['exec', '--workdir', cwd, this.containerName!, this.config.shell, '-lc', command],
        false
      );
      if (result.code !== 0)
        throw new Error(`CLI setup failed (${result.code}): ${step.command}\n${result.stderr}`);
    }
    this.setupComplete = true;
  }
}

function dockerCopyCommand(patterns: string[]): string {
  const exclusions = [...new Set(['.git', ...patterns])]
    .filter((pattern) => pattern && !pattern.startsWith('!'))
    .map((pattern) => `--exclude=${shellQuote(pattern.replace(/^\//, ''))}`)
    .join(' ');
  return `tar -C /source ${exclusions} -cf - . | tar -C /workspace -xf -`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function defaultDockerfile(): string {
  return fileURLToPath(new URL('../docker/cli/Dockerfile', import.meta.url));
}

function terminalDocument(fontSize: number, columns: number, rows: number): string {
  return `<!doctype html><html><head><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0d1117}
    body{padding:44px;display:flex;align-items:center;justify-content:center;font:${fontSize}px/1.45 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#e6edf3}
    .window{width:min(100%,calc(${columns}ch + 48px));height:min(100%,calc(${rows * 1.45}em + 90px));border:1px solid #30363d;border-radius:14px;background:#010409;box-shadow:0 20px 70px #0008;overflow:hidden}
    .bar{height:42px;background:#161b22;border-bottom:1px solid #30363d;padding:13px 16px}
    .dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:8px}.r{background:#ff5f57}.y{background:#febc2e}.g{background:#28c840}
    pre{margin:0;padding:24px;height:calc(100% - 42px);white-space:pre-wrap;overflow:hidden;color:#f0f6fc}
    .cursor{display:inline-block;width:.6em;height:1.15em;background:#f0f6fc;vertical-align:-.2em;animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:0}}
  </style></head><body><div class="window"><div class="bar"><i class="dot r"></i><i class="dot y"></i><i class="dot g"></i></div><pre id="terminal"></pre></div></body></html>`;
}

async function appendTerminal(
  page: import('playwright').Page,
  text: string,
  delay: number
): Promise<void> {
  await page.evaluate(
    async ({ value, charDelay }) => {
      const pageDocument = (
        globalThis as unknown as {
          document: {
            getElementById(id: string): {
              textContent: string | null;
              scrollTop: number;
              scrollHeight: number;
            } | null;
          };
        }
      ).document;
      const terminal = pageDocument.getElementById('terminal')!;
      for (const char of value) {
        terminal.textContent = (terminal.textContent || '') + char;
        terminal.scrollTop = terminal.scrollHeight;
        if (charDelay > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, charDelay));
      }
    },
    { value: text, charDelay: delay }
  );
}

function outputDelay(output: string, targetDuration: number): number {
  return Math.max(1, Math.min(12, Math.floor((targetDuration * 500) / Math.max(output.length, 1))));
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '');
}

function runProcess(
  command: string,
  args: string[],
  rejectOnFailure = true
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      const result = { code: code ?? 1, stdout, stderr };
      if (rejectOnFailure && result.code !== 0) {
        rejectRun(
          new Error(`${command} ${args.join(' ')} failed (${result.code}): ${stderr.trim()}`)
        );
      } else {
        resolveRun(result);
      }
    });
  });
}
