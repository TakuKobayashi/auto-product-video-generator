import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmConfigSchema } from '@auto-product-video-generator/core';
import { createLlmProviderForTask, OllamaProvider } from './provider.js';

afterEach(() => vi.unstubAllGlobals());

describe('OllamaProvider structured output', () => {
  it('sends the JSON Schema and deterministic temperature to Ollama', async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          `${JSON.stringify({ response: '{"description":"Demo"}', done: true })}\n`,
          { status: 200, headers: { 'content-type': 'application/x-ndjson' } }
        );
      })
    );
    const schema = {
      type: 'object',
      required: ['description'],
      properties: { description: { type: 'string' } },
    };

    const result = await new OllamaProvider('test-model').generateJson<{ description: string }>(
      'prompt',
      'system',
      schema
    );

    expect(result).toEqual({ description: 'Demo' });
    expect(requestBody?.format).toEqual(schema);
    expect(requestBody?.options).toEqual({ temperature: 0, num_ctx: 16384 });
  });

  it('keeps a configured context length when selecting a task model', async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response('{"response":"{}","done":true}\n');
      })
    );
    const config = LlmConfigSchema.parse({
      provider: 'ollama',
      model: 'default-model',
      ollamaContextLength: 8192,
      tasks: { analyze: { model: 'analysis-model' } },
    });
    await createLlmProviderForTask(config, 'analyze').generateJson('prompt');
    expect(requestBody?.model).toBe('analysis-model');
    expect(requestBody?.options).toEqual({ temperature: 0, num_ctx: 8192 });
  });
});
