import { describe, it, expect } from 'vitest';
import { GRID_SNAP_OPTIONS, isPresetGridSnap } from '../src/chart/editor/types';

describe('isPresetGridSnap', () => {
  it('returns true for every preset value', () => {
    for (const preset of GRID_SNAP_OPTIONS) {
      expect(isPresetGridSnap(preset)).toBe(true);
    }
  });

  it('returns false for arbitrary custom values', () => {
    expect(isPresetGridSnap(7)).toBe(false);
    expect(isPresetGridSnap(100)).toBe(false);
    expect(isPresetGridSnap(0)).toBe(false);
    expect(isPresetGridSnap(-4)).toBe(false);
    expect(isPresetGridSnap(3.5)).toBe(false);
  });

  it('narrows the type on the true branch', () => {
    const value: number = 16;
    if (isPresetGridSnap(value)) {
      // type-level check: value should be GridSnapPreset here
      const preset: (typeof GRID_SNAP_OPTIONS)[number] = value;
      expect(GRID_SNAP_OPTIONS).toContain(preset);
    }
  });
});
