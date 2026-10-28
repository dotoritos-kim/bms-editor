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

/**
 * Hit-box margin, in screen pixels, added on each side of a note on top of its
 * scaled height — keeps thin notes and zoomed-out (wide key mode) charts grabbable.
 */
export const NOTE_HIT_MARGIN_PX = 5;

function safeZoom(zoom: number): number {
  return zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
}

/**
 * Half-height, in world units, of a note's hit box (centred on the drawn
 * note): twice the drawn note plus NOTE_HIT_MARGIN_PX screen pixels on each
 * side at the camera's `zoom`, so it grows and shrinks with the note
 * thickness setting.
 */
export function noteHitHalfHeight(noteHeight: number, zoom: number): number {
  return noteHeight + NOTE_HIT_MARGIN_PX / safeZoom(zoom);
}

/**
 * World-unit extent of a short note's stretch handle around its top edge:
 * `above` reaches to the top of the hit box (plus a pixel), `below` covers the
 * upper 35% of the drawn note. Both scale with the note thickness.
 */
export function shortNoteHandleRange(noteHeight: number, zoom: number): { above: number; below: number } {
  const z = safeZoom(zoom);
  return {
    above: noteHitHalfHeight(noteHeight, zoom) - noteHeight / 2 + 1 / z,
    below: noteHeight * 0.35,
  };
}

/**
 * The long note whose end lies closest to `beat` (strictly within `tolerance`)
 * among `match`ing notes, with its distance. Notes without `endBeat` are skipped.
 */
export function findClosestLongNoteEnd<T extends BeatSortable>(
  longNotes: readonly T[],
  beat: number,
  tolerance: number,
  match: (note: T) => boolean
): { note: T; dist: number } | null {
  let best: { note: T; dist: number } | null = null;
  for (const note of longNotes) {
    if (note.endBeat === undefined) continue;
    const dist = Math.abs(note.endBeat - beat);
    if (dist >= tolerance || (best !== null && dist >= best.dist)) continue;
    if (!match(note)) continue;
    best = { note, dist };
  }
  return best;
}

/** The first `match`ing long note whose body (head to end) covers `beat`. */
export function findLongNoteBodyAt<T extends BeatSortable>(
  longNotes: readonly T[],
  beat: number,
  match: (note: T) => boolean
): T | null {
  for (const note of longNotes) {
    if (note.endBeat === undefined || beat < note.beat || beat > note.endBeat) continue;
    if (match(note)) return note;
  }
  return null;
}
