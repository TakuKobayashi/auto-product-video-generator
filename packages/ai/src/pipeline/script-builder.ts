import { Scenario, Script, ScriptScene, logger } from '@demo-video-gen/core';

/**
 * Builds script.yaml deterministically from an already-generated
 * scenario.yaml, instead of asking the LLM to produce both in one call.
 *
 * Previously the LLM had to emit `scenario.scenes[].narration` AND
 * `script.scenes[].narration` (the same text, twice) plus made-up
 * startTime/endTime — a lot of redundant, easy-to-get-wrong JSON surface
 * for smaller/local models especially. Since the narration text already
 * lives on each scene in scenario.yaml, and timing is just "how long does
 * this text take to say out loud", there's no reason for the LLM to
 * regenerate any of this — it's a pure calculation.
 */
export function buildScriptFromScenario(scenario: Scenario): Script {
  let cursor = 0;
  const gapSeconds = 0.5; // brief pause between scenes

  const scenes: ScriptScene[] = scenario.scenes.map((scene) => {
    const duration = estimateNarrationSeconds(scene.narration, scenario.meta.language);
    const startTime = round1(cursor);
    const endTime = round1(cursor + duration);
    cursor = endTime + gapSeconds;

    return {
      id: scene.id,
      narration: scene.narration,
      startTime,
      endTime,
      voiceFile: `voice/scene-${scene.id}.wav`,
    };
  });

  logger.step('script', `Derived timing for ${scenes.length} scene(s) from narration length (no LLM call).`);
  return { scenes };
}

/**
 * Rough narration-length estimate. Japanese is character-paced (~6-7
 * chars/sec for narration-style speech); other languages are word-paced
 * (~2.5 words/sec). Good enough for scene timing — not meant to be exact,
 * and the whole point is it's cheap/deterministic rather than another LLM
 * round-trip. Edit script.yaml by hand afterward for anything that needs
 * to be precise.
 */
function estimateNarrationSeconds(text: string, language: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 1.5;

  const seconds = language.startsWith('ja')
    ? trimmed.length / 6
    : trimmed.split(/\s+/).filter(Boolean).length / 2.5;

  return Math.max(1.5, seconds);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
