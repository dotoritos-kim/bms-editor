import { describe, it, expect } from 'vitest';
import { generateLaneConfig, getLaneIds, getLaneBackground } from '../src/chart/laneConfig';
import type { KeyMode } from '../src/chart/NoteChartViewer';

/** All supported key modes */
const ALL_KEY_MODES: KeyMode[] = [
  '4K', '5K', '6K', '7K', '8K', '9K', '10K', '12K', '14K', '18K', '24K', '48K',
];

describe('generateLaneConfig', () => {
  // =============================================
  // Per-mode lane count and structure tests
  // =============================================

  it('should generate 6 lanes for 4K (SC + 4 keys + FZ)', () => {
    const lanes = generateLaneConfig('4K');
    expect(lanes).toHaveLength(6);
    expect(lanes[0].id).toBe('SC');
    expect(lanes[0].isScratch).toBe(true);
    expect(lanes[5].id).toBe('FZ');
    // Key lanes are 1, 2, 4, 5 (no column 3)
    const keyIds = lanes.filter((l) => !l.isScratch && l.id !== 'FZ').map((l) => l.id);
    expect(keyIds).toEqual(['1', '2', '4', '5']);
  });

  it('should generate 7 lanes for 5K (SC + 5 keys + FZ)', () => {
    const lanes = generateLaneConfig('5K');
    expect(lanes).toHaveLength(7);
    expect(lanes[0].id).toBe('SC');
    expect(lanes[0].isScratch).toBe(true);
    expect(lanes[6].id).toBe('FZ');
    const keyIds = lanes.filter((l) => !l.isScratch && l.id !== 'FZ').map((l) => l.id);
    expect(keyIds).toEqual(['1', '2', '3', '4', '5']);
  });

  it('should generate 8 lanes for 6K (SC + 6 keys + FZ)', () => {
    const lanes = generateLaneConfig('6K');
    expect(lanes).toHaveLength(8);
    expect(lanes[0].id).toBe('SC');
    expect(lanes[7].id).toBe('FZ');
    const keyIds = lanes.filter((l) => !l.isScratch && l.id !== 'FZ').map((l) => l.id);
    expect(keyIds).toEqual(['1', '2', '3', '5', '6', '7']);
  });

  it('should generate 9 lanes for 7K (SC + 7 keys + FZ)', () => {
    const lanes = generateLaneConfig('7K');
    expect(lanes).toHaveLength(9);
    expect(lanes[0].id).toBe('SC');
    expect(lanes[0].isScratch).toBe(true);
    expect(lanes[8].id).toBe('FZ');
    const keyIds = lanes.filter((l) => !l.isScratch && l.id !== 'FZ').map((l) => l.id);
    expect(keyIds).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('should generate 8 lanes for 8K (no scratch)', () => {
    const lanes = generateLaneConfig('8K');
    expect(lanes).toHaveLength(8);
    expect(lanes.every((l) => !l.isScratch)).toBe(true);
    const ids = lanes.map((l) => l.id);
    expect(ids).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('should generate 9 lanes for 9K (no scratch)', () => {
    const lanes = generateLaneConfig('9K');
    expect(lanes).toHaveLength(9);
    expect(lanes.every((l) => !l.isScratch)).toBe(true);
    const ids = lanes.map((l) => l.id);
    expect(ids).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('should generate 12 lanes for 10K (SC + 10 keys + SC2)', () => {
    const lanes = generateLaneConfig('10K');
    expect(lanes).toHaveLength(12);
    expect(lanes[0].id).toBe('SC');
    expect(lanes[0].isScratch).toBe(true);
    expect(lanes[11].id).toBe('SC2');
    expect(lanes[11].isScratch).toBe(true);
  });

  it('should generate 12 lanes for 12K (no scratch)', () => {
    const lanes = generateLaneConfig('12K');
    expect(lanes).toHaveLength(12);
    expect(lanes.every((l) => !l.isScratch)).toBe(true);
  });

  it('should generate 18 lanes for 14K (SC + 7 keys + FZ + 7 keys + FZ2 + SC2)', () => {
    const lanes = generateLaneConfig('14K');
    expect(lanes).toHaveLength(18);
    expect(lanes[0].id).toBe('SC');
    expect(lanes[0].isScratch).toBe(true);
    expect(lanes[17].id).toBe('SC2');
    expect(lanes[17].isScratch).toBe(true);
    // Should have FZ and FZ2
    const ids = lanes.map((l) => l.id);
    expect(ids).toContain('FZ');
    expect(ids).toContain('FZ2');
  });

  it('should generate 18 lanes for 18K (no scratch)', () => {
    const lanes = generateLaneConfig('18K');
    expect(lanes).toHaveLength(18);
    expect(lanes.every((l) => !l.isScratch)).toBe(true);
  });

  it('should generate 24 lanes for 24K (no scratch)', () => {
    const lanes = generateLaneConfig('24K');
    expect(lanes).toHaveLength(24);
    expect(lanes.every((l) => !l.isScratch)).toBe(true);
  });

  it('should generate 48 lanes for 48K (no scratch)', () => {
    const lanes = generateLaneConfig('48K');
    expect(lanes).toHaveLength(48);
    expect(lanes.every((l) => !l.isScratch)).toBe(true);
  });

  // =============================================
  // Layout / geometry tests
  // =============================================

  it('should assign contiguous x positions with no gaps', () => {
    for (const mode of ALL_KEY_MODES) {
      const lanes = generateLaneConfig(mode);
      for (let i = 1; i < lanes.length; i++) {
        expect(lanes[i].x).toBe(lanes[i - 1].x + lanes[i - 1].width);
      }
    }
  });

  it('should start x at 0 for all key modes', () => {
    for (const mode of ALL_KEY_MODES) {
      const lanes = generateLaneConfig(mode);
      expect(lanes[0].x).toBe(0);
    }
  });

  it('should have positive widths for all lanes', () => {
    for (const mode of ALL_KEY_MODES) {
      const lanes = generateLaneConfig(mode);
      for (const lane of lanes) {
        expect(lane.width).toBeGreaterThan(0);
      }
    }
  });

  it('should assign originalIndex sequentially from 0', () => {
    for (const mode of ALL_KEY_MODES) {
      const lanes = generateLaneConfig(mode);
      lanes.forEach((lane, i) => {
        expect(lane.originalIndex).toBe(i);
      });
    }
  });

  it('should assign valid hex color strings to every lane', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    for (const mode of ALL_KEY_MODES) {
      const lanes = generateLaneConfig(mode);
      for (const lane of lanes) {
        expect(lane.color).toMatch(hexPattern);
      }
    }
  });

  // =============================================
  // Scratch detection
  // =============================================

  it('should mark only SC and SC2 as scratch lanes', () => {
    for (const mode of ALL_KEY_MODES) {
      const lanes = generateLaneConfig(mode);
      for (const lane of lanes) {
        if (lane.id === 'SC' || lane.id === 'SC2') {
          expect(lane.isScratch).toBe(true);
        } else {
          expect(lane.isScratch).toBe(false);
        }
      }
    }
  });

  // =============================================
  // Determinism / idempotency
  // =============================================

  it('should return the same result on repeated calls (pure function)', () => {
    for (const mode of ALL_KEY_MODES) {
      const first = generateLaneConfig(mode);
      const second = generateLaneConfig(mode);
      expect(first).toEqual(second);
    }
  });
});

describe('getLaneIds', () => {
  it('should return only the id strings for a given key mode', () => {
    const ids = getLaneIds('7K');
    expect(ids).toEqual(['SC', '1', '2', '3', '4', '5', '6', '7', 'FZ']);
  });

  it('should return unique ids for every key mode', () => {
    for (const mode of ALL_KEY_MODES) {
      const ids = getLaneIds(mode);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('should be consistent with generateLaneConfig', () => {
    for (const mode of ALL_KEY_MODES) {
      const ids = getLaneIds(mode);
      const lanes = generateLaneConfig(mode);
      expect(ids).toEqual(lanes.map((l) => l.id));
    }
  });
});

describe('getLaneBackground', () => {
  it('should return a fixed color for scratch lanes', () => {
    const scratchLane = generateLaneConfig('7K')[0]; // SC
    expect(scratchLane.isScratch).toBe(true);
    expect(getLaneBackground(scratchLane)).toBe('#2a1a2a');
  });

  it('should return a valid hex color for non-scratch lanes', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    const lanes = generateLaneConfig('7K');
    for (const lane of lanes) {
      const bg = getLaneBackground(lane);
      expect(bg).toMatch(hexPattern);
    }
  });

  it('should blend lane color at 12% opacity onto base (#1a1a30)', () => {
    // For a white lane (#ffffff):
    // r = round(0x1a + (0xff - 0x1a) * 0.12) = round(26 + 229 * 0.12) = round(26 + 27.48) = 53
    // g = round(0x1a + (0xff - 0x1a) * 0.12) = 53
    // b = round(0x30 + (0xff - 0x30) * 0.12) = round(48 + 207 * 0.12) = round(48 + 24.84) = 73
    const whiteLane = generateLaneConfig('7K').find((l) => l.color === '#ffffff' && !l.isScratch);
    expect(whiteLane).toBeDefined();
    const bg = getLaneBackground(whiteLane!);
    // 53 = 0x35, 73 = 0x49
    expect(bg).toBe('#353549');
  });

  it('should produce different backgrounds for different lane colors', () => {
    const lanes = generateLaneConfig('7K').filter((l) => !l.isScratch && l.id !== 'FZ');
    const backgrounds = new Set(lanes.map((l) => getLaneBackground(l)));
    // 7K has alternating white and blue keys, so at least 2 distinct backgrounds
    expect(backgrounds.size).toBeGreaterThanOrEqual(2);
  });
});
