import { describe, it, expect } from 'vitest';
import { LENSES, LENS_ORDER, boostedPower, lensOf } from '../src/core/lenses';

describe('snap lenses', () => {
  it('cost more and boost more as you go up the list', () => {
    const l = LENS_ORDER.map((id) => LENSES[id]);
    for (let i = 1; i < l.length; i++) { expect(l[i].price).toBeGreaterThan(l[i - 1].price); expect(l[i].power).toBeGreaterThan(l[i - 1].power); }
    expect(LENSES.ripple.price).toBe(0);
  });
  it('adds the bonus and caps Snap Power at 100', () => {
    expect(boostedPower(60, 'ember')).toBe(70);
    expect(boostedPower(94, 'phantom')).toBe(100);
    expect(boostedPower(50, 'nope')).toBe(50);
    expect(lensOf(undefined).id).toBe('ripple');
  });
});
