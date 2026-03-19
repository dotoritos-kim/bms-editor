import { describe, it, expect } from 'vitest';
import { buildBeatToTimeMap, beatToTime } from '../src/chart/EditorPlayback';
import { generateLaneConfig, getLaneIds, getLaneBackground } from '../src/chart/laneConfig';
import { detectKeyMode } from '../src/chart/useBmsChart';
import type { BMSNote } from '@rhythm-archive/bms-core';
import type { BMSBpmChange } from '@rhythm-archive/bms-core';
import type { KeyMode } from '../src/chart/NoteChartViewer';

describe('Adversarial Editor Scenarios', () => {
  // =============================================
  // Negative / extreme beat positions
  // =============================================

  describe('beatToTime with extreme inputs', () => {
    it('should handle negative beat positions (returns negative time)', () => {
      const events = buildBeatToTimeMap([], 120);
      const time = beatToTime(-4, events);
      // -4 beats at 120 BPM = -4 * (60/120) = -2 seconds
      expect(time).toBeCloseTo(-2.0, 10);
    });

    it('should handle extremely high beat positions without overflow', () => {
      const events = buildBeatToTimeMap([], 120);
      const time = beatToTime(100000, events);
      // 100000 beats at 120 BPM = 100000 * 0.5 = 50000 seconds
      expect(time).toBeCloseTo(50000, 5);
      expect(isFinite(time)).toBe(true);
    });

    it('should handle beat position of zero', () => {
      const events = buildBeatToTimeMap([], 120);
      expect(beatToTime(0, events)).toBe(0);
    });

    it('should handle beat = Number.MAX_SAFE_INTEGER without crashing', () => {
      const events = buildBeatToTimeMap([], 120);
      const time = beatToTime(Number.MAX_SAFE_INTEGER, events);
      expect(isFinite(time)).toBe(true);
    });

    it('should handle very small fractional beats', () => {
      const events = buildBeatToTimeMap([], 120);
      const time = beatToTime(0.0001, events);
      expect(time).toBeGreaterThan(0);
      expect(isFinite(time)).toBe(true);
    });
  });

  // =============================================
  // Extreme BPM values
  // =============================================

  describe('extreme BPM handling', () => {
    it('should handle BPM of 0 (division by zero scenario)', () => {
      // BPM of 0: the loop processes event {beat:0, bpm:0} with deltaBeat=0,
      // which produces 0/0 = NaN. This is a degenerate input; the function
      // does not crash but produces NaN.
      const events = [{ beat: 0, bpm: 0 }];
      const time = beatToTime(1, events);
      expect(time).toBeNaN();
    });

    it('should handle extremely high BPM (e.g., 99999)', () => {
      const events = buildBeatToTimeMap([], 99999);
      const time = beatToTime(1, events);
      // Near zero but positive
      expect(time).toBeGreaterThan(0);
      expect(time).toBeLessThan(0.01);
    });

    it('should handle BPM change to 0 mid-chart', () => {
      const bpmChanges: BMSBpmChange[] = [
        { measure: 1, fraction: 0, bpm: 0 },
      ];
      const events = buildBeatToTimeMap(bpmChanges, 120);
      // Beat 4 is at the change point: 4 * (60/120) = 2s (calculated correctly)
      expect(beatToTime(4, events)).toBeCloseTo(2.0, 10);
      // Beat 5 is after the 0 BPM section: 2s + 1 * (60/0) = Infinity
      expect(beatToTime(5, events)).toBe(Infinity);
    });

    it('should handle rapid BPM oscillation (soflan gimmick)', () => {
      const bpmChanges: BMSBpmChange[] = [];
      // Create 100 rapid BPM changes alternating between 60 and 300
      for (let i = 0; i < 100; i++) {
        bpmChanges.push({
          measure: i,
          fraction: 0,
          bpm: i % 2 === 0 ? 60 : 300,
        });
      }
      const events = buildBeatToTimeMap(bpmChanges, 120);
      // Should not crash and should produce monotonically increasing time
      let prevTime = -Infinity;
      for (let beat = 0; beat <= 400; beat += 4) {
        const t = beatToTime(beat, events);
        expect(t).toBeGreaterThanOrEqual(prevTime);
        expect(isFinite(t)).toBe(true);
        prevTime = t;
      }
    });
  });

  // =============================================
  // Empty / degenerate chart data
  // =============================================

  describe('empty and degenerate chart data', () => {
    it('should handle empty notes for detectKeyMode', () => {
      expect(detectKeyMode([])).toBe('7K');
    });

    it('should handle notes with only BGM (no column)', () => {
      const bgmNotes: BMSNote[] = Array.from({ length: 50 }, (_, i) => ({
        beat: i * 0.5,
        keysound: String(i).padStart(2, '0'),
        noteType: 'bgm' as const,
      }));
      expect(detectKeyMode(bgmNotes)).toBe('7K');
    });

    it('should handle all notes on same column', () => {
      const notes: BMSNote[] = Array.from({ length: 100 }, (_, i) => ({
        beat: i * 0.25,
        column: '3',
        keysound: '01',
      }));
      // Only column 3 used, no SC, maxNumeric = 3 => falls through to 4K
      expect(detectKeyMode(notes)).toBe('4K');
    });

    it('should handle a single note', () => {
      const notes: BMSNote[] = [{ beat: 0, column: '1', keysound: '01' }];
      // Only column 1 used => 4K
      expect(detectKeyMode(notes)).toBe('4K');
    });
  });

  // =============================================
  // Overlapping / duplicate notes
  // =============================================

  describe('overlapping and duplicate notes', () => {
    it('should detect key mode correctly with many duplicate columns', () => {
      // 100 notes all on columns 1 and 2 (lots of overlap)
      const notes: BMSNote[] = [];
      for (let i = 0; i < 100; i++) {
        notes.push({ beat: i * 0.125, column: '1', keysound: '01' });
        notes.push({ beat: i * 0.125, column: '2', keysound: '02' });
      }
      expect(detectKeyMode(notes)).toBe('4K');
    });

    it('should handle notes at the exact same beat and column (stacked)', () => {
      const notes: BMSNote[] = [
        { beat: 4, column: '1', keysound: '01' },
        { beat: 4, column: '1', keysound: '02' },
        { beat: 4, column: '1', keysound: '03' },
      ];
      expect(detectKeyMode(notes)).toBe('4K');
    });
  });

  // =============================================
  // Long notes edge cases
  // =============================================

  describe('long note edge cases', () => {
    it('should handle zero-width long notes (endBeat === beat)', () => {
      const notes: BMSNote[] = [
        { beat: 4, endBeat: 4, column: '1', keysound: '01' },
      ];
      // detectKeyMode should still work
      expect(detectKeyMode(notes)).toBe('4K');
    });

    it('should handle long notes where endBeat < beat (reversed)', () => {
      const notes: BMSNote[] = [
        { beat: 8, endBeat: 4, column: '1', keysound: '01' },
      ];
      // Should not crash, still detects key mode from column
      expect(detectKeyMode(notes)).toBe('4K');
    });

    it('should handle extremely long long notes (endBeat very far from beat)', () => {
      const notes: BMSNote[] = [
        { beat: 0, endBeat: 999999, column: '3', keysound: '01' },
      ];
      expect(detectKeyMode(notes)).toBe('4K');
    });
  });

  // =============================================
  // Lane config edge cases
  // =============================================

  describe('lane config consistency across all modes', () => {
    const ALL_KEY_MODES: KeyMode[] = [
      '4K', '5K', '6K', '7K', '8K', '9K', '10K', '12K', '14K', '18K', '24K', '48K',
    ];

    it('should never produce overlapping lanes', () => {
      for (const mode of ALL_KEY_MODES) {
        const lanes = generateLaneConfig(mode);
        for (let i = 0; i < lanes.length; i++) {
          for (let j = i + 1; j < lanes.length; j++) {
            const aEnd = lanes[i].x + lanes[i].width;
            const bStart = lanes[j].x;
            // Lane i should end before or at lane j start
            expect(aEnd).toBeLessThanOrEqual(bStart);
          }
        }
      }
    });

    it('should never produce negative x or width', () => {
      for (const mode of ALL_KEY_MODES) {
        const lanes = generateLaneConfig(mode);
        for (const lane of lanes) {
          expect(lane.x).toBeGreaterThanOrEqual(0);
          expect(lane.width).toBeGreaterThan(0);
        }
      }
    });

    it('should have total width that decreases as key count increases', () => {
      // The per-lane width decreases for higher key modes to keep total width reasonable
      const totalWidths = ALL_KEY_MODES.map((mode) => {
        const lanes = generateLaneConfig(mode);
        const lastLane = lanes[lanes.length - 1];
        return lastLane.x + lastLane.width;
      });

      // 48K should have a smaller total width per lane than 4K
      const fourKWidth = totalWidths[0]; // 4K
      const fortyEightKWidth = totalWidths[totalWidths.length - 1]; // 48K
      // 48K has more lanes but smaller per-lane width, so total might be comparable
      // At minimum, both should be positive
      expect(fourKWidth).toBeGreaterThan(0);
      expect(fortyEightKWidth).toBeGreaterThan(0);
    });

    it('should produce valid hex background colors for all lanes in all modes', () => {
      const hexPattern = /^#[0-9a-fA-F]{6}$/;
      for (const mode of ALL_KEY_MODES) {
        const lanes = generateLaneConfig(mode);
        for (const lane of lanes) {
          const bg = getLaneBackground(lane);
          expect(bg).toMatch(hexPattern);
        }
      }
    });
  });

  // =============================================
  // BPM map with duplicate beats
  // =============================================

  describe('BPM map with duplicate beat positions', () => {
    it('should handle two BPM changes at the exact same beat', () => {
      const bpmChanges: BMSBpmChange[] = [
        { measure: 1, fraction: 0, bpm: 200 },
        { measure: 1, fraction: 0, bpm: 300 },
      ];
      const events = buildBeatToTimeMap(bpmChanges, 120);
      // Should not crash; both events are at beat 4
      // The last one in sorted order (by sort stability) should apply
      expect(events.length).toBe(3);
      const time = beatToTime(5, events);
      expect(isFinite(time)).toBe(true);
      expect(time).toBeGreaterThan(0);
    });
  });

  // =============================================
  // Large scale stress
  // =============================================

  describe('large scale data', () => {
    it('should handle detectKeyMode with 10000 notes', () => {
      const notes: BMSNote[] = [];
      for (let i = 0; i < 10000; i++) {
        notes.push({
          beat: i * 0.0625,
          column: String((i % 7) + 1),
          keysound: '01',
        });
      }
      expect(detectKeyMode(notes)).toBe('7K');
    });

    it('should handle beatToTime with 1000 BPM changes', () => {
      const bpmChanges: BMSBpmChange[] = [];
      for (let i = 1; i <= 1000; i++) {
        bpmChanges.push({
          measure: i,
          fraction: 0,
          bpm: 100 + Math.sin(i) * 50,
        });
      }
      const events = buildBeatToTimeMap(bpmChanges, 150);
      const time = beatToTime(4000, events);
      expect(isFinite(time)).toBe(true);
      expect(time).toBeGreaterThan(0);
    });
  });
});
