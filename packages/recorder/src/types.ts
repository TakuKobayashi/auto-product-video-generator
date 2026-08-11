import type { Scene, VideoConfig } from '@demo-video-gen/core';

export interface PlatformRecordOptions {
  headed: boolean;
  slowMo: number;
  outputDir: string;
  screenshotDir: string;
  dryRun: boolean;
}

export interface PlatformRecorder {
  recordScene(
    scene: Scene,
    config: VideoConfig,
    options: PlatformRecordOptions,
    targetDurationSeconds?: number,
    actionDurationSeconds?: number,
  ): Promise<string>;
}
