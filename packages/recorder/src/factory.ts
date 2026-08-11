import type { DvgConfig, ProjectPlatform } from '@demo-video-gen/core';
import { SceneRecorder } from '@demo-video-gen/playwright';
import { AndroidRecorder } from './android-recorder.js';
import type { PlatformRecorder } from './types.js';

export interface RecorderFactoryOptions {
  rootDir?: string;
  workDir: string;
}

export function isAndroidRecordingPlatform(platform: ProjectPlatform): boolean {
  return platform === 'android' || platform === 'flutter' ||
    platform === 'react-native' || platform === 'unity';
}

export function createPlatformRecorder(
  platform: ProjectPlatform,
  config: DvgConfig,
  options: RecorderFactoryOptions,
): PlatformRecorder {
  if (platform === 'web') return new SceneRecorder();
  if (platform === 'android' || platform === 'flutter' || platform === 'react-native') {
    return new AndroidRecorder(config.target.android ?? {}, options);
  }
  if (platform === 'unity') {
    return new AndroidRecorder(config.target.android ?? {}, options);
  }
  throw new Error(
    `Recording platform '${platform}' is not implemented yet. ` +
    "Currently supported: web, Android, and Flutter/React Native/Unity builds targeting Android.",
  );
}
