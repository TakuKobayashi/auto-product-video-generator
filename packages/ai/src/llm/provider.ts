import { LlmConfig } from '@demo-video-gen/core';

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
    const cleaned = raw.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
    return JSON.parse(cleaned) as T;
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

export class OllamaProvider implements LlmProvider {
  constructor(private model: string, private host: string = 'http://localhost:11434') {}

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const body = {
      model: this.model,
      prompt,
      system: systemPrompt,
      stream: false,
    };
    const res = await fetch(`${this.host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Ollama request failed: ${res.status}`);
    const data = (await res.json()) as { response: string };
    return data.response;
  }

  async generateJson<T>(prompt: string, systemPrompt?: string): Promise<T> {
    const raw = await this.generate(prompt, systemPrompt);
    const cleaned = raw.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
    return JSON.parse(cleaned) as T;
  }
}

// --- Factory ---

export function createLlmProvider(config: LlmConfig): LlmProvider {
  const getKey = (envName: string) => {
    const key = process.env[envName];
    if (!key) throw new Error(`Environment variable ${envName} is not set.`);
    return key;
  };

  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config.model, getKey(config.apiKeyEnv ?? 'GEMINI_API_KEY'));
    case 'openai':
      return new OpenAIProvider(config.model, getKey(config.apiKeyEnv ?? 'OPENAI_API_KEY'));
    case 'claude':
      return new ClaudeProvider(config.model, getKey(config.apiKeyEnv ?? 'ANTHROPIC_API_KEY'));
    case 'groq':
      return new GroqProvider(config.model, getKey(config.apiKeyEnv ?? 'GROQ_API_KEY'));
    case 'ollama':
      return new OllamaProvider(config.model, process.env['OLLAMA_HOST']);
    default:
      throw new Error(`Unknown LLM provider: ${(config as LlmConfig).provider}`);
  }
}
