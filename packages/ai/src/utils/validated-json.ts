import { ZodError, ZodIssue } from 'zod';
import { logger } from '@demo-video-gen/core';
import { LlmProvider } from '../llm/provider.js';

/**
 * Minimal structural type for "something with a zod-like safeParse method".
 * We deliberately don't use zod's own `ZodType<T>` here: it has extra
 * `Def`/`Input` type parameters that default to invariant matches against
 * `T`, which breaks for any schema using `.default(...)` (Input becomes
 * `T-with-that-field-optional`, which then fails to satisfy `ZodType<T>`).
 * All we actually need is `.safeParse()`.
 */
interface ParseableSchema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: ZodError };
}

/**
 * Calls `llm.generateJson()` and validates the result against `schema`. LLMs
 * (especially smaller local models) sometimes produce JSON that's *almost*
 * right — wrong field name, a number where a string was expected, a missing
 * required field. Rather than failing immediately, we feed the exact
 * validation errors back to the model and ask it to correct them, up to
 * `maxRetries` times, before giving up with a clear error.
 */
export async function generateValidatedJson<T>(
  llm: LlmProvider,
  schema: ParseableSchema<T>,
  prompt: string,
  systemPrompt: string,
  options: { label: string; maxRetries?: number } = { label: 'response' },
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  let lastErrorText = '';
  let lastRawText = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const effectivePrompt =
      attempt === 0
        ? prompt
        : `${prompt}\n\n---\nYour previous response failed JSON schema validation with these errors:\n${lastErrorText}\n\nHere was your previous (invalid) response:\n${lastRawText}\n\nFix ONLY what's wrong and respond with the corrected, complete JSON. JSON only, no markdown, no explanation.`;

    let raw: unknown;
    try {
      raw = await llm.generateJson<unknown>(effectivePrompt, systemPrompt);
    } catch (err) {
      // A parse error (invalid JSON syntax) or transport error — same retry
      // treatment, but we don't have a "previous response" to show back.
      lastErrorText = (err as Error).message;
      lastRawText = '(no valid JSON was returned)';
      logger.warn(
        `[${options.label}] LLM call failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastErrorText}`,
      );
      if (attempt === maxRetries) throw err;
      continue;
    }

    const result = schema.safeParse(raw);
    if (result.success) {
      if (attempt > 0) logger.success(`[${options.label}] Corrected on retry ${attempt}.`);
      return result.data;
    }

    lastErrorText = formatZodError(result.error);
    lastRawText = JSON.stringify(raw, null, 2).slice(0, 4000);
    logger.warn(
      `[${options.label}] LLM output failed schema validation (attempt ${attempt + 1}/${maxRetries + 1}):`,
    );
    for (const line of lastErrorText.split('\n')) logger.warn(`  ${line}`);

    if (attempt < maxRetries) {
      logger.info(`[${options.label}] Asking the LLM to correct it...`);
    }
  }

  throw new Error(
    `${options.label}: LLM failed to produce valid JSON after ${maxRetries + 1} attempt(s).\n${lastErrorText}`,
  );
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue: ZodIssue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}
