import { describe, expect, it } from 'vitest';
import { isConcreteWebRoute } from './web-route.js';

describe('isConcreteWebRoute', () => {
  it('accepts directly navigable paths', () => {
    expect(isConcreteWebRoute('/')).toBe(true);
    expect(isConcreteWebRoute('/en/blog')).toBe(true);
  });

  it('rejects route templates', () => {
    expect(isConcreteWebRoute('/en/blog/[slug]')).toBe(false);
    expect(isConcreteWebRoute('/docs/[...parts]')).toBe(false);
    expect(isConcreteWebRoute('/users/:id')).toBe(false);
    expect(isConcreteWebRoute('/files/*')).toBe(false);
  });
});
