import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { logger } from '@demo-video-gen/core';

export interface RouteInfo {
  /** URL path, e.g. "/dashboard/settings" or "/posts/[id]" */
  path: string;
  /** Source file this route was discovered from, relative to the project root. */
  file: string;
}

export interface PackageJsonSummary {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: string[];
  devDependencies?: string[];
}

export type DetectedFramework =
  | 'nextjs-app-router'
  | 'nextjs-pages-router'
  | 'vite'
  | 'create-react-app'
  | 'vue'
  | 'nuxt'
  | 'sveltekit'
  | 'unknown';

export interface ProjectSourceContext {
  rootDir: string;
  packageJson: PackageJsonSummary | null;
  readme: string | null;
  framework: DetectedFramework;
  routes: RouteInfo[];
  /** A capped, filtered listing of source files for extra AI context when no routes were discoverable. */
  fileTree: string[];
}

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out', '.turbo',
  '.vercel', 'coverage', '.cache', '.dvg', '.output',
]);

const MAX_README_CHARS = 4000;
const MAX_FILE_TREE_ENTRIES = 200;
const MAX_WALK_DEPTH = 6;

export async function inspectProject(rootDir: string): Promise<ProjectSourceContext> {
  logger.step('source', `Inspecting project at ${rootDir}...`);

  const packageJson = await readPackageJson(rootDir);
  const readme = await readReadme(rootDir);

  const appRouterDir = await findFirst(rootDir, ['app', 'src/app']);
  const pagesRouterDir = await findFirst(rootDir, ['pages', 'src/pages']);

  let framework: DetectedFramework = 'unknown';
  let routes: RouteInfo[] = [];

  const deps = new Set([...(packageJson?.dependencies ?? []), ...(packageJson?.devDependencies ?? [])]);

  if (appRouterDir) {
    framework = 'nextjs-app-router';
    routes = await discoverNextAppRoutes(rootDir, appRouterDir);
  } else if (pagesRouterDir) {
    framework = 'nextjs-pages-router';
    routes = await discoverNextPagesRoutes(rootDir, pagesRouterDir);
  } else if (deps.has('nuxt')) {
    framework = 'nuxt';
  } else if (deps.has('@sveltejs/kit')) {
    framework = 'sveltekit';
  } else if (deps.has('vue')) {
    framework = 'vue';
  } else if (deps.has('vite')) {
    framework = 'vite';
  } else if (deps.has('react-scripts')) {
    framework = 'create-react-app';
  }

  const fileTree = routes.length === 0 ? await buildFileTree(rootDir) : [];

  logger.success(
    `Detected: ${framework}` +
    (routes.length > 0 ? `, ${routes.length} route(s) discovered` : ', no routes auto-discovered'),
  );

  return { rootDir, packageJson, readme, framework, routes, fileTree };
}

async function readPackageJson(rootDir: string): Promise<PackageJsonSummary | null> {
  const path = join(rootDir, 'package.json');
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf-8');
    const data = JSON.parse(raw) as {
      name?: string;
      description?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      name: data.name,
      description: data.description,
      scripts: data.scripts,
      dependencies: Object.keys(data.dependencies ?? {}),
      devDependencies: Object.keys(data.devDependencies ?? {}),
    };
  } catch {
    return null;
  }
}

async function readReadme(rootDir: string): Promise<string | null> {
  const candidates = ['README.md', 'README.MD', 'Readme.md', 'readme.md'];
  for (const name of candidates) {
    const path = join(rootDir, name);
    if (existsSync(path)) {
      const raw = await readFile(path, 'utf-8');
      return raw.length > MAX_README_CHARS ? raw.slice(0, MAX_README_CHARS) + '\n...(truncated)' : raw;
    }
  }
  return null;
}

async function findFirst(rootDir: string, candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    const path = join(rootDir, candidate);
    if (existsSync(path)) return candidate;
  }
  return null;
}

const PAGE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js'];

/** Next.js App Router: app/dashboard/settings/page.tsx -> /dashboard/settings */
async function discoverNextAppRoutes(rootDir: string, appRelDir: string): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  const absAppDir = join(rootDir, appRelDir);

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name) || entry.name === 'api') continue;
        await walk(join(dir, entry.name));
        continue;
      }

      const base = entry.name.replace(/\.(tsx|jsx|ts|js)$/, '');
      if (base !== 'page') continue;

      const relFromApp = relative(absAppDir, dir).split(sep).filter(Boolean);
      // Route groups like "(marketing)" don't appear in the URL.
      const segments = relFromApp.filter((s) => !(s.startsWith('(') && s.endsWith(')')));
      const urlPath = '/' + segments.join('/');

      routes.push({
        path: urlPath === '/' ? '/' : urlPath.replace(/\/$/, ''),
        file: relative(rootDir, join(dir, entry.name)),
      });
    }
  }

  await walk(absAppDir);
  return routes;
}

/** Next.js Pages Router: pages/posts/[id].tsx -> /posts/[id] */
async function discoverNextPagesRoutes(rootDir: string, pagesRelDir: string): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  const absPagesDir = join(rootDir, pagesRelDir);
  const skipNames = new Set(['_app', '_document', '_error', '404', '500']);

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name) || entry.name === 'api') continue;
        await walk(join(dir, entry.name));
        continue;
      }

      const ext = PAGE_EXTENSIONS.find((e) => entry.name.endsWith(e));
      if (!ext) continue;

      const base = entry.name.slice(0, -ext.length);
      if (skipNames.has(base)) continue;

      const relFromPages = relative(absPagesDir, dir).split(sep).filter(Boolean);
      const nameSegment = base === 'index' ? [] : [base];
      const segments = [...relFromPages, ...nameSegment];
      const urlPath = '/' + segments.join('/');

      routes.push({
        path: urlPath === '/' ? '/' : urlPath,
        file: relative(rootDir, join(dir, entry.name)),
      });
    }
  }

  await walk(absPagesDir);
  return routes;
}

/** Generic fallback when no framework-specific routes could be discovered. */
async function buildFileTree(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_WALK_DEPTH || results.length >= MAX_FILE_TREE_ENTRIES) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_FILE_TREE_ENTRIES) return;
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        await walk(join(dir, entry.name), depth + 1);
      } else {
        results.push(relative(rootDir, join(dir, entry.name)));
      }
    }
  }

  await walk(rootDir, 0);
  return results;
}
