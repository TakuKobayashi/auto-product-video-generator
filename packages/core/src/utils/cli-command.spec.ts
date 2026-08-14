import { describe, expect, it } from 'vitest';
import { isSafeCliCommand } from './cli-command.js';

describe('isSafeCliCommand', () => {
  it('allows finite read-only discovery commands', () => {
    expect(isSafeCliCommand('pnpm apvg video --help')).toBe(true);
    expect(isSafeCliCommand('apvg --version')).toBe(true);
  });

  it('requires an explicit opt-in for commands with side effects', () => {
    expect(isSafeCliCommand('demo inspect', ['demo inspect'])).toBe(true);
    expect(isSafeCliCommand('demo inspect')).toBe(false);
  });

  it('rejects denied and compound shell commands', () => {
    expect(isSafeCliCommand('npm publish', ['npm publish'], ['publish'])).toBe(false);
    expect(isSafeCliCommand('apvg --help; env')).toBe(false);
  });
});
