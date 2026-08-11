import { describe, expect, it } from 'vitest';
import { ActionSchema } from './scenario.js';

describe('device actions', () => {
  it('accepts Android actions used by generated scenarios', () => {
    expect(ActionSchema.parse({ type: 'launch_app' })).toEqual({ type: 'launch_app' });
    expect(ActionSchema.parse({ type: 'tap', text: 'はじめる' })).toMatchObject({ type: 'tap' });
    expect(ActionSchema.parse({
      type: 'swipe', fromX: 540, fromY: 1500, toX: 540, toY: 500,
    })).toMatchObject({ type: 'swipe', durationMs: 400 });
  });

  it('rejects an unlocatable tap', () => {
    expect(() => ActionSchema.parse({ type: 'tap' })).toThrow(/tap requires/);
  });
});
