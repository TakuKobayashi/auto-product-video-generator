import type { DvgConfig, ProjectPlatform } from '@demo-video-gen/core';
import { SceneRecorder } from '@demo-video-gen/playwright';
import { AndroidRecorder } from './android-recorder.js';
import type { PlatformRecorder } from './types.js';

export function createPlatformRecorder(platform: ProjectPlatform, config: DvgConfig): PlatformRecorder {
  if (platform === 'web') return new SceneRecorder();
  if (platform === 'android' || platform === 'flutter' || platform === 'react-native') {
    if (!config.target.android) {
      throw new Error(
        `Platform '${platform}' needs target.android.package in dvg.config.yaml. ` +
        'Start an emulator/device, install the app, then set its Android application id.',
      );
    }
    return new AndroidRecorder(config.target.android);
  }
  if (platform === 'unity') {
    if (config.target.android) return new AndroidRecorder(config.target.android);
    throw new Error(
      'Unity batch mode can build the project, but cannot record an interactive promotional demo by itself. ' +
      'Build/install an Android player and set target.android.package to record it through adb.',
    );
  }
  throw new Error(
    `Recording platform '${platform}' is not implemented yet. ` +
    "Currently supported: web, Android, and Flutter/React Native/Unity builds targeting Android.",
  );
}
