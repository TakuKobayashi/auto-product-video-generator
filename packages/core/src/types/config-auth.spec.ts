import { describe, expect, it } from 'vitest';
import { ApvgConfigSchema } from './config.js';

function configWithAuth(auth: Record<string, unknown>) {
  return {
    project: { name: 'Authenticated app' },
    source: { localPath: '.' },
    target: { url: 'https://example.com', type: 'web', auth },
  };
}

describe('web authentication config', () => {
  it('applies secure manual-login defaults', () => {
    const config = ApvgConfigSchema.parse(configWithAuth({}));

    expect(config.target.auth).toEqual({
      mode: 'manual',
      storageStatePath: './.apvg/auth/storage-state.json',
    });
  });

  it('accepts login and success URLs without storing credentials', () => {
    const config = ApvgConfigSchema.parse(configWithAuth({
      loginUrl: 'https://example.com/login',
      successUrl: 'https://example.com/dashboard',
      storageStatePath: './.apvg/auth/example.json',
    }));

    expect(config.target.auth?.loginUrl).toBe('https://example.com/login');
    expect(config.target.auth?.successUrl).toBe('https://example.com/dashboard');
  });
});
