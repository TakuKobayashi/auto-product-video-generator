import { LlmConfig, LlmProviderName, logger } from '@demo-video-gen/core';

export interface LlmProvider {
  generate(prompt: string, systemPrompt?: string): Promise<string>;
  generateJson<T>(prompt: string, systemPrompt?: string): Promise<T>;
}

// --- Gemini ---

export class GeminiProvider implements LlmProvider {
  constructor(
    private model: string,
    private apiKey: string,
  ) {}

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({
      model: this.model,
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  async generateJson<T>(prompt: string, systemPrompt?: string): Promise<T> {
    const raw = await this.generate(prompt, systemPrompt);
    const cleaned = stripCodeFence(raw);
    return JSON.parse(cleaned) as T;
  }
}

// --- Ollama (fully local, via `ollama serve`) ---
//
// Requires the Ollama daemon running locally (see Taskfile: `task serve:ollama`)
// and the target model pulled (see Taskfile: `task install:ollama`).
// Ollama's /api/generate endpoint supports `format: "json"`, which we use for
// generateJson() to significantly improve JSON-schema compliance from local
// models — this matters a lot for scenario/subtitle generation reliability.

export class OllamaProvider implements LlmProvider {
  constructor(
    private model: string,
    private host: string = 'http://localhost:11434',
  ) {}

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    return this.call(prompt, systemPrompt);
  }

  async generateJson<T>(prompt: string, systemPrompt?: string): Promise<T> {
    const raw = await this.call(prompt, systemPrompt, 'json');
    const cleaned = stripCodeFence(raw);
    return JSON.parse(cleaned) as T;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.host}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async call(prompt: string, systemPrompt?: string, format?: 'json'): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      prompt,
      system: systemPrompt,
      stream: false,
    };
    if (format) body.format = format;

    let res: Response;
    try {
      res = await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Could not reach Ollama at ${this.host} (${(err as Error).message}).\n` +
        `Run 'task serve:ollama' (or 'ollama serve') first.`,
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Ollama request failed (${res.status}): ${text}\n` +
        `Is the model '${this.model}' pulled? Run: ollama pull ${this.model}`,
      );
    }

    const data = (await res.json()) as { response: string };
    return data.response;
  }
}

// --- Stub providers for future implementation ---

export class OpenAIProvider implements LlmProvider {
  constructor(private model: string, private apiKey: string) {}

  async generate(_prompt: string, _systemPrompt?: string): Promise<string> {
    throw new Error('OpenAI provider not yet implemented. PRs welcome!');
  }

  async generateJson<T>(_prompt: string, _systemPrompt?: string): Promise<T> {
    throw new Error('OpenAI provider not yet implemented. PRs welcome!');
  }
}

export class ClaudeProvider implements LlmProvider {
  constructor(private model: string, private apiKey: string) {}

  async generate(_prompt: string, _systemPrompt?: string): Promise<string> {
    throw new Error('Claude provider not yet implemented. PRs welcome!');
  }

  async generateJson<T>(_prompt: string, _systemPrompt?: string): Promise<T> {
    throw new Error('Claude provider not yet implemented. PRs welcome!');
  }
}

export class GroqProvider implements LlmProvider {
  constructor(private model: string, private apiKey: string) {}

  async generate(_prompt: string, _systemPrompt?: string): Promise<string> {
    throw new Error('Groq provider not yet implemented. PRs welcome!');
  }

  async generateJson<T>(_prompt: string, _systemPrompt?: string): Promise<T> {
    throw new Error('Groq provider not yet implemented. PRs welcome!');
  }
}

// --- Fallback wrapper ---
//
// Lets two providers be used together: if the primary provider's call fails
// for any reason (offline, missing API key, rate-limited, model not pulled,
// invalid JSON, etc.) the fallback provider is used transparently. This is
// how Ollama (free/offline) and Gemini (cloud/higher quality) can back each
// other up, in either direction, depending on `llm.provider` /
// `llm.fallbackProvider` in dvg.config.yaml.

export class FallbackLlmProvider implements LlmProvider {
  private cachedFallback: LlmProvider | null = null;

  constructor(
    private primary: LlmProvider,
    private primaryLabel: string,
    private buildFallback: () => LlmProvider,
    private fallbackLabel: string,
  ) {}

  private getFallback(): LlmProvider {
    if (!this.cachedFallback) {
      this.cachedFallback = this.buildFallback();
    }
    return this.cachedFallback;
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      return await this.primary.generate(prompt, systemPrompt);
    } catch (err) {
      logger.warn(`[llm] ${this.primaryLabel} failed (${(err as Error).message})`);
      logger.warn(`[llm] falling back to ${this.fallbackLabel}...`);
      return this.getFallback().generate(prompt, systemPrompt);
    }
  }

  async generateJson<T>(prompt: string, systemPrompt?: string): Promise<T> {
    try {
      return await this.primary.generateJson<T>(prompt, systemPrompt);
    } catch (err) {
      logger.warn(`[llm] ${this.primaryLabel} failed (${(err as Error).message})`);
      logger.warn(`[llm] falling back to ${this.fallbackLabel}...`);
      return this.getFallback().generateJson<T>(prompt, systemPrompt);
    }
  }
}

// --- Factory ---

function buildSingleProvider(
  provider: LlmProviderName,
  model: string,
  apiKeyEnv: string | undefined,
  ollamaHost: string,
): LlmProvider {
  const getKey = (envName: string) => {
    const key = process.env[envName];
    if (!key) throw new Error(`Environment variable ${envName} is not set.`);
    return key;
  };

  switch (provider) {
    case 'gemini':
      return new GeminiProvider(model, getKey(apiKeyEnv ?? 'GEMINI_API_KEY'));
    case 'openai':
      return new OpenAIProvider(model, getKey(apiKeyEnv ?? 'OPENAI_API_KEY'));
    case 'claude':
      return new ClaudeProvider(model, getKey(apiKeyEnv ?? 'ANTHROPIC_API_KEY'));
    case 'groq':
      return new GroqProvider(model, getKey(apiKeyEnv ?? 'GROQ_API_KEY'));
    case 'ollama':
      return new OllamaProvider(model, process.env.OLLAMA_HOST ?? ollamaHost);
    default:
      throw new Error(`Unknown LLM provider: ${provider satisfies never}`);
  }
}

export function createLlmProvider(config: LlmConfig): LlmProvider {
  const primary = buildSingleProvider(
    config.provider,
    config.model,
    config.apiKeyEnv,
    config.ollamaHost,
  );

  if (!config.fallbackProvider) {
    return primary;
  }

  const fallbackModel =
    config.fallbackModel ?? (config.fallbackProvider === 'ollama' ? 'qwen2.5:7b-instruct' : config.model);

  // Built lazily: constructing e.g. a GeminiProvider requires its API key to
  // be present, but we shouldn't demand that key up front if the primary
  // provider (e.g. a local Ollama model) ends up never failing.
  const buildFallback = () =>
    buildSingleProvider(
      config.fallbackProvider!,
      fallbackModel,
      config.fallbackApiKeyEnv,
      config.ollamaHost,
    );

  return new FallbackLlmProvider(
    primary,
    `${config.provider}/${config.model}`,
    buildFallback,
    `${config.fallbackProvider}/${fallbackModel}`,
  );
}

/**
 * Same as createLlmProvider, but applies dvg.config.yaml's optional
 * `llm.tasks.<task>` override first (provider/model/apiKeyEnv), falling
 * back to the top-level llm.* settings for anything not overridden. Use
 * this from analyze/scenario-generate instead of createLlmProvider
 * directly, so per-task model choices (e.g. a stronger model just for
 * scenario generation) actually take effect.
 *
 * The fallback chain (llm.fallbackProvider/-Model) is untouched by task
 * overrides — it always comes from the top-level config, since a fallback
 * is meant to be a general safety net regardless of which task is running.
 */
export function createLlmProviderForTask(config: LlmConfig, task: 'analyze' | 'scenario'): LlmProvider {
  const override = config.tasks?.[task];
  if (!override) return createLlmProvider(config);

  return createLlmProvider({
    ...config,
    provider: override.provider ?? config.provider,
    model: override.model ?? config.model,
    apiKeyEnv: override.apiKeyEnv ?? config.apiKeyEnv,
  });
}

function stripCodeFence(raw: string): string {
  return raw.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
}
