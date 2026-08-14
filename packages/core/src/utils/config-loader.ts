import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as yaml from 'js-yaml';
import { ZodError } from 'zod';
import { ApvgConfig, ApvgConfigSchema, SourceConfig } from '../types/config.js';

export async function loadConfig(configPath: string): Promise<ApvgConfig> {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}\nRun 'pnpm apvg project init' first.`);
  }
  const raw = await readFile(configPath, 'utf-8');
  const parsed = yaml.load(raw);

  const result = ApvgConfigSchema.safeParse(parsed);
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
      `  pnpm apvg project init --repo <git-url> --url <target-url> --force\n` +
      `  pnpm apvg project init --source <local-path> --url <target-url> --force`
    : '';
  return `Invalid ${configPath}:\n${lines.join('\n')}${hint}`;
}

export async function saveConfig(configPath: string, config: ApvgConfig): Promise<void> {
  const content = yaml.dump(config, { lineWidth: 120, quotingType: '"' });
  await writeFile(configPath, content, 'utf-8');
}

export function createDefaultConfig(name: string, url: string, source: SourceConfig, autoDetectUrl = false): ApvgConfig {
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

  return ApvgConfigSchema.parse({
    project: { name, description: '' },
    source,
    target: { url, autoDetectUrl, type: 'web' },
    video: {},
    llm,
    voicevox: {},
    output: {},
  });
}
