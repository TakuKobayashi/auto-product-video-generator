import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const required = ['APVG_CONFIG', 'APVG_MODEL', 'APVG_OUTPUT_DIR'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const packageRoot = process.env.APVG_PACKAGE_ROOT || process.cwd();
const require = createRequire(`${packageRoot}/package.json`);
const yaml = require('js-yaml');
const configPath = process.env.APVG_CONFIG;
const config = yaml.load(await readFile(configPath, 'utf8'));

config.llm.provider = 'ollama';
config.llm.model = process.env.APVG_MODEL;
config.llm.fallbackProvider = 'ollama';
config.llm.fallbackModel = process.env.APVG_MODEL;
for (const task of Object.values(config.llm.tasks || {})) {
  task.provider = 'ollama';
  task.model = process.env.APVG_MODEL;
}
if (process.env.APVG_VOICEVOX_SPEAKER) {
  config.voicevox.speakerId = Number(process.env.APVG_VOICEVOX_SPEAKER);
}
config.output.workDir = process.env.APVG_WORK_DIR || `${configPath}.work`;
config.output.dir = process.env.APVG_OUTPUT_DIR;

await writeFile(configPath, yaml.dump(config, { noRefs: true, lineWidth: 120 }), 'utf8');
