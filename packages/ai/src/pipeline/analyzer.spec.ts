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

  it('removes web-server setup and grounds commands for a CLI workspace', async () => {
    const llm: LlmProvider = {
      generate: async () => '',
      generateJson: async <T>() =>
        ({
          name: 'Example CLI',
          description: 'Example',
          platform: 'cli',
          setupSteps: [
            { name: 'Install dependencies', command: 'npm install', background: false },
            { name: 'Build CLI', command: 'npm run build', background: false },
            {
              name: 'Start application',
              command: 'npm run dev',
              background: true,
              readyUrl: 'http://localhost:3000',
            },
          ],
          features: [
            {
              id: 'help',
              title: 'Help',
              description: 'Show help',
              command: 'invented-command --help',
              demoable: true,
              priority: 'high',
            },
          ],
          targetAudience: 'Everyone',
          keyValueProps: [],
          suggestedVideoTypes: ['demo'],
        }) as T,
    };
    const context = {
      rootDir: 'C:\\repo\\packages\\cli',
      repositoryRoot: 'C:\\repo',
      projectPath: 'packages\\cli',
      packageManager: 'pnpm',
      packageJson: {
        name: 'example-cli',
        scripts: { build: 'tsc' },
        bin: { example: 'bin/example.js' },
      },
      readme: '',
      framework: 'unknown',
      routes: [],
      fileTree: [],
      platformHints: ['package.json declares bin command(s)'],
      assetFiles: [],
    } as ProjectSourceContext;

    const summary = await new ProjectAnalyzer(llm).analyze(context);

    expect(summary.setupSteps).toEqual([
      expect.objectContaining({ command: 'pnpm install', cwd: '..\\..', background: false }),
      expect.objectContaining({ command: 'npm run build', background: false }),
    ]);
    expect(summary.setupSteps.every((step) => !step.background)).toBe(true);
    expect(summary.features[0].command).toBe('node packages/cli/bin/example.js --help');
  });

  it('does not invent install or build steps for an already executable CLI', async () => {
    const llm: LlmProvider = {
      generate: async () => '',
      generateJson: async <T>() =>
        ({
          name: 'Standalone CLI',
          description: 'Example',
          platform: 'cli',
          setupSteps: [],
          features: [],
          targetAudience: 'Everyone',
          keyValueProps: [],
          suggestedVideoTypes: ['demo'],
        }) as T,
    };
    const context = {
      rootDir: 'C:\\repo\\tools\\standalone',
      repositoryRoot: 'C:\\repo',
      projectPath: 'tools\\standalone',
      packageManager: 'npm',
      packageJson: { name: 'standalone', bin: { standalone: 'bin/standalone.js' } },
      readme: 'Run node bin/standalone.js --help.',
      framework: 'unknown',
      routes: [],
      fileTree: [],
      platformHints: ['package.json declares bin command(s)'],
      assetFiles: [],
    } as ProjectSourceContext;

    const summary = await new ProjectAnalyzer(llm).analyze(context);

    expect(summary.setupSteps).toEqual([]);
  });

  it('preserves non-Node setup commands for a CLI in a subdirectory', async () => {
    const llm: LlmProvider = {
      generate: async () => '',
      generateJson: async <T>() =>
        ({
          name: 'Python CLI',
          description: 'Example',
          platform: 'cli',
          setupSteps: [
            { name: 'Install Python package', command: 'pip install -e .', background: false },
          ],
          features: [],
          targetAudience: 'Everyone',
          keyValueProps: [],
          suggestedVideoTypes: ['demo'],
        }) as T,
    };
    const context = {
      rootDir: 'C:\\repo\\tools\\python-cli',
      repositoryRoot: 'C:\\repo',
      projectPath: 'tools\\python-cli',
      packageManager: 'npm',
      packageJson: null,
      readme: 'Install with pip install -e .',
      framework: 'unknown',
      routes: [],
      fileTree: ['pyproject.toml'],
      platformHints: [],
      assetFiles: [],
    } as ProjectSourceContext;

    const summary = await new ProjectAnalyzer(llm).analyze(context);

    expect(summary.setupSteps).toEqual([
      expect.objectContaining({ command: 'pip install -e .', background: false }),
    ]);
  });
});
