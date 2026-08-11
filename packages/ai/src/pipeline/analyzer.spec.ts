import { describe, expect, it } from 'vitest';
import type { ProjectSourceContext } from '@demo-video-gen/source';
import type { LlmProvider } from '../llm/provider.js';
import { ProjectAnalyzer } from './analyzer.js';

describe('ProjectAnalyzer', () => {
  it('repairs a missing top-level description without another LLM call', async () => {
    let calls = 0;
    const llm: LlmProvider = {
      generate: async () => '',
      generateJson: async <T>() => {
        calls++;
        return {
          name: 'Example',
          platform: 'web',
          setupSteps: [],
          features: [],
          targetAudience: '一般利用者',
          keyValueProps: [],
          suggestedVideoTypes: ['demo'],
        } as T;
      },
    };
    const context: ProjectSourceContext = {
      rootDir: '/tmp/example',
      packageJson: { name: 'example', description: '商品を分かりやすく紹介します。' },
      readme: null,
      framework: 'nextjs-app-router',
      routes: [{ path: '/', file: 'app/page.tsx' }],
      fileTree: [],
      platformHints: [],
    };

    const result = await new ProjectAnalyzer(llm).analyze(context, 'http://127.0.0.1:3000');

    expect(result.description).toBe('商品を分かりやすく紹介します。');
    expect(calls).toBe(1);
  });
});
