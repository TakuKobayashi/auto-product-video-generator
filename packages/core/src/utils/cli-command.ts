import { DEFAULT_CLI_DENIED_COMMAND_PATTERNS } from '../types/config.js';

const SHELL_CONTROL = /[;&|`$><\n\r]/;

/**
 * Keeps automatically generated CLI demos read-only and finite. Explicitly
 * allowed commands can do more, but shell control operators remain forbidden
 * and configured deny fragments always take precedence.
 */
export function isSafeCliCommand(
  command: string,
  allowedCommands: string[] = [],
  deniedPatterns: string[] = DEFAULT_CLI_DENIED_COMMAND_PATTERNS
): boolean {
  const normalized = command.trim().replace(/\s+/g, ' ');
  if (!normalized || SHELL_CONTROL.test(normalized)) return false;

  const lower = normalized.toLowerCase();
  const args = normalized.split(' ');
  const discoveryFlags = ['--help', '-h', '--version', '-v'];
  if (discoveryFlags.includes(args.at(-1)?.toLowerCase() || '')) return true;

  if (deniedPatterns.some((pattern) => lower.includes(pattern.toLowerCase()))) return false;
  return allowedCommands.includes(normalized);
}
