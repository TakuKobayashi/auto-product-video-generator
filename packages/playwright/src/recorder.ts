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

    try {
      await this.executeActions(page, scene.actions, options.screenshotDir);
      // Small pause at end so last frame is visible
      await page.waitForTimeout(500);
    } catch (err) {
      logger.warn(`Scene '${scene.id}' had an error: ${(err as Error).message}`);
      logger.warn('Saving partial recording anyway.');
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

    return outputPath;
  }

  private async executeActions(
    page: Page,
    actions: Action[],
    screenshotDir: string,
  ): Promise<void> {
    for (const action of actions) {
      await this.executeAction(page, action, screenshotDir);
      // Small stabilization pause between actions
      await page.waitForTimeout(100);
    }
  }

  private async executeAction(
    page: Page,
    action: Action,
    screenshotDir: string,
  ): Promise<void> {
    switch (action.type) {
      case 'goto':
        await page.goto(action.url, { waitUntil: 'networkidle' });
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
      default: return '';
    }
  }
}
