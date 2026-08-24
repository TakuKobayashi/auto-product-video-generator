import { describe, expect, it } from 'vitest';
import type { ProjectSourceContext } from '@auto-product-video-generator/source';
import type { LlmProvider } from '../llm/provider.js';
import { ProjectAnalyzer } from './analyzer.js';

describe('ProjectAnalyzer setup grounding', () => {
  it('runs the selected workspace application command from its own directory', async () => {
    const llm: LlmProvider = {
      generate: async () => '',
      generateJson: async <T>() =>
        ({
          name: 'Example',
          description: 'Example app',
          platform: 'web',
          setupSteps: [
            { name: 'Install dependencies', command: 'pnpm install', background: false },
            {
              name: 'Start application',
              command: 'pnpm --dir apps/web dev',
              cwd: 'apps/web',
              background: true,
              readyUrl: 'http://localhost:9999',
            },
          ],
          features: [],
          targetAudience: 'Everyone',
          keyValueProps: [],
          suggestedVideoTypes: ['demo'],
        }) as T,
    };
    const context = {
      rootDir: 'C:\\repo\\apps\\web',
      repositoryRoot: 'C:\\repo',
      projectPath: 'apps\\web',
      packageManager: 'pnpm',
      packageJson: { name: '@example/web', scripts: { dev: 'next dev' } },
      readme: '',
      framework: 'nextjs',
      routes: [],
      fileTree: [],
      platformHints: [],
      assetFiles: [],
    } as ProjectSourceContext;

    const summary = await new ProjectAnalyzer(llm).analyze(context, 'http://localhost:3000');

    expect(summary.setupSteps).toEqual([
      expect.objectContaining({ command: 'pnpm install', cwd: '..\\..', background: false }),
      expect.objectContaining({
        command: 'pnpm run dev',
        cwd: undefined,
        background: true,
        readyUrl: 'http://localhost:3000',
      }),
    ]);
  });
});
