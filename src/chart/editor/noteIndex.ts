/**
 * Beat-sorted note index helpers.
 *
 * Pure (no React / three.js) helpers shared by the renderers and hit-testing:
 * binary search over a beat-sorted note array, dynamic InstancedMesh capacity
 * sizing and sliding-window density estimation.
 */

/** Minimal shape needed by the helpers (EditableBMSNote satisfies it). */
export interface BeatSortable {
  beat: number;
  endBeat?: number;
}

/** Long notes may start this many beats below the visible window and still be visible. */
export const LN_LOOK_BACK = 64;

/** Default minimum InstancedMesh capacity for note meshes. */
export const MIN_NOTE_INSTANCE_CAPACITY = 1024;

/** Fraction of the visible span added above and below the viewport when culling. */
export const VIEWPORT_CULL_MARGIN = 0.1;

/** Returns a stable, ascending-by-beat copy of `notes` (input order kept for equal beats). */
export function sortNotesByBeat<T extends BeatSortable>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => a.beat - b.beat);
}

/** Index of the first note with `note.beat >= beat` (sorted ascending by beat). */
export function lowerBoundByBeat(sorted: readonly BeatSortable[], beat: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].beat < beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the first note with `note.beat > beat` (sorted ascending by beat). */
export function upperBoundByBeat(sorted: readonly BeatSortable[], beat: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].beat <= beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * InstancedMesh capacity for `needed` instances: the next power of two >= needed,
 * never below `min`. Power-of-two steps keep remounts (capacity changes) rare.
 */
export function instanceCapacity(needed: number, min: number = MIN_NOTE_INSTANCE_CAPACITY): number {
  const n = Math.max(min, Math.ceil(needed), 1);
  let cap = 1;
  while (cap < n) cap *= 2;
  return cap;
}

/**
 * Maximum number of notes whose start beat falls in any window
 * `[b, b + windowBeats]` (two-pointer sweep, O(N)). Used to pre-size the note
 * meshes so the first frame after a zoom change does not have to grow them.
 */
export function maxNotesInBeatWindow(sorted: readonly BeatSortable[], windowBeats: number): number {
  if (sorted.length === 0) return 0;
  if (!(windowBeats > 0) || !Number.isFinite(windowBeats)) return sorted.length;
  let best = 0;
  let lo = 0;
  for (let hi = 0; hi < sorted.length; hi++) {
    while (sorted[hi].beat - sorted[lo].beat > windowBeats) lo++;
    const count = hi - lo + 1;
    if (count > best) best = count;
  }
  return best;
}

/**
 * Returns the note closest to `rawBeat` (strictly within `tolerance`) that
 * satisfies `match`, only examining notes whose beat lies in the tolerance range.
 * Among equally close notes the one that comes first in the sorted array wins.
 */
export function findClosestNoteByBeat<T extends BeatSortable>(
  sorted: readonly T[],
  rawBeat: number,
  tolerance: number,
  match: (note: T) => boolean
): T | null {
  const start = lowerBoundByBeat(sorted, rawBeat - tolerance);
  const end = upperBoundByBeat(sorted, rawBeat + tolerance);
  let best: T | null = null;
  let bestDist = tolerance;
  for (let i = start; i < end; i++) {
    const note = sorted[i];
    const dist = Math.abs(note.beat - rawBeat);
    if (dist >= tolerance) continue;
    if (best !== null && dist >= bestDist) continue;
    if (!match(note)) continue;
    best = note;
    bestDist = dist;
  }
  return best;
}
