import { ProjectPlatform } from '@demo-video-gen/core';

/**
 * One-line description of each recognized platform, shown to the LLM as its
 * classification options. This is the single place to edit when adding
 * support for a new platform:
 *
 *   1. Add the new value to ProjectPlatformSchema in
 *      packages/core/src/types/config.ts
 *   2. Add a description for it here
 *   3. (Recommended) add a deterministic file-based hint for it in
 *      detectPlatformHints(), packages/source/src/inspector.ts
 *
 * No other code changes are required — analyzer.ts and scenario-generator.ts
 * both just read `platform` off whatever this prompt returns.
 */
export const PLATFORM_DESCRIPTIONS: Record<ProjectPlatform, string> = {
  web: 'A website or web application (Next.js, React, Vue, Nuxt, SvelteKit, plain HTML/JS, etc.) — navigable via a browser URL. This is the only platform demo-video-gen can currently record automatically (via Playwright).',
  ios: 'A native iOS (or macOS) app — Swift/SwiftUI/UIKit, an Xcode project/workspace, CocoaPods (Podfile), or Swift Package Manager.',
  android: 'A native Android app — Kotlin or Java, a Gradle build (build.gradle/build.gradle.kts), AndroidManifest.xml.',
  unity: 'A Unity game or interactive app — has Assets/ and ProjectSettings/ directories, .unity scene files.',
  flutter: 'A Flutter app (Dart) — has pubspec.yaml and a lib/ directory; typically targets iOS/Android/web from one codebase.',
  'react-native': 'A React Native app — package.json depends on "react-native", usually alongside ios/ and android/ native project folders.',
  desktop: 'A desktop application — e.g. Electron (depends on "electron") or Tauri (src-tauri/ or "@tauri-apps/cli").',
  other: "Doesn't clearly fit any of the categories above (a CLI tool, a library with no UI, an unfamiliar framework, etc.).",
};

/**
 * Builds the platform-classification section of the analysis prompt. Kept
 * as its own function (rather than inlined into the main analyzer prompt)
 * so it's a single, obvious place to extend — see PLATFORM_DESCRIPTIONS
 * above.
 */
export function buildPlatformClassificationPrompt(platformHints: string[]): string {
  const optionsList = (Object.entries(PLATFORM_DESCRIPTIONS) as [ProjectPlatform, string][])
    .map(([key, desc]) => `- "${key}": ${desc}`)
    .join('\n');

  const hintsList =
    platformHints.length > 0
      ? platformHints.map((h) => `- ${h}`).join('\n')
      : '- (no platform-specific files detected; classify from package.json/README/file listing instead)';

  return `## Platform classification

Classify this project's platform as exactly one of the following (use the quoted key
as the "platform" field's value):
${optionsList}

Deterministic file-based signals found in the project:
${hintsList}

Trust the deterministic signals above when present — they come from actually finding
matching files (Podfile, build.gradle, pubspec.yaml, etc.), not guesswork. Only fall
back to inferring from package.json/README when no signals were found.`;
}
