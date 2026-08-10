import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as yaml from 'js-yaml';
import { ZodError } from 'zod';
import { DvgConfig, DvgConfigSchema, SourceConfig } from '../types/config.js';

export async function loadConfig(configPath: string): Promise<DvgConfig> {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}\nRun 'demo-video-gen init' first.`);
  }
  const raw = await readFile(configPath, 'utf-8');
  const parsed = yaml.load(raw);

  const result = DvgConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(formatConfigError(configPath, result.error));
  }
  return result.data;
}

function formatConfigError(configPath: string, error: ZodError): string {
  const lines = error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  const missingSource = error.issues.some((i) => i.path[0] === 'source');
  const hint = missingSource
    ? `\nThis usually means ${configPath} predates the 'source' field (added so 'analyze' can read real ` +
      `project source instead of guessing from a URL). Re-run:\n` +
      `  demo-video-gen init --repo <git-url> --url <target-url> --force\n` +
      `  demo-video-gen init --source <local-path> --url <target-url> --force`
    : '';
  return `Invalid ${configPath}:\n${lines.join('\n')}${hint}`;
}

export async function saveConfig(configPath: string, config: DvgConfig): Promise<void> {
  const content = yaml.dump(config, { lineWidth: 120, quotingType: '"' });
  await writeFile(configPath, content, 'utf-8');
}

export function createDefaultConfig(name: string, url: string, source: SourceConfig): DvgConfig {
  // Pick a default that only references providers usable right now. Do not
  // add a cloud fallback without its API key: Ollama-only usage must remain
  // fully local and must never fail with an unrelated cloud-key error.
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;

  const llm = hasGeminiKey
    ? {
        provider: 'gemini' as const,
        model: 'gemini-2.5-pro',
        fallbackProvider: 'ollama' as const,
        fallbackModel: 'qwen2.5:7b-instruct',
      }
    : {
        provider: 'ollama' as const,
        model: 'qwen2.5:7b-instruct',
        ollamaHost: 'http://127.0.0.1:11434',
      };

  return DvgConfigSchema.parse({
    project: { name, description: '' },
    source,
    target: { url, type: 'web' },
    video: {},
    llm,
    voicevox: {},
    output: {},
  });
}
