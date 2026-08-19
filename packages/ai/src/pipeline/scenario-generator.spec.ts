import { describe, expect, it } from 'vitest';
import type { ProjectSummary, VideoConfig } from '@auto-product-video-generator/core';
import type { LlmProvider } from '../llm/provider.js';
import { ScenarioGenerator } from './scenario-generator.js';

describe('ScenarioGenerator route grounding', () => {
  it('replaces a dynamic route template with the concrete base URL', async () => {
    const llm: LlmProvider = {
      generate: async () => '',
      generateJson: async <T>() => ({
        meta: { title: 'Demo', description: 'Demo', type: 'demo', duration: 30, language: 'ja' },
        scenes: [{
          id: 'read-blogs',
          title: 'ブログ',
          narration: '記事を読めます。',
          actions: [{ type: 'goto', url: 'http://127.0.0.1:3000/en/blog/[slug]' }],
        }],
      }) as T,
    };
    const summary: ProjectSummary = {
      name: 'Example', description: 'Example', platform: 'web', setupSteps: [],
      features: [{
        id: 'blog', title: 'ブログ', description: '記事を読む', route: '/en/blog/[slug]',
        demoable: true, priority: 'high',
      }],
      targetAudience: '一般利用者', keyValueProps: [], suggestedVideoTypes: ['demo'],
      analyzedAt: new Date().toISOString(),
    };
    const video: VideoConfig = {
      type: 'demo', duration: 30, resolution: '1280x720', fps: 30,
      language: 'ja', singleLineSubtitles: true, pageReadyWaitSeconds: 2, sceneGapSeconds: 1,
    };

    const { scenario } = await new ScenarioGenerator(llm).generate(
      summary, video, 'http://127.0.0.1:3000',
    );

    expect(scenario.scenes[0].actions[0]).toEqual({
      type: 'goto', url: 'http://127.0.0.1:3000/',
    });
    expect(JSON.stringify(scenario)).not.toContain('[slug]');
  });
});

describe('ScenarioGenerator CLI grounding', () => {
  it('keeps only documented CLI commands', async () => {
    const llm: LlmProvider = {
      generate: async () => '',
      generateJson: async <T>() => ({
        meta: { title: 'CLI Demo', description: 'Demo', type: 'demo', duration: 20, language: 'ja' },
        scenes: [{
          id: 'help', title: 'Help', narration: '使い方を確認できます。',
          actions: [{ type: 'run_command', command: 'invented --dangerous' }],
        }],
      }) as T,
    };
    const summary: ProjectSummary = {
      name: 'Example CLI', description: 'Example', platform: 'cli', setupSteps: [],
      features: [{
        id: 'help', title: 'Help', description: '使い方を見る', command: 'example --help',
        demoable: true, priority: 'high',
      }],
      targetAudience: '利用者', keyValueProps: [], suggestedVideoTypes: ['demo'],
      analyzedAt: new Date().toISOString(),
    };
    const video: VideoConfig = {
      type: 'demo', duration: 20, resolution: '1280x720', fps: 30,
      language: 'ja', singleLineSubtitles: true, pageReadyWaitSeconds: 2, sceneGapSeconds: 1,
    };

    const { scenario } = await new ScenarioGenerator(llm).generate(summary, video, 'http://localhost:3000');
    expect(scenario.meta.platform).toBe('cli');
    expect(scenario.scenes[0].actions).toEqual([{ type: 'run_command', command: 'example --help' }]);
  });
});
