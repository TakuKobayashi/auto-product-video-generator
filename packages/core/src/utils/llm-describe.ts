import { LlmConfig } from '../types/config.js';

/**
 * Human-readable "provider/model" string for what createLlmProviderForTask
 * (in @demo-video-gen/ai) will actually use for the given task, accounting
 * for `llm.tasks.<task>` overrides. Used purely for CLI log lines so what's
 * printed matches what's really called.
 */
export function describeTaskLlm(config: LlmConfig, task: 'analyze' | 'scenario'): string {
  const override = config.tasks?.[task];
  const provider = override?.provider ?? config.provider;
  const model = override?.model ?? config.model;
  const overridden = override?.provider || override?.model ? ' (task override)' : '';
  return `${provider}/${model}${overridden}`;
}
