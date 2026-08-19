import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const NON_SOURCE_EXTENSIONS = [
  // Archives, installers, and distributable packages
  '7z',
  'aab',
  'apk',
  'appimage',
  'bz2',
  'cab',
  'dmg',
  'gz',
  'ipa',
  'iso',
  'rar',
  'tar',
  'tgz',
  'unitypackage',
  'xz',
  'zip',
  // Compiled executables and libraries
  'a',
  'class',
  'dll',
  'dylib',
  'elf',
  'exe',
  'jar',
  'lib',
  'o',
  'pyc',
  'so',
  'wasm',
  'war',
  // Fonts and binary documents
  'doc',
  'docx',
  'eot',
  'odg',
  'odp',
  'ods',
  'odt',
  'otf',
  'pdf',
  'ppt',
  'pptx',
  'ttf',
  'woff',
  'woff2',
  'xls',
  'xlsb',
  'xlsx',
  // Databases, datasets, and serialized data
  'arrow',
  'db',
  'feather',
  'h5',
  'hdf5',
  'mdb',
  'npy',
  'npz',
  'parquet',
  'pickle',
  'pkl',
  'sqlite',
  'sqlite3',
  // Machine-learning models and weights
  'bin',
  'ckpt',
  'gguf',
  'mlmodel',
  'onnx',
  'pb',
  'pt',
  'pth',
  'safetensors',
  'tflite',
  // Game-engine bundles, generated metadata, and credential containers
  'assetbundle',
  'jks',
  'keystore',
  'map',
  'p12',
  'pak',
  'pfx',
  'uasset',
  'umap',
  'unity3d',
];

export const DEFAULT_SOURCE_EXCLUDES = [
  '.git/**',
  'node_modules/**',
  '.apvg/**',
  'dist/**',
  'build/**',
  '.next/**',
  'out/**',
  '.output/**',
  '.turbo/**',
  '.vercel/**',
  'coverage/**',
  '.cache/**',
  'output/**',
  'artifacts/**',
  'recordings/**',
  'screenshots/**',
  ...NON_SOURCE_EXTENSIONS.map((extension) => `**/*.${extension}`),
];

/** Root .gitignore rules plus APVG/config rules, in matching precedence order. */
export async function loadSourceExcludePatterns(
  repositoryRoot: string,
  configured: string[] = []
): Promise<string[]> {
  const gitignore = join(repositoryRoot, '.gitignore');
  let repositoryRules: string[] = [];
  if (existsSync(gitignore)) {
    repositoryRules = (await readFile(gitignore, 'utf8'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  }
  return [...DEFAULT_SOURCE_EXCLUDES, ...repositoryRules, ...configured];
}

export function isSourcePathExcluded(path: string, patterns: string[]): boolean {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  let excluded = false;
  for (const raw of patterns) {
    const negated = raw.startsWith('!');
    const pattern = (negated ? raw.slice(1) : raw).replace(/^\//, '').replace(/\/$/, '/**');
    if (globMatches(normalized, pattern)) excluded = !negated;
  }
  return excluded;
}

function globMatches(path: string, pattern: string): boolean {
  if (!pattern) return false;
  const hasSlash = pattern.includes('/');
  const expression = globToRegExp(pattern);
  if (expression.test(path)) return true;
  if (!hasSlash) return path.split('/').some((segment) => expression.test(segment));
  return false;
}

function globToRegExp(glob: string): RegExp {
  let source = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      if (glob[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${source}(?:/.*)?$`);
}
