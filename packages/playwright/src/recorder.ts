import { chromium, Page, BrowserContext } from 'playwright';
import { rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Scene,
  Action,
  Scenario,
  VideoConfig,
  logger,
} from '@demo-video-gen/core';

export interface RecordOptions {
  headed: boolean;
  slowMo: number;
  outputDir: string;
  screenshotDir: string;
  dryRun: boolean;
}

export class SceneRecorder {
  async recordAll(
    scenario: Scenario,
    config: VideoConfig,
    options: RecordOptions,
  ): Promise<string[]> {
    const outputPaths: string[] = [];

    for (const scene of scenario.scenes) {
      const outputPath = await this.recordScene(scene, config, options);
      outputPaths.push(outputPath);
    }

    return outputPaths;
  }

  async recordScene(
    scene: Scene,
    config: VideoConfig,
    options: RecordOptions,
    targetDurationSeconds?: number,
    actionDurationSeconds = targetDurationSeconds,
  ): Promise<string> {
    const [width, height] = config.resolution.split('x').map(Number);
    const outputPath = join(options.outputDir, `scene-${scene.id}.mp4`);

    logger.step('record', `Scene: ${scene.id} → ${outputPath}`);

    if (options.dryRun) {
      logger.dryRun(`Would record scene '${scene.id}' with ${scene.actions.length} actions`);
      for (const action of scene.actions) {
        logger.dryRun(`  action: ${action.type}${this.describeAction(action)}`);
      }
      return outputPath;
    }

    if (!existsSync(options.outputDir)) {
      await mkdir(options.outputDir, { recursive: true });
    }
    if (!existsSync(options.screenshotDir)) {
      await mkdir(options.screenshotDir, { recursive: true });
    }

    const browser = await chromium.launch({
      headless: !options.headed,
      slowMo: options.slowMo,
    });

    const context = await browser.newContext({
      viewport: { width, height },
      recordVideo: {
        dir: options.outputDir,
        size: { width, height },
      },
    });

    const page = await context.newPage();
    let recordingError: unknown;
    const startedAt = Date.now();

    try {
      await this.executeActions(
        page,
        scene.actions,
        options.screenshotDir,
        actionDurationSeconds,
        startedAt,
      );
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const holdSeconds = Math.max(0, (targetDurationSeconds ?? 0.5) - elapsedSeconds);
      if (holdSeconds > 0) {
        logger.dim(`  Holding final frame for ${holdSeconds.toFixed(1)}s`);
        await page.waitForTimeout(holdSeconds * 1000);
      } else if (targetDurationSeconds && elapsedSeconds > targetDurationSeconds) {
        logger.warn(
          `Scene '${scene.id}' actions took ${elapsedSeconds.toFixed(1)}s, ` +
          `longer than its ${targetDurationSeconds.toFixed(1)}s narration slot.`,
        );
      }
    } catch (err) {
      recordingError = err;
      logger.error(`Scene '${scene.id}' recording failed: ${(err as Error).message}`);
    } finally {
      const videoPath = await page.video()?.path();
      await context.close();
      await browser.close();

      // Playwright writes video after context.close()
      if (videoPath && existsSync(videoPath)) {
        await rename(videoPath, outputPath);
        logger.success(`Saved: ${outputPath}`);
      } else {
        logger.warn(`Video file not found for scene '${scene.id}'`);
      }
    }

    if (recordingError) {
      throw new Error(`Failed to record scene '${scene.id}'. Partial recording was saved.`, {
        cause: recordingError,
      });
    }

    return outputPath;
  }

  private async executeActions(
    page: Page,
    actions: Action[],
    screenshotDir: string,
    targetDurationSeconds?: number,
    startedAt = Date.now(),
  ): Promise<void> {
    for (let index = 0; index < actions.length; index++) {
      const action = actions[index];
      await this.executeAction(page, action, screenshotDir);
      // Spread quick interactions across the narration instead of executing
      // every click immediately and showing only a long frozen final frame.
      if (targetDurationSeconds && actions.length > 0) {
        const milestoneMs = (targetDurationSeconds * 1000 * (index + 1)) / actions.length;
        const elapsedMs = Date.now() - startedAt;
        await page.waitForTimeout(Math.max(0, milestoneMs - elapsedMs));
      } else {
        await page.waitForTimeout(100);
      }
    }
  }

  private async executeAction(
    page: Page,
    action: Action,
    screenshotDir: string,
  ): Promise<void> {
    switch (action.type) {
      case 'goto':
        {
          const response = await page.goto(action.url, { waitUntil: 'networkidle' });
          if (!response) throw new Error(`Navigation to ${action.url} returned no response`);
          if (!response.ok()) {
            throw new Error(`Navigation to ${action.url} returned HTTP ${response.status()}`);
          }
        }
        break;

      case 'click': {
        const loc = this.resolveLocator(page, action);
        await loc.click();
        break;
      }

      case 'type': {
        const loc = this.resolveLocator(page, action);
        await loc.fill('');
        await loc.pressSequentially(action.value, { delay: action.delay ?? 40 });
        break;
      }

      case 'wait_visible': {
        const loc = this.resolveLocator(page, action);
        await loc.waitFor({ state: 'visible', timeout: action.timeout ?? 10000 });
        break;
      }

      case 'wait':
        await page.waitForTimeout(action.ms);
        break;

      case 'scroll':
        await page.mouse.wheel(0, action.direction === 'down' ? action.amount : -action.amount);
        break;

      case 'hover': {
        const loc = this.resolveLocator(page, action);
        await loc.hover();
        break;
      }

      case 'screenshot': {
        const p = join(screenshotDir, `${action.name}.png`);
        await page.screenshot({ path: p, fullPage: false });
        logger.dim(`  Screenshot saved: ${p}`);
        break;
      }

      case 'launch_app':
      case 'tap':
      case 'input_text':
      case 'swipe':
      case 'back':
        throw new Error(`Action '${action.type}' is only valid for a device recorder.`);

      default:
        logger.warn(`Unknown action type: ${(action as Action).type}`);
    }
  }

  private resolveLocator(
    page: Page,
    action: { text?: string; selector?: string; role?: string; label?: string },
  ) {
    if (action.role && action.label) {
      return page.getByRole(action.role as Parameters<Page['getByRole']>[0], {
        name: action.label,
      });
    }
    if (action.label) {
      return page.getByLabel(action.label);
    }
    if (action.text) {
      return page.getByText(action.text, { exact: false });
    }
    if (action.selector) {
      return page.locator(action.selector);
    }
    throw new Error(
      `Action must specify at least one of: text, label, role+label, or selector.\nAction: ${JSON.stringify(action)}`,
    );
  }

  private describeAction(action: Action): string {
    switch (action.type) {
      case 'goto': return ` → ${action.url}`;
      case 'click': return ` "${action.text ?? action.label ?? action.selector}"`;
      case 'type': return ` "${action.value.slice(0, 20)}${action.value.length > 20 ? '...' : ''}"`;
      case 'wait': return ` ${action.ms}ms`;
      case 'wait_visible': return ` "${action.text ?? action.selector}"`;
      case 'scroll': return ` ${action.direction} ${action.amount}px`;
      case 'hover': return ` "${action.text ?? action.label ?? action.selector}"`;
      case 'screenshot': return ` "${action.name}"`;
      case 'launch_app': return '';
      case 'tap': return ` "${action.text ?? action.contentDescription ?? `${action.x},${action.y}`}"`;
      case 'input_text': return ` "${action.value.slice(0, 20)}"`;
      case 'swipe': return ` ${action.fromX},${action.fromY} → ${action.toX},${action.toY}`;
      case 'back': return '';
      default: return '';
    }
  }
}
