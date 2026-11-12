/**
 * Grid snapping on the grid the editor draws: each measure is divided into
 * `gridSnap` parts (or its per-measure override) from its own start, using the
 * measure's real length (#xxx02). Snapping from beat 0 in fixed 4/gridSnap
 * steps put notes between the drawn lines after a measure of another length.
 *
 * Measure starts and grid positions are computed the same way as the grid
 * renderer and the time-signature converter (running sum of measure lengths,
 * `i * beats / divisions`), so a snapped beat is the very value a grid line is
 * drawn at.
 */

/** Highest measure index searched (matches the grid renderer). */
const MAX_MEASURE_INDEX = 9999;

export interface MeasureSpan {
  measure: number;
  /** First beat of the measure */
  start: number;
  /** Length in beats */
  beats: number;
}

/** Measure containing `beat` (beats < 0 → measure 0). */
export function measureSpanAt(beat: number, timeSignatures?: Map<number, number>): MeasureSpan {
  let start = 0;
  for (let measure = 0; measure < MAX_MEASURE_INDEX; measure++) {
    const beats = 4 * (timeSignatures?.get(measure) ?? 1.0);
    if (!(beats > 0)) continue;
    if (beat < start + beats) return { measure, start, beats };
    start += beats;
  }
  return { measure: MAX_MEASURE_INDEX, start, beats: 4 };
}

/**
 * Nearest grid line to `beat`: `gridSnap` (or the measure's override)
 * divisions per measure, counted from the start of the measure the beat is in.
 */
export function snapBeatToMeasureGrid(
  beat: number,
  gridSnap: number,
  timeSignatures?: Map<number, number>,
  gridSnapOverrides?: Map<number, number>,
): number {
  if (!Number.isFinite(beat)) return beat;
  if (beat <= 0) return 0;
  const { measure, start, beats } = measureSpanAt(beat, timeSignatures);
  const divisions = gridSnapOverrides?.get(measure) ?? gridSnap;
  if (!(divisions > 0)) return beat;
  const i = Math.round(((beat - start) * divisions) / beats);
  if (i >= divisions) return start + beats;
  return start + (i * beats) / divisions;
}

/** Length in beats of one grid step in the measure at `beat`. */
export function gridStepAt(
  beat: number,
  gridSnap: number,
  timeSignatures?: Map<number, number>,
  gridSnapOverrides?: Map<number, number>,
): number {
  const { measure, beats } = measureSpanAt(beat, timeSignatures);
  const divisions = gridSnapOverrides?.get(measure) ?? gridSnap;
  return divisions > 0 ? beats / divisions : 4 / gridSnap;
}
