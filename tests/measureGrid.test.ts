import { describe, it, expect } from 'vitest';
import { snapBeatToMeasureGrid, gridStepAt, measureSpanAt } from '../src/chart/editor/measureGrid';

/** Grid lines the renderer draws in a measure (same arithmetic as MeasureLinesRenderer). */
function drawnLines(start: number, beats: number, divisions: number): number[] {
  return Array.from({ length: divisions }, (_, i) => start + (i * beats) / divisions);
}

describe('snapBeatToMeasureGrid', () => {
  it('matches the 4/4 grid from beat 0', () => {
    expect(snapBeatToMeasureGrid(0.37, 16)).toBe(0.25);
    expect(snapBeatToMeasureGrid(0.38, 16)).toBe(0.5);
    expect(snapBeatToMeasureGrid(-1, 16)).toBe(0);
  });

  it('divides a 3/4 measure into gridSnap parts, like the drawn grid', () => {
    const ts = new Map([[0, 0.75]]);
    // 16 divisions of 3 beats: lines every 0.1875 beats
    expect(snapBeatToMeasureGrid(0.2, 16, ts)).toBe(0.1875);
    expect(drawnLines(0, 3, 16)).toContain(snapBeatToMeasureGrid(1.1, 16, ts));
  });

  it('counts from the start of the measure after one of odd length', () => {
    // Measure 0 is 0.333 (1.332 beats): measure 1 starts off the 1/16 grid of beat 0
    const ts = new Map([[0, 0.333]]);
    const start = 1.332;
    const lines = drawnLines(start, 4, 16);
    for (const target of [start + 0.01, start + 0.26, start + 2.49]) {
      expect(lines).toContain(snapBeatToMeasureGrid(target, 16, ts));
    }
    expect(snapBeatToMeasureGrid(start + 0.01, 16, ts)).toBe(start);
  });

  it('uses the per-measure grid override', () => {
    const overrides = new Map([[1, 12]]);
    // Measure 1 (beats 4..8) in quarter-note triplets: lines every 1/3 beat
    expect(snapBeatToMeasureGrid(4.3, 16, undefined, overrides)).toBeCloseTo(4 + 1 / 3, 12);
    expect(snapBeatToMeasureGrid(0.3, 16, undefined, overrides)).toBe(0.25);
  });

  it('snaps past the last line onto the next barline', () => {
    expect(snapBeatToMeasureGrid(3.95, 16)).toBe(4);
  });
});

describe('gridStepAt / measureSpanAt', () => {
  it('reports the step and span of the measure at a beat', () => {
    const ts = new Map([[1, 0.75]]);
    expect(measureSpanAt(5, ts)).toEqual({ measure: 1, start: 4, beats: 3 });
    expect(gridStepAt(5, 16, ts)).toBe(3 / 16);
    expect(gridStepAt(1, 16, ts)).toBe(0.25);
    expect(gridStepAt(5, 16, ts, new Map([[1, 12]]))).toBe(0.25);
  });
});
