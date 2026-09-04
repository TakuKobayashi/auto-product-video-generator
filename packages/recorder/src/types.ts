import type { Scene, VideoConfig } from '@auto-product-video-generator/core';

export interface PlatformRecordOptions {
  headed: boolean;
  slowMo: number;
  outputDir: string;
  screenshotDir: string;
  dryRun: boolean;
  /** Original zero-based position in scenario.yml (used for Unity scene mapping). */
  sceneIndex?: number;
  /** Used only by the Playwright web recorder. */
  storageStatePath?: string;
}

export interface PlatformRecorder {
  recordScene(
    scene: Scene,
    config: VideoConfig,
    options: PlatformRecordOptions,
    targetDurationSeconds?: number,
    actionDurationSeconds?: number
  ): Promise<string>;
  dispose?(): Promise<void>;
}
