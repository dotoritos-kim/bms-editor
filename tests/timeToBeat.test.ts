import { describe, it, expect } from 'vitest';
import { buildBeatToTimeMap, beatToTime, timeToBeat } from '../src/chart/EditorPlayback';
import type { BMSBpmChange } from '@rhythm-archive/bms-core';

describe('timeToBeat', () => {
  it('should return 0 for time 0', () => {
    const events = buildBeatToTimeMap([], 120);
    expect(timeToBeat(0, events)).toBe(0);
  });

  it('should convert time to beats at single constant BPM', () => {
    // At 120 BPM: 1 beat = 0.5 seconds, so 0.5s => beat 1, 2s => beat 4
    const events = buildBeatToTimeMap([], 120);
    expect(timeToBeat(0.5, events)).toBeCloseTo(1, 10);
    expect(timeToBeat(2.0, events)).toBeCloseTo(4, 10);
    expect(timeToBeat(4.0, events)).toBeCloseTo(8, 10);
  });

  it('should handle BPM changes correctly', () => {
    // 0-8 beats at 120 BPM, then 8+ beats at 240 BPM
    const bpmChanges: BMSBpmChange[] = [
      { measure: 2, fraction: 0, bpm: 240 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 120);

    // beat 8 => 4.0s, so timeToBeat(4.0) should be 8
    expect(timeToBeat(4.0, events)).toBeCloseTo(8, 10);

    // beat 12 => 5.0s (4s + 4 beats at 240 BPM = 4 + 1 = 5s)
    expect(timeToBeat(5.0, events)).toBeCloseTo(12, 10);
  });

  it('should handle multiple BPM changes', () => {
    // 0-4 at 120, 4-8 at 60, 8+ at 120
    const bpmChanges: BMSBpmChange[] = [
      { measure: 1, fraction: 0, bpm: 60 },
      { measure: 2, fraction: 0, bpm: 120 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 120);

    // beat 4 => 2s
    expect(timeToBeat(2.0, events)).toBeCloseTo(4, 10);
    // beat 8 => 6s
    expect(timeToBeat(6.0, events)).toBeCloseTo(8, 10);
    // beat 12 => 8s
    expect(timeToBeat(8.0, events)).toBeCloseTo(12, 10);
  });

  it('should be the inverse of beatToTime (round-trip beat -> time -> beat)', () => {
    const bpmChanges: BMSBpmChange[] = [
      { measure: 2, fraction: 0, bpm: 200 },
      { measure: 4, fraction: 0, bpm: 80 },
      { measure: 6, fraction: 0, bpm: 300 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 130);

    for (let beat = 0; beat <= 32; beat += 0.25) {
      const time = beatToTime(beat, events);
      const recovered = timeToBeat(time, events);
      expect(recovered).toBeCloseTo(beat, 8);
    }
  });

  it('should satisfy consistency: beatToTime(timeToBeat(t)) approx t', () => {
    const bpmChanges: BMSBpmChange[] = [
      { measure: 1, fraction: 0, bpm: 160 },
      { measure: 3, fraction: 0.5, bpm: 90 },
      { measure: 5, fraction: 0, bpm: 250 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 120);

    // Sample various time values
    const times = [0, 0.5, 1.0, 2.0, 3.0, 5.0, 8.0, 10.0, 15.0, 20.0];
    for (const t of times) {
      const beat = timeToBeat(t, events);
      const recovered = beatToTime(beat, events);
      expect(recovered).toBeCloseTo(t, 8);
    }
  });

  it('should handle extreme BPM values', () => {
    // Very high BPM
    const highEvents = buildBeatToTimeMap([], 600);
    // 1 beat at 600 BPM = 0.1s, so timeToBeat(0.1) = 1
    expect(timeToBeat(0.1, highEvents)).toBeCloseTo(1, 10);

    // Very low BPM
    const lowEvents = buildBeatToTimeMap([], 1);
    // 1 beat at 1 BPM = 60s, so timeToBeat(60) = 1
    expect(timeToBeat(60, lowEvents)).toBeCloseTo(1, 10);
  });

  it('should handle very large time values', () => {
    const events = buildBeatToTimeMap([], 120);
    // 1000 beats at 120 BPM = 500s
    expect(timeToBeat(500, events)).toBeCloseTo(1000, 8);
  });

  it('should handle time exactly at a BPM change point', () => {
    const bpmChanges: BMSBpmChange[] = [
      { measure: 1, fraction: 0, bpm: 200 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 100);

    // beat 4 => 4 * (60/100) = 2.4s
    expect(timeToBeat(2.4, events)).toBeCloseTo(4, 10);
  });

  it('should default to 130 BPM when events array is empty', () => {
    const beat = timeToBeat(60 / 130, []);
    expect(beat).toBeCloseTo(1, 10);
  });

  it('should increase monotonically for positive BPM values', () => {
    const bpmChanges: BMSBpmChange[] = [
      { measure: 2, fraction: 0, bpm: 200 },
      { measure: 4, fraction: 0, bpm: 80 },
      { measure: 6, fraction: 0, bpm: 300 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 130);

    let prevBeat = -1;
    for (let t = 0; t <= 20; t += 0.1) {
      const beat = timeToBeat(t, events);
      expect(beat).toBeGreaterThan(prevBeat);
      prevBeat = beat;
    }
  });
});
