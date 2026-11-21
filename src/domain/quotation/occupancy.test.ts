import { describe, expect, it } from 'vitest';
import { categoryFit, categoryFits, fitHint, unfitSelected } from './occupancy.ts';

const ALL = ['quad', 'triple', 'twin', 'solo', 'child', 'sneak_in'] as const;

function allowed(adults: number, children = 0): string[] {
  return categoryFits(ALL, adults, children)
    .filter((fit) => fit.allowed)
    .map((fit) => fit.code);
}

// -----------------------------------------------------------------------------
// The supervisor's own examples, which are the specification.
// -----------------------------------------------------------------------------
describe('the supervisor examples', () => {
  it('2 travellers can only be twin', () => {
    expect(allowed(2)).toEqual(['twin', 'sneak_in']);
  });

  it('4 travellers can be quad, or twin as two rooms, but never solo', () => {
    expect(allowed(4)).toEqual(['quad', 'triple', 'twin', 'sneak_in']);
    expect(categoryFit('twin', 4, 0).rooms).toBe(2);
    expect(categoryFit('quad', 4, 0).rooms).toBe(1);
    expect(categoryFit('solo', 4, 0).allowed).toBe(false);
  });

  it('5 travellers open solo, because the fifth has nobody to share with', () => {
    expect(allowed(5)).toEqual(['quad', 'triple', 'twin', 'solo', 'sneak_in']);
    expect(categoryFit('solo', 5, 0).allowed).toBe(true);
  });
});

// -----------------------------------------------------------------------------
describe('room-based categories', () => {
  it.each([
    ['quad', 4],
    ['triple', 3],
    ['twin', 2],
  ])('%s needs at least %i travellers', (code, capacity) => {
    expect(categoryFit(code, capacity - 1, 0).allowed).toBe(false);
    expect(categoryFit(code, capacity, 0).allowed).toBe(true);
  });

  it('explains what is missing rather than just greying out', () => {
    const fit = categoryFit('quad', 2, 0);
    expect(fit.reason).toBe('Needs at least 4 travellers; this quotation has 2.');
  });

  it('says how many rooms when the party divides evenly', () => {
    expect(categoryFit('twin', 6, 0).rooms).toBe(3);
    expect(categoryFit('quad', 8, 0).rooms).toBe(2);
    expect(categoryFit('triple', 9, 0).rooms).toBe(3);
  });

  it('says nothing about rooms when it does not divide evenly', () => {
    expect(categoryFit('twin', 5, 0).rooms).toBeNull();
    expect(categoryFit('quad', 6, 0).rooms).toBeNull();
  });
});

// -----------------------------------------------------------------------------
describe('solo', () => {
  it('is open to a lone traveller', () => {
    expect(categoryFit('solo', 1, 0)).toMatchObject({ allowed: true, rooms: 1 });
  });

  it.each([3, 5, 7, 9])('is open for an odd party of %i', (adults) => {
    expect(categoryFit('solo', adults, 0).allowed).toBe(true);
  });

  it.each([2, 4, 6, 8])('is closed for an even party of %i', (adults) => {
    const fit = categoryFit('solo', adults, 0);
    expect(fit.allowed).toBe(false);
    expect(fit.reason).toContain('pair evenly');
  });

  it('is closed when there are no adults at all', () => {
    expect(categoryFit('solo', 0, 2).allowed).toBe(false);
  });
});

// -----------------------------------------------------------------------------
describe('child and sneak-in are counted per head, not per room', () => {
  it('child opens only when children are travelling', () => {
    expect(categoryFit('child', 2, 0).allowed).toBe(false);
    expect(categoryFit('child', 2, 1).allowed).toBe(true);
  });

  it('child says why it is closed', () => {
    expect(categoryFit('child', 2, 0).reason).toBe('No children on this quotation.');
  });

  it('sneak-in needs somebody to share with', () => {
    expect(categoryFit('sneak_in', 1, 0).allowed).toBe(true);
    expect(categoryFit('sneak_in', 0, 0).allowed).toBe(false);
  });

  it('neither reports a room count, since neither takes a room', () => {
    expect(categoryFit('child', 2, 1).rooms).toBeNull();
    expect(categoryFit('sneak_in', 2, 0).rooms).toBeNull();
  });
});

// -----------------------------------------------------------------------------
describe('unfitSelected', () => {
  it('flags a selection that no longer suits the party', () => {
    // Quoted for four as quad, then cut to two travellers.
    const unfit = unfitSelected(['quad', 'twin'], 2, 0);
    expect(unfit.map((fit) => fit.code)).toEqual(['quad']);
  });

  it('flags nothing when every selection still fits', () => {
    expect(unfitSelected(['twin'], 2, 0)).toEqual([]);
  });

  it('removes nothing: the caller still holds the full selection', () => {
    const selected = ['quad', 'twin'];
    unfitSelected(selected, 2, 0);
    expect(selected).toEqual(['quad', 'twin']);
  });
});

// -----------------------------------------------------------------------------
describe('fitHint', () => {
  it('shows the room count when a category fits', () => {
    expect(fitHint(categoryFit('twin', 4, 0))).toBe('2 rooms');
    expect(fitHint(categoryFit('quad', 4, 0))).toBe('1 room');
  });

  it('shows the reason when it does not', () => {
    expect(fitHint(categoryFit('quad', 2, 0))).toContain('Needs at least 4 travellers');
  });

  it('shows nothing when there is nothing useful to say', () => {
    expect(fitHint(categoryFit('twin', 5, 0))).toBeNull();
  });
});

// -----------------------------------------------------------------------------
describe('an unknown category', () => {
  it('is left alone rather than silently disabled', () => {
    expect(categoryFit('penthouse', 2, 0)).toMatchObject({ allowed: true, reason: null });
  });
});
