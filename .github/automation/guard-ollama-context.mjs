import { readFile } from 'node:fs/promises';

const logPath = process.argv[2] || 'ollama.log';
const log = await readFile(logPath, 'utf8');
const truncations = log.split(/\r?\n/).filter((line) => line.includes('truncating input prompt'));
if (truncations.length > 0) {
  for (const line of truncations) console.error(line);
  console.error(
    '::error::Ollama discarded part of the source/prompt. Increase llm.ollamaContextLength or reduce the input before generating a video.'
  );
  process.exitCode = 1;
}
