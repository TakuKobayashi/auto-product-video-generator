import { Timeline, Script, Scenario, VideoConfig, logger } from '@auto-product-video-generator/core';
import { buildSubtitleCues } from './subtitle-generator.js';

/**
 * Deterministically builds timeline.json from scenario + script.
 * No AI involved — purely computed from intermediate files.
 */
export class TimelineBuilder {
  build(scenario: Scenario, script: Script, config: VideoConfig): Timeline {
    logger.step('timeline', 'Building timeline.json...');

    const [width, height] = config.resolution.split('x').map(Number);
    const totalDuration = script.scenes.reduce((max, s) => Math.max(max, s.endTime), 0);

    const tracks: Timeline['tracks'] = [];

    for (let sceneIndex = 0; sceneIndex < script.scenes.length; sceneIndex++) {
      const scene = script.scenes[sceneIndex];
      const nextScene = script.scenes[sceneIndex + 1];
      const videoEndTime = nextScene?.startTime ?? scene.endTime;
      // Video track
      tracks.push({
        type: 'video',
        id: `v-${scene.id}`,
        sceneId: scene.id,
        src: `recordings/scene-${scene.id}.mp4`,
        startTime: scene.startTime,
        endTime: videoEndTime,
        trimStart: 0,
        trimEnd: videoEndTime - scene.startTime,
        speed: 1.0,
      });

      // Audio and subtitles use the exact synthesized-audio timing.
      tracks.push({
        type: 'audio',
        id: `a-${scene.id}`,
        sceneId: scene.id,
        src: scene.voiceFile,
        startTime: scene.startTime,
        endTime: scene.endTime,
        volume: 0.9,
      });

      // Subtitle tracks are display-only slices of the original narration.
      // Audio continues to use the full sentence above.
      const subtitleCues = buildSubtitleCues(scene.narration, scene.startTime, scene.endTime);
      for (let cueIndex = 0; cueIndex < subtitleCues.length; cueIndex++) {
        const cue = subtitleCues[cueIndex];
        tracks.push({
          type: 'subtitle',
          id: `s-${scene.id}-${cueIndex}`,
          sceneId: scene.id,
          text: cue.text,
          startTime: cue.startTime,
          endTime: cue.endTime,
          style: {
            fontSize: 36,
            color: '#FFFFFF',
            bgColor: '#00000088',
            position: 'bottom',
          },
        });
      }

      // Effects from scenario
      const scenarioDef = scenario.scenes.find((s) => s.id === scene.id);
      if (scenarioDef?.effects) {
        for (let i = 0; i < scenarioDef.effects.length; i++) {
          const effect = scenarioDef.effects[i];
          const duration = 'duration' in effect ? (effect.duration as number) : 1.0;
          tracks.push({
            type: 'effect',
            id: `e-${scene.id}-${i}`,
            effect,
            startTime: scene.startTime,
            endTime: scene.startTime + duration,
          });
        }
      }
    }

    return {
      meta: {
        totalDuration,
        resolution: config.resolution,
        fps: config.fps,
        generatedAt: new Date().toISOString(),
      },
      tracks,
    };
  }
}
