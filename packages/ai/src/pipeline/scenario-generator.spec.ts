import { describe, expect, it } from 'vitest';
import type { ProjectSummary, VideoConfig } from '@auto-product-video-generator/core';
import type { LlmProvider } from '../llm/provider.js';
import { ScenarioGenerator } from './scenario-generator.js';

describe('ScenarioGenerator route grounding', () => {
  it('uses a platform-neutral prompt for keeping recording setup out of narration', async () => {
    let attempts = 0;
    let receivedSystemPrompt = '';
    const llm: LlmProvider = {
      generate: async () => '',
      generateJson: async <T>(_prompt, systemPrompt) => {
        attempts++;
        receivedSystemPrompt = systemPrompt ?? '';
        return {
          meta: {
            title: 'Community Portal',
            description: '地域の情報を探せます。',
            type: 'demo',
            duration: 30,
            language: 'ja',
          },
          scenes: [
            {
              id: 'intro',
              title: '地域の情報',
              narration: '地域の施設情報を画面から確認できます。',
              actions: [{ type: 'goto', url: 'http://localhost:3000/' }],
            },
          ],
        } as T;
      },
    };
    const summary: ProjectSummary = {
      name: 'Community Portal',
      description: '地域の情報を探せます。',
      platform: 'web',
      setupSteps: [{ name: 'Install dependencies', command: 'pnpm install', background: false }],
      features: [],
      targetAudience: '住民',
      keyValueProps: [],
      suggestedVideoTypes: ['demo'],
      analyzedAt: new Date().toISOString(),
    };
    const config: VideoConfig = {
      type: 'demo',
      duration: 30,
      resolution: '1280x720',
      fps: 30,
      language: 'ja',
      singleLineSubtitles: true,
      pageReadyWaitSeconds: 2,
      sceneGapSeconds: 1,
    };

    const { scenario } = await new ScenarioGenerator(llm).generate(
      summary,
      config,
      'http://localhost:3000'
    );

    expect(attempts).toBe(1);
    expect(receivedSystemPrompt).toContain('regardless of project');
    expect(scenario.meta.title).toBe('Community Portal');
    expect(scenario.scenes[0].narration).toBe('地域の施設情報を画面から確認できます。');
    expect(scenario.setup[0].command).toBe('pnpm install');
  });

  it('replaces a dynamic route template with the concrete base URL', async () => {
    let receivedPrompt = '';
    const llm: LlmProvider = {
      generate: async () => '',
      generateJson: async <T>(prompt) => {
        receivedPrompt = prompt;
        return {
          meta: { title: 'Demo', description: 'Demo', type: 'demo', duration: 30, language: 'ja' },
          scenes: [
            {
              id: 'read-blogs',
              title: 'ブログ',
              narration: '記事を読めます。',
              actions: [{ type: 'goto', url: 'http://127.0.0.1:3000/en/blog/[slug]' }],
            },
          ],
        } as T;
      },
    };
    const summary: ProjectSummary = {
      name: 'Example',
      description: 'Example',
      platform: 'web',
      setupSteps: [],
      features: [
        {
          id: 'blog',
          title: 'ブログ',
          description: '記事を読む',
          route: '/en/blog/[slug]',
          demoable: true,
          priority: 'high',
        },
      ],
      targetAudience: '一般利用者',
      keyValueProps: [],
      suggestedVideoTypes: ['demo'],
      analyzedAt: new Date().toISOString(),
    };
    const video: VideoConfig = {
      type: 'demo',
      duration: 30,
      resolution: '1280x720',
      fps: 30,
      language: 'ja',
      scenarioPrompt: '語尾に「なのだ」を付ける',
      singleLineSubtitles: true,
      pageReadyWaitSeconds: 2,
      sceneGapSeconds: 1,
    };

    const { scenario } = await new ScenarioGenerator(llm).generate(
      summary,
      video,
      'http://127.0.0.1:3000'
    );

    expect(scenario.scenes[0].actions[0]).toEqual({
      type: 'goto',
      url: 'http://127.0.0.1:3000/',
    });
    expect(JSON.stringify(scenario)).not.toContain('[slug]');
    expect(receivedPrompt).toContain('語尾に「なのだ」を付ける');
    expect(receivedPrompt).toContain('<creative-direction>');
  });
});

describe('ScenarioGenerator CLI grounding', () => {
  it('keeps only documented CLI commands', async () => {
    const llm: LlmProvider = {
      generate: async () => '',
      generateJson: async <T>() =>
        ({
          meta: {
            title: 'CLI Demo',
            description: 'Demo',
            type: 'demo',
            duration: 20,
            language: 'ja',
          },
          scenes: [
            {
              id: 'help',
              title: 'Help',
              narration: '使い方を確認できます。',
              actions: [{ type: 'run_command', command: 'invented --dangerous' }],
            },
          ],
        }) as T,
    };
    const summary: ProjectSummary = {
      name: 'Example CLI',
      description: 'Example',
      platform: 'cli',
      setupSteps: [],
      features: [
        {
          id: 'help',
          title: 'Help',
          description: '使い方を見る',
          command: 'example --help',
          demoable: true,
          priority: 'high',
        },
      ],
      targetAudience: '利用者',
      keyValueProps: [],
      suggestedVideoTypes: ['demo'],
      analyzedAt: new Date().toISOString(),
    };
    const video: VideoConfig = {
      type: 'demo',
      duration: 20,
      resolution: '1280x720',
      fps: 30,
      language: 'ja',
      singleLineSubtitles: true,
      pageReadyWaitSeconds: 2,
      sceneGapSeconds: 1,
    };

    const { scenario } = await new ScenarioGenerator(llm).generate(
      summary,
      video,
      'http://localhost:3000'
    );
    expect(scenario.meta.platform).toBe('cli');
    expect(scenario.scenes[0].actions).toEqual([
      { type: 'run_command', command: 'example --help' },
    ]);
  });
});

describe('ScenarioGenerator Unity narration preservation', () => {
  it('keeps every source-grounded capability without another text rewrite', async () => {
    const llm: LlmProvider = {
      generate: async () => {
        throw new Error('Unexpected rewrite');
      },
      generateJson: async () => {
        throw new Error('Unexpected rewrite');
      },
    };
    const narration = 'A map shows positions. Movement and selection controls are available.';
    const summary = {
      name: 'Example',
      description: 'View and controls',
      platform: 'unity',
      setupSteps: [],
      features: [
        {
          id: 'Assets/Scenes/Main.unity',
          title: 'View',
          description: narration,
          demoable: true,
          priority: 'high',
        },
      ],
      targetAudience: 'Users',
      keyValueProps: [],
      suggestedVideoTypes: ['demo'],
    } as any;
    const config = { type: 'demo', language: 'en', sceneGapSeconds: 1 } as any;
    const { scenario, script } = await new ScenarioGenerator(llm).generate(
      summary,
      config,
      'http://localhost'
    );
    expect(scenario.scenes[0].id).toBe('Main');
    expect(scenario.scenes[0].actions).toEqual([{ type: 'wait', ms: 1000 }]);
    expect(scenario.scenes[0].narration).toBe(narration);
    expect(scenario.meta.language).toBe('en');
    expect(scenario.meta.platform).toBe('unity');
    expect(scenario.meta.duration).toBe(script.scenes[0].endTime);
    expect(script.scenes[0].narration).toBe(narration);
  });
  it('analyzes emotion without changing the grounded narration', async () => {
    let calls = 0;
    const llm: LlmProvider = {
      generate: async () => '',
      generateJson: async <T>() => {
        calls++;
        return { emotions: [{ j: calls === 1 ? 1 : 0.3, s: 0.2, a: 0 }] } as T;
      },
    };
    const summary = {
      name: 'Gallery',
      description: 'Browse exhibits',
      platform: 'unity',
      setupSteps: [],
      features: [
        {
          id: 'Assets/Gallery.unity',
          title: 'Exhibits',
          description: 'Select an exhibit to read its details.',
          demoable: true,
          priority: 'high',
        },
      ],
      targetAudience: 'Visitors',
      keyValueProps: [],
      suggestedVideoTypes: ['demo'],
    } as any;
    const config = { type: 'demo', language: 'en', duration: 20, sceneGapSeconds: 1 } as any;
    const { scenario, script } = await new ScenarioGenerator(llm).generate(
      summary,
      config,
      'http://localhost',
      true
    );
    expect(calls).toBe(2);
    expect(scenario.scenes[0].narration).toBe(summary.features[0].description);
    expect(script.scenes[0].emotion).toEqual({ j: 0.3, s: 0.2, a: 0 });
    expect(scenario.meta.duration).toBe(20);
  });
});
