import { describe, it, expect } from 'vitest';
import { buildBeatToTimeMap, beatToTime } from '../src/chart/EditorPlayback';
import type { BMSBpmChange } from '@rhythm-archive/bms-core';

describe('buildBeatToTimeMap', () => {
  it('should create a single event at beat 0 with baseBpm when no BPM changes', () => {
    const events = buildBeatToTimeMap([], 150);
    expect(events).toEqual([{ beat: 0, bpm: 150 }]);
  });

  it('should include BPM change events at correct beat positions', () => {
    const bpmChanges: BMSBpmChange[] = [
      { measure: 4, fraction: 0, bpm: 200 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 130);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ beat: 0, bpm: 130 });
    // measure 4, fraction 0 => beat = 4 * 4 + 0 * 4 = 16
    expect(events[1]).toEqual({ beat: 16, bpm: 200 });
  });

  it('should calculate beat from measure and fraction correctly', () => {
    // measure 2, fraction 0.5 => beat = 2 * 4 + 0.5 * 4 = 10
    const bpmChanges: BMSBpmChange[] = [
      { measure: 2, fraction: 0.5, bpm: 180 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 120);
    expect(events[1].beat).toBe(10);
  });

  it('should sort events by beat even if input is unordered', () => {
    const bpmChanges: BMSBpmChange[] = [
      { measure: 8, fraction: 0, bpm: 200 },
      { measure: 2, fraction: 0, bpm: 160 },
      { measure: 5, fraction: 0.25, bpm: 180 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 130);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].beat).toBeGreaterThanOrEqual(events[i - 1].beat);
    }
  });

  it('should handle fractional BPM values', () => {
    const bpmChanges: BMSBpmChange[] = [
      { measure: 1, fraction: 0, bpm: 174.5 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 130);
    expect(events[1].bpm).toBe(174.5);
  });

  it('should handle multiple BPM changes in the same measure', () => {
    const bpmChanges: BMSBpmChange[] = [
      { measure: 1, fraction: 0, bpm: 160 },
      { measure: 1, fraction: 0.5, bpm: 200 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 130);
    expect(events).toHaveLength(3);
    // beat 4 and beat 6
    expect(events[1].beat).toBe(4);
    expect(events[2].beat).toBe(6);
  });
});

describe('beatToTime', () => {
  it('should return 0 for beat 0', () => {
    const events = buildBeatToTimeMap([], 120);
    expect(beatToTime(0, events)).toBe(0);
  });

  it('should convert beats to seconds at constant BPM', () => {
    // At 120 BPM: 1 beat = 0.5 seconds
    const events = buildBeatToTimeMap([], 120);
    expect(beatToTime(1, events)).toBeCloseTo(0.5, 10);
    expect(beatToTime(4, events)).toBeCloseTo(2.0, 10);
    expect(beatToTime(8, events)).toBeCloseTo(4.0, 10);
  });

  it('should handle BPM changes correctly', () => {
    // 0-8 beats at 120 BPM, then 8+ beats at 240 BPM
    const bpmChanges: BMSBpmChange[] = [
      { measure: 2, fraction: 0, bpm: 240 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 120);

    // First 8 beats at 120 BPM = 8 * (60/120) = 4 seconds
    expect(beatToTime(8, events)).toBeCloseTo(4.0, 10);

    // At beat 12: 4s + 4 beats at 240 BPM = 4 + 4*(60/240) = 4 + 1 = 5 seconds
    expect(beatToTime(12, events)).toBeCloseTo(5.0, 10);
  });

  it('should handle multiple BPM changes', () => {
    // 0-4 at 120, 4-8 at 60, 8+ at 120
    const bpmChanges: BMSBpmChange[] = [
      { measure: 1, fraction: 0, bpm: 60 },
      { measure: 2, fraction: 0, bpm: 120 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 120);

    // beat 4: 4 * (60/120) = 2s
    expect(beatToTime(4, events)).toBeCloseTo(2.0, 10);
    // beat 8: 2s + 4 * (60/60) = 2 + 4 = 6s
    expect(beatToTime(8, events)).toBeCloseTo(6.0, 10);
    // beat 12: 6s + 4 * (60/120) = 6 + 2 = 8s
    expect(beatToTime(12, events)).toBeCloseTo(8.0, 10);
  });

  it('should handle very high BPM values', () => {
    const events = buildBeatToTimeMap([], 600);
    // 1 beat at 600 BPM = 60/600 = 0.1 seconds
    expect(beatToTime(1, events)).toBeCloseTo(0.1, 10);
  });

  it('should handle very low BPM values', () => {
    const events = buildBeatToTimeMap([], 1);
    // 1 beat at 1 BPM = 60 seconds
    expect(beatToTime(1, events)).toBeCloseTo(60.0, 10);
  });

  it('should handle fractional beats', () => {
    const events = buildBeatToTimeMap([], 120);
    // 0.5 beats at 120 BPM = 0.25 seconds
    expect(beatToTime(0.5, events)).toBeCloseTo(0.25, 10);
  });

  it('should handle beat exactly at a BPM change point', () => {
    const bpmChanges: BMSBpmChange[] = [
      { measure: 1, fraction: 0, bpm: 200 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 100);

    // beat 4 (the change point): 4 * (60/100) = 2.4s
    expect(beatToTime(4, events)).toBeCloseTo(2.4, 10);
  });

  it('should increase monotonically for positive BPM values', () => {
    const bpmChanges: BMSBpmChange[] = [
      { measure: 2, fraction: 0, bpm: 200 },
      { measure: 4, fraction: 0, bpm: 80 },
      { measure: 6, fraction: 0, bpm: 300 },
    ];
    const events = buildBeatToTimeMap(bpmChanges, 130);

    let prevTime = -1;
    for (let beat = 0; beat <= 32; beat += 0.25) {
      const t = beatToTime(beat, events);
      expect(t).toBeGreaterThan(prevTime);
      prevTime = t;
    }
  });

  it('should default to 130 BPM when events array is empty', () => {
    // Edge case: empty events array (should not normally happen, but defensive)
    const time = beatToTime(1, []);
    // Falls back to 130 BPM: 60/130
    expect(time).toBeCloseTo(60 / 130, 10);
  });

  it('should handle negative BPM gracefully (mathematical correctness)', () => {
    // Negative BPM is unusual but some gimmick charts use it
    // The function should still compute mathematically correct results
    const events = [{ beat: 0, bpm: -120 }];
    const time = beatToTime(1, events);
    // 1 * (60 / -120) = -0.5
    expect(time).toBeCloseTo(-0.5, 10);
  });
});
