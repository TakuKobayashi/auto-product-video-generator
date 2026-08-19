import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  logger,
  type Action,
  type Scene,
  type VideoConfig,
} from '@auto-product-video-generator/core';
import type { PlatformRecorder, PlatformRecordOptions } from './types.js';
import {
  prepareAndroidProject,
  type AndroidProjectContext,
  type AndroidProjectOptions,
  type PreparedAndroidTarget,
} from './android-project.js';

export type AndroidTarget = AndroidProjectOptions;

export class AndroidRecorder implements PlatformRecorder {
  private prepared?: Promise<PreparedAndroidTarget>;
  private runtime!: PreparedAndroidTarget;

  constructor(
    private readonly target: AndroidTarget,
    private readonly context: { rootDir?: string; workDir: string }
  ) {}

  async recordScene(
    scene: Scene,
    _config: VideoConfig,
    options: PlatformRecordOptions,
    targetDurationSeconds = 1,
    actionDurationSeconds = targetDurationSeconds
  ): Promise<string> {
    const outputPath = join(options.outputDir, `scene-${scene.id}.mp4`);
    logger.step('record:android', `Scene: ${scene.id} → ${outputPath}`);
    if (options.dryRun) {
      logger.dryRun(
        `Would record ${scene.actions.length} adb action(s) for ${targetDurationSeconds.toFixed(1)}s`
      );
      return outputPath;
    }

    await mkdir(options.outputDir, { recursive: true });
    await mkdir(options.screenshotDir, { recursive: true });
    await this.prepare();
    await this.assertDeviceReady();

    const remotePath = `/sdcard/apvg-${safeName(scene.id)}.mp4`;
    await this.adb(['shell', 'rm', '-f', remotePath]);
    const recorder = this.spawnAdb([
      'shell',
      'screenrecord',
      '--time-limit',
      String(Math.max(1, Math.ceil(targetDurationSeconds + 2))),
      remotePath,
    ]);
    const startedAt = Date.now();
    let failure: unknown;
    try {
      for (let index = 0; index < scene.actions.length; index++) {
        await this.executeAction(scene.actions[index], options.screenshotDir);
        const milestone =
          (actionDurationSeconds * 1000 * (index + 1)) / Math.max(1, scene.actions.length);
        await wait(Math.max(0, milestone - (Date.now() - startedAt)));
      }
      await wait(Math.max(0, targetDurationSeconds * 1000 - (Date.now() - startedAt)));
    } catch (error) {
      failure = error;
    } finally {
      recorder.kill('SIGINT');
      await waitForExit(recorder, 5000);
      await this.adb(['pull', remotePath, outputPath]);
      await this.adb(['shell', 'rm', '-f', remotePath]);
    }
    if (!existsSync(outputPath))
      throw new Error(`Android recording was not created: ${outputPath}`);
    logger.success(`Saved: ${outputPath}`);
    if (failure)
      throw new Error(
        `Failed to record Android scene '${scene.id}'. Partial recording was saved.`,
        { cause: failure }
      );
    return outputPath;
  }

  private async assertDeviceReady(): Promise<void> {
    const state = (await this.adb(['get-state'])).trim();
    if (state !== 'device')
      throw new Error(`Android device is not ready (adb state: ${state || 'unknown'}).`);
    const packagePath = (await this.adb(['shell', 'pm', 'path', this.runtime.package])).trim();
    if (!packagePath.startsWith('package:')) {
      throw new Error(
        `Android package '${this.runtime.package}' is not installed. Build/install the APK before recording.`
      );
    }
  }

  private async executeAction(action: Action, screenshotDir: string): Promise<void> {
    switch (action.type) {
      case 'launch_app':
        if (this.runtime.activity) {
          await this.adb([
            'shell',
            'am',
            'start',
            '-W',
            '-n',
            `${this.runtime.package}/${this.runtime.activity}`,
          ]);
        } else {
          await this.adb([
            'shell',
            'monkey',
            '-p',
            this.runtime.package,
            '-c',
            'android.intent.category.LAUNCHER',
            '1',
          ]);
        }
        return;
      case 'tap': {
        const point =
          action.x !== undefined && action.y !== undefined
            ? ([action.x, action.y] as const)
            : await this.findElementCenter(action.text, action.contentDescription, screenshotDir);
        await this.adb(['shell', 'input', 'tap', String(point[0]), String(point[1])]);
        return;
      }
      case 'input_text':
        await this.adb(['shell', 'input', 'text', encodeAdbText(action.value)]);
        return;
      case 'swipe':
        await this.adb([
          'shell',
          'input',
          'swipe',
          String(action.fromX),
          String(action.fromY),
          String(action.toX),
          String(action.toY),
          String(action.durationMs),
        ]);
        return;
      case 'back':
        await this.adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
        return;
      case 'wait':
        await wait(action.ms);
        return;
      case 'screenshot':
        await this.captureScreenshot(join(screenshotDir, `${safeName(action.name)}.png`));
        return;
      case 'wait_visible':
        await this.waitForElement(action.text, undefined, screenshotDir, action.timeout ?? 10000);
        return;
      default:
        throw new Error(`Action '${action.type}' is not supported by the Android recorder.`);
    }
  }

  private async waitForElement(
    text: string | undefined,
    description: string | undefined,
    tempDir: string,
    timeoutMs: number
  ): Promise<readonly [number, number]> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        return await this.findElementCenter(text, description, tempDir);
      } catch (error) {
        lastError = error;
      }
      await wait(400);
    }
    throw new Error(`Android element did not appear: ${text || description}`, { cause: lastError });
  }

  private async findElementCenter(
    text: string | undefined,
    description: string | undefined,
    tempDir: string
  ): Promise<readonly [number, number]> {
    const remote = '/sdcard/apvg-window.xml';
    const local = join(tempDir, 'android-window.xml');
    await this.adb(['shell', 'uiautomator', 'dump', remote]);
    await this.adb(['pull', remote, local]);
    const xml = await readFile(local, 'utf8');
    const nodes = xml.match(/<node\b[^>]*>/g) || [];
    const node = nodes.find(
      (value) =>
        (text && attr(value, 'text') === text) ||
        (description && attr(value, 'content-desc') === description)
    );
    if (!node) throw new Error(`Element not found in Android UI: ${text || description}`);
    const bounds = attr(node, 'bounds')?.match(/\[(\d+),(\d+)]\[(\d+),(\d+)]/);
    if (!bounds) throw new Error('Matched Android element has no usable bounds.');
    return [
      (Number(bounds[1]) + Number(bounds[3])) / 2,
      (Number(bounds[2]) + Number(bounds[4])) / 2,
    ] as const;
  }

  private async captureScreenshot(localPath: string): Promise<void> {
    const remote = '/sdcard/apvg-screenshot.png';
    await this.adb(['shell', 'screencap', '-p', remote]);
    await this.adb(['pull', remote, localPath]);
  }

  private async prepare(): Promise<void> {
    if (!this.context.rootDir)
      throw new Error('Android recording requires a resolved source project.');
    const projectContext: AndroidProjectContext = {
      rootDir: this.context.rootDir,
      workDir: this.context.workDir,
    };
    this.prepared ||= prepareAndroidProject(this.target, projectContext);
    this.runtime = await this.prepared;
  }

  private adb(args: string[]): Promise<string> {
    return run(this.runtime.adbPath, this.adbArgs(args));
  }
  private spawnAdb(args: string[]) {
    return spawn(this.runtime.adbPath, this.adbArgs(args), { stdio: ['ignore', 'pipe', 'pipe'] });
  }
  private adbArgs(args: string[]): string[] {
    return ['-s', this.runtime.serial, ...args];
  }
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => reject(new Error(`Could not start ${command}: ${error.message}`)));
    child.on('close', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${command} ${args.join(' ')} failed (${code}): ${stderr.trim()}`))
    );
  });
}
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, timeoutMs);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
function attr(node: string, name: string): string | undefined {
  return node
    .match(new RegExp(`${name}="([^"]*)"`))?.[1]
    ?.replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}
function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}
function encodeAdbText(value: string): string {
  return value
    .replace(/ /g, '%s')
    .replace(/[^\x20-\x7E]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
