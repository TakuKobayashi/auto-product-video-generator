import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as yaml from 'js-yaml';
import { DvgConfig, DvgConfigSchema } from '../types/config.js';

export async function loadConfig(configPath: string): Promise<DvgConfig> {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}\nRun 'demo-video-gen init' first.`);
  }
  const raw = await readFile(configPath, 'utf-8');
  const parsed = yaml.load(raw);
  return DvgConfigSchema.parse(parsed);
}

export async function saveConfig(configPath: string, config: DvgConfig): Promise<void> {
  const content = yaml.dump(config, { lineWidth: 120, quotingType: '"' });
  await writeFile(configPath, content, 'utf-8');
}

export function createDefaultConfig(name: string, url: string): DvgConfig {
  return DvgConfigSchema.parse({
    project: { name, description: '' },
    target: { url, type: 'web' },
    video: {},
    llm: {},
    voicevox: {},
    output: {},
  });
}
