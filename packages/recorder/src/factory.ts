import type { ApvgConfig, ProjectPlatform, SetupStep } from '@auto-product-video-generator/core';
import { SceneRecorder } from '@auto-product-video-generator/playwright';
import { AndroidRecorder } from './android-recorder.js';
import { CliRecorder } from './cli-recorder.js';
import type { PlatformRecorder } from './types.js';

export interface RecorderFactoryOptions {
  rootDir?: string;
  repositoryRoot?: string;
  workDir: string;
  setupSteps?: SetupStep[];
  sourceExcludePatterns?: string[];
}

export function isAndroidRecordingPlatform(platform: ProjectPlatform): boolean {
  return platform === 'android' || platform === 'flutter' ||
    platform === 'react-native' || platform === 'unity';
}

export function createPlatformRecorder(
  platform: ProjectPlatform,
  config: ApvgConfig,
  options: RecorderFactoryOptions,
): PlatformRecorder {
  if (platform === 'web') return new SceneRecorder();
  if (platform === 'cli') {
    return new CliRecorder(config.target.cli, {
      rootDir: options.rootDir,
      repositoryRoot: options.repositoryRoot,
      setupSteps: options.setupSteps || [],
      sourceExcludePatterns: options.sourceExcludePatterns || [],
    });
  }
  if (platform === 'android' || platform === 'flutter' || platform === 'react-native') {
    return new AndroidRecorder(config.target.android || {}, options);
  }
  if (platform === 'unity') {
    return new AndroidRecorder(config.target.android || {}, options);
  }
  throw new Error(
    `Recording platform '${platform}' is not implemented yet. ` +
    "Currently supported: web, CLI, Android, and Flutter/React Native/Unity builds targeting Android.",
  );
}
