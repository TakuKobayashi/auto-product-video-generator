const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function c(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

export const logger = {
  info: (msg: string) => console.log(`${c('blue', '●')} ${msg}`),
  success: (msg: string) => console.log(`${c('green', '✓')} ${msg}`),
  warn: (msg: string) => console.warn(`${c('yellow', '⚠')} ${msg}`),
  error: (msg: string) => console.error(`${c('red', '✗')} ${msg}`),
  step: (step: string, msg: string) => console.log(`${c('cyan', `[${step}]`)} ${msg}`),
  dim: (msg: string) => console.log(c('gray', msg)),
  dryRun: (msg: string) => console.log(`${c('yellow', '[dry-run]')} ${c('dim', msg)}`),
  header: (msg: string) => {
    const line = '─'.repeat(msg.length + 4);
    console.log();
    console.log(c('bold', `  ${line}`));
    console.log(c('bold', `  │ ${msg} │`));
    console.log(c('bold', `  ${line}`));
    console.log();
  },
};

/**
 * Runs a (potentially slow — LLM calls, network, etc.) promise while
 * printing a periodic "still working" heartbeat, so long silent pauses
 * don't look like the CLI has frozen. Purely cosmetic — doesn't affect the
 * result or timing of `work`.
 */
export async function withHeartbeat<T>(
  label: string,
  work: Promise<T>,
  intervalMs = 8000,
): Promise<T> {
  const start = Date.now();
  const timer = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000);
    logger.dim(`  ... still working on ${label} (${elapsed}s elapsed)`);
  }, intervalMs);

  try {
    return await work;
  } finally {
    clearInterval(timer);
  }
}

/**
 * Turns an unknown thrown value into a readable single-line-friendly
 * message. In particular, formats a raw Zod validation error (issues array)
 * as a short bullet list instead of a giant JSON dump — a safety net for
 * any zod .parse() call that wasn't already wrapped with a nicer message.
 */
export function formatUnknownError(err: unknown): string {
  if (isZodErrorLike(err)) {
    return err.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

interface ZodIssueLike {
  path: (string | number)[];
  message: string;
}

function isZodErrorLike(err: unknown): err is { issues: ZodIssueLike[] } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'issues' in err &&
    Array.isArray((err as { issues: unknown }).issues)
  );
}
