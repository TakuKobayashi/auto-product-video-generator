import { describe, expect, it } from 'vitest';
import type { ProjectSummary, VideoConfig } from '@demo-video-gen/core';
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
      language: 'ja', sceneGapSeconds: 1,
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
