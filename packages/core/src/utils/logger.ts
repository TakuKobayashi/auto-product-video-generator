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
