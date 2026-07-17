import { Timeline, Script, Scenario, VideoConfig, logger } from '@demo-video-gen/core';

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

    for (const scene of script.scenes) {
      // Video track
      tracks.push({
        type: 'video',
        id: `v-${scene.id}`,
        sceneId: scene.id,
        src: `recordings/scene-${scene.id}.mp4`,
        startTime: scene.startTime,
        endTime: scene.endTime,
        trimStart: 0,
        speed: 1.0,
      });

      // Audio track (offset by 0.3s for natural feel)
      tracks.push({
        type: 'audio',
        id: `a-${scene.id}`,
        sceneId: scene.id,
        src: scene.voiceFile,
        startTime: scene.startTime + 0.3,
        endTime: scene.endTime,
        volume: 0.9,
      });

      // Subtitle track
      tracks.push({
        type: 'subtitle',
        id: `s-${scene.id}`,
        sceneId: scene.id,
        text: scene.narration,
        startTime: scene.startTime + 0.3,
        endTime: scene.endTime,
        style: {
          fontSize: 36,
          color: '#FFFFFF',
          bgColor: '#00000088',
          position: 'bottom',
        },
      });

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
