// Shared between scripts/install-ollama.mjs and scripts/serve.mjs so the
// "which model runs on which profile" decision lives in exactly one place.
//
// Profile "local"  — a dev machine such as:
//   AMD Ryzen 7 5800H / 64GB RAM / RTX 3050 Ti Laptop (4GB VRAM)
//   Ollama offloads as many layers as fit in the 4GB of VRAM and runs the
//   rest on CPU; with 64GB of system RAM this is not a bottleneck.
//
// Profile "ci"     — GitHub Actions hosted runners (ubuntu-latest):
//   2-core CPU, ~7GB RAM, no GPU. A 7B model is too slow/heavy to pull and
//   run within a typical job, so CI uses a smaller model in the same
//   family/instruction-tuning style to keep behavior as close as possible.
//
// Both models are Qwen2.5-Instruct, chosen because it follows JSON-schema
// instructions reliably (critical for the `analyze` / `scenario generate`
// pipelines, which require strict JSON output) and has small/well-tested
// GGUF quantizations available directly from the Ollama library.

export const MODEL_PROFILES = {
  local: {
    model: 'qwen2.5:7b-instruct',
    description: '7B params, ~4.7GB (Q4_K_M) — good quality, fits RTX 3050 Ti (4GB VRAM) with partial GPU offload',
  },
  ci: {
    model: 'qwen2.5:3b-instruct',
    description: '3B params, ~1.9GB (Q4_K_M) — CPU-only friendly, fits GitHub Actions runners within job time limits',
  },
};

export function resolveModel(profile, override) {
  if (override) return override;
  const entry = MODEL_PROFILES[profile];
  if (!entry) {
    throw new Error(
      `Unknown profile "${profile}". Expected one of: ${Object.keys(MODEL_PROFILES).join(', ')}`,
    );
  }
  return entry.model;
}
