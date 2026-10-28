import { describe, it, expect } from 'vitest';
import {
  sortNotesByBeat,
  lowerBoundByBeat,
  upperBoundByBeat,
  instanceCapacity,
  maxNotesInBeatWindow,
  findClosestNoteByBeat,
  noteHitHalfHeight,
  shortNoteHandleRange,
  NOTE_HIT_MARGIN_PX,
  findClosestLongNoteEnd,
  findLongNoteBodyAt,
} from '../src/chart/editor/noteIndex';

type N = { id: string; beat: number; endBeat?: number; column?: string };
const n = (id: string, beat: number, column = '1', endBeat?: number): N => ({ id, beat, column, endBeat });

describe('sortNotesByBeat', () => {
  it('sorts ascending and keeps input order for equal beats (stable)', () => {
    const notes = [n('c', 2), n('a', 1), n('b1', 1.5), n('b2', 1.5)];
    expect(sortNotesByBeat(notes).map((x) => x.id)).toEqual(['a', 'b1', 'b2', 'c']);
  });

  it('does not mutate the input', () => {
    const notes = [n('b', 2), n('a', 1)];
    sortNotesByBeat(notes);
    expect(notes.map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('lowerBoundByBeat / upperBoundByBeat', () => {
  const sorted = [n('a', 0), n('b', 1), n('c', 1), n('d', 2), n('e', 4)];

  it('lowerBound returns first index with beat >= x', () => {
    expect(lowerBoundByBeat(sorted, -1)).toBe(0);
    expect(lowerBoundByBeat(sorted, 1)).toBe(1);
    expect(lowerBoundByBeat(sorted, 1.5)).toBe(3);
    expect(lowerBoundByBeat(sorted, 5)).toBe(5);
  });

  it('upperBound returns first index with beat > x', () => {
    expect(upperBoundByBeat(sorted, 1)).toBe(3);
    expect(upperBoundByBeat(sorted, 4)).toBe(5);
    expect(upperBoundByBeat(sorted, -1)).toBe(0);
  });

  it('handles empty arrays', () => {
    expect(lowerBoundByBeat([], 3)).toBe(0);
    expect(upperBoundByBeat([], 3)).toBe(0);
  });
});

describe('instanceCapacity', () => {
  it('returns the floor when the need is small', () => {
    expect(instanceCapacity(0)).toBe(1024);
    expect(instanceCapacity(10, 256)).toBe(256);
  });

  it('rounds up to the next power of two', () => {
    expect(instanceCapacity(1025)).toBe(2048);
    expect(instanceCapacity(3000)).toBe(4096);
    expect(instanceCapacity(4096)).toBe(4096);
    expect(instanceCapacity(4097, 64)).toBe(8192);
  });

  it('is always >= needed (no silent caps)', () => {
    for (const need of [1, 63, 64, 65, 500, 501, 3001, 12345, 100000]) {
      expect(instanceCapacity(need, 64)).toBeGreaterThanOrEqual(need);
    }
  });
});

describe('maxNotesInBeatWindow', () => {
  it('returns 0 for no notes', () => {
    expect(maxNotesInBeatWindow([], 4)).toBe(0);
  });

  it('finds the densest window', () => {
    // 3 notes in [10, 11], 2 notes elsewhere
    const sorted = [n('a', 0), n('b', 5), n('c', 10), n('d', 10.5), n('e', 11)];
    expect(maxNotesInBeatWindow(sorted, 1)).toBe(3);
    expect(maxNotesInBeatWindow(sorted, 0.4)).toBe(1);
    expect(maxNotesInBeatWindow(sorted, 100)).toBe(5);
  });

  it('counts chords (many notes on one beat)', () => {
    const chord = Array.from({ length: 40 }, (_, i) => n(`bgm${i}`, 8));
    expect(maxNotesInBeatWindow(sortNotesByBeat([n('x', 0), ...chord]), 0.5)).toBe(40);
  });

  it('falls back to the total for non-positive / non-finite windows', () => {
    const sorted = [n('a', 0), n('b', 1)];
    expect(maxNotesInBeatWindow(sorted, 0)).toBe(2);
    expect(maxNotesInBeatWindow(sorted, Number.POSITIVE_INFINITY)).toBe(2);
  });
});

describe('findClosestNoteByBeat', () => {
  const sorted = sortNotesByBeat([
    n('a', 1, '1'),
    n('b', 1.02, '2'),
    n('c', 1.05, '1'),
    n('d', 3, '1'),
  ]);

  it('returns the closest matching note inside the tolerance', () => {
    expect(findClosestNoteByBeat(sorted, 1.04, 0.1, (x) => x.column === '1')?.id).toBe('c');
    expect(findClosestNoteByBeat(sorted, 1.01, 0.1, (x) => x.column === '1')?.id).toBe('a');
  });

  it('respects the predicate', () => {
    expect(findClosestNoteByBeat(sorted, 1.04, 0.1, (x) => x.column === '2')?.id).toBe('b');
    expect(findClosestNoteByBeat(sorted, 1.04, 0.1, (x) => x.column === '9')).toBeNull();
  });

  it('uses a strict tolerance', () => {
    expect(findClosestNoteByBeat(sorted, 2.5, 0.5, () => true)).toBeNull();
    expect(findClosestNoteByBeat(sorted, 2.6, 0.5, () => true)?.id).toBe('d');
  });

  it('only evaluates the predicate for notes inside the tolerance range', () => {
    const many = sortNotesByBeat(Array.from({ length: 10000 }, (_, i) => n(`n${i}`, i / 10)));
    let calls = 0;
    const hit = findClosestNoteByBeat(many, 500, 0.15, () => { calls++; return true; });
    expect(hit?.id).toBe('n5000');
    expect(calls).toBeLessThanOrEqual(3);
  });

  it('prefers the first note among equally close ones (stable order)', () => {
    const stacked = sortNotesByBeat([n('first', 2), n('second', 2)]);
    expect(findClosestNoteByBeat(stacked, 2, 0.1, () => true)?.id).toBe('first');
  });
});

describe('noteHitHalfHeight', () => {
  it('is twice the drawn note plus the pixel margin, scaling with the note thickness', () => {
    // zoom 2.5: the 5px margin is 2 world units
    expect(noteHitHalfHeight(1, 2.5)).toBe(3);
    expect(noteHitHalfHeight(4, 2.5)).toBe(6);
    expect(noteHitHalfHeight(8, 2.5)).toBe(10);
  });

  it('grows strictly with the note thickness at any zoom', () => {
    for (const zoom of [0.25, 1, 2.5, 4]) {
      let prev = 0;
      for (let h = 1; h <= 8; h++) {
        const half = noteHitHalfHeight(h, zoom);
        expect(half).toBeGreaterThan(prev);
        expect(half).toBeGreaterThan(h / 2); // always larger than the drawn note
        prev = half;
      }
    }
  });

  it('keeps NOTE_HIT_MARGIN_PX screen pixels beyond the note when zoomed out', () => {
    expect((noteHitHalfHeight(1, 0.25) - 0.5) * 0.25).toBeGreaterThanOrEqual(NOTE_HIT_MARGIN_PX);
  });

  it('treats a bad zoom as 1', () => {
    expect(noteHitHalfHeight(4, 0)).toBe(noteHitHalfHeight(4, 1));
    expect(noteHitHalfHeight(4, NaN)).toBe(noteHitHalfHeight(4, 1));
  });
});

describe('shortNoteHandleRange', () => {
  it('covers the upper part of the note and the hit-box margin above it', () => {
    const { above, below } = shortNoteHandleRange(4, 1);
    expect(below).toBeCloseTo(1.4);
    // top of the hit box is noteHitHalfHeight - noteHeight / 2 above the top edge
    expect(above).toBeGreaterThan(noteHitHalfHeight(4, 1) - 2);
  });

  it('scales with the note thickness', () => {
    const thin = shortNoteHandleRange(1, 2);
    const thick = shortNoteHandleRange(8, 2);
    expect(thick.above).toBeGreaterThan(thin.above);
    expect(thick.below).toBeGreaterThan(thin.below);
  });
});

describe('findClosestLongNoteEnd', () => {
  const lns = [n('a', 0, '1', 2), n('b', 1, '1', 2.1), n('c', 0, '2', 2), n('s', 2)];
  const inLane1 = (x: N) => x.column === '1';

  it('returns the closest end within tolerance, with its distance', () => {
    const hit = findClosestLongNoteEnd(lns, 2.08, 0.2, inLane1);
    expect(hit?.note.id).toBe('b');
    expect(hit?.dist).toBeCloseTo(0.02);
  });

  it('ignores short notes, non-matching notes and ends outside the tolerance', () => {
    expect(findClosestLongNoteEnd(lns, 2.5, 0.2, inLane1)).toBeNull();
    expect(findClosestLongNoteEnd([n('s', 2)], 2, 0.2, () => true)).toBeNull();
    expect(findClosestLongNoteEnd(lns, 2, 0.2, (x) => x.column === '3')).toBeNull();
  });
});

describe('findLongNoteBodyAt', () => {
  const lns = [n('a', 0, '1', 4), n('b', 8, '1', 9)];

  it('finds the long note whose body covers the beat', () => {
    expect(findLongNoteBodyAt(lns, 2, () => true)?.id).toBe('a');
    expect(findLongNoteBodyAt(lns, 8.5, () => true)?.id).toBe('b');
  });

  it('returns null between long notes or when nothing matches', () => {
    expect(findLongNoteBodyAt(lns, 6, () => true)).toBeNull();
    expect(findLongNoteBodyAt(lns, 2, () => false)).toBeNull();
  });
});
