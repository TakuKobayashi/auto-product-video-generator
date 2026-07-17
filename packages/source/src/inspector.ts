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
  /**
   * Deterministic, file-based signals for what platform this project targets
   * (e.g. "Podfile found (iOS/CocoaPods)"). Passed to the AI as grounding
   * for its platform classification — see
   * @demo-video-gen/ai's platform-classifier.ts. Not authoritative by
   * itself (a project could have stray files from an unrelated tool), just
   * strong evidence.
   */
  platformHints: string[];
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

  const deps = new Set([...(packageJson?.dependencies ?? []), ...(packageJson?.devDependencies ?? [])]);
  const looksLikeNextProject = deps.has('next') || existsSync(join(rootDir, 'next.config.js')) || existsSync(join(rootDir, 'next.config.mjs')) || existsSync(join(rootDir, 'next.config.ts'));

  // Directory presence alone isn't enough evidence — an "app/" (or "pages/")
  // directory can exist for unrelated reasons (e.g. an Android project's
  // app/ module). Only trust it if this actually looks like a Next.js
  // project (an explicit dependency/config file), or if we find real
  // page.* route files inside it.
  const appRouterDir = looksLikeNextProject ? await findFirst(rootDir, ['app', 'src/app']) : null;
  const pagesRouterDir = looksLikeNextProject ? await findFirst(rootDir, ['pages', 'src/pages']) : null;

  let framework: DetectedFramework = 'unknown';
  let routes: RouteInfo[] = [];

  if (appRouterDir) {
    const found = await discoverNextAppRoutes(rootDir, appRouterDir);
    if (found.length > 0 || looksLikeNextProject) {
      framework = 'nextjs-app-router';
      routes = found;
    }
  } else if (pagesRouterDir) {
    const found = await discoverNextPagesRoutes(rootDir, pagesRouterDir);
    if (found.length > 0 || looksLikeNextProject) {
      framework = 'nextjs-pages-router';
      routes = found;
    }
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
  const platformHints = await detectPlatformHints(rootDir, packageJson, deps);

  logger.success(
    `Detected: ${framework}` +
    (routes.length > 0 ? `, ${routes.length} route(s) discovered` : ', no routes auto-discovered') +
    (platformHints.length > 0 ? `; platform hints: ${platformHints.length}` : ''),
  );

  return { rootDir, packageJson, readme, framework, routes, fileTree, platformHints };
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

/**
 * Cheap, top-level(ish) file existence checks for common non-web platform
 * markers. Deliberately shallow (a handful of readdir/existsSync calls, not
 * a deep walk) since this only needs to produce *hints* — the AI makes the
 * final call, grounded by these plus package.json/README.
 *
 * To recognize a new platform: add a check here that pushes a short,
 * human-readable hint string, and add the platform itself to
 * ProjectPlatformSchema in packages/core/src/types/config.ts.
 */
async function detectPlatformHints(
  rootDir: string,
  packageJson: PackageJsonSummary | null,
  deps: Set<string>,
): Promise<string[]> {
  const hints: string[] = [];

  let topLevel: string[] = [];
  try {
    topLevel = (await readdir(rootDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() || e.isFile())
      .map((e) => e.name);
  } catch {
    /* ignore */
  }

  // iOS (Xcode / Swift)
  if (topLevel.some((n) => n.endsWith('.xcodeproj'))) hints.push('*.xcodeproj found (iOS/macOS, Xcode)');
  if (topLevel.some((n) => n.endsWith('.xcworkspace'))) hints.push('*.xcworkspace found (iOS/macOS, Xcode)');
  if (topLevel.includes('Podfile')) hints.push('Podfile found (iOS, CocoaPods)');
  if (topLevel.includes('Package.swift')) hints.push('Package.swift found (Swift Package Manager)');

  // Android (Gradle)
  if (topLevel.includes('build.gradle') || topLevel.includes('build.gradle.kts')) {
    hints.push('build.gradle(.kts) found (Android, Gradle)');
  }
  if (topLevel.includes('settings.gradle') || topLevel.includes('settings.gradle.kts')) {
    hints.push('settings.gradle(.kts) found (Android, Gradle)');
  }
  if (existsSync(join(rootDir, 'app', 'src', 'main', 'AndroidManifest.xml'))) {
    hints.push('app/src/main/AndroidManifest.xml found (Android)');
  }

  // Unity
  if (existsSync(join(rootDir, 'ProjectSettings', 'ProjectVersion.txt'))) {
    hints.push('ProjectSettings/ProjectVersion.txt found (Unity)');
  }
  if (topLevel.includes('Assets') && topLevel.includes('ProjectSettings')) {
    hints.push('Assets/ + ProjectSettings/ found (Unity)');
  }

  // Flutter
  if (topLevel.includes('pubspec.yaml')) hints.push('pubspec.yaml found (Flutter/Dart)');

  // React Native (package.json-based; often also has ios/ and android/ dirs)
  if (deps.has('react-native')) hints.push('package.json depends on react-native');
  if (topLevel.includes('ios') && topLevel.includes('android') && packageJson) {
    hints.push('ios/ and android/ directories alongside package.json (likely React Native or similar)');
  }

  // Desktop (Electron / Tauri)
  if (deps.has('electron')) hints.push('package.json depends on electron');
  if (deps.has('@tauri-apps/cli') || topLevel.includes('src-tauri')) hints.push('Tauri project (src-tauri/ or @tauri-apps/cli dependency)');

  return hints;
}
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
