import { describe, it, expect } from 'vitest';
import { detectKeyMode } from '../src/chart/useBmsChart';
import type { BMSNote } from '@rhythm-archive/bms-core';

/** Helper to create minimal BMSNote objects for testing */
function makeNotes(columns: string[]): BMSNote[] {
  return columns.map((column, i) => ({
    beat: i,
    column,
    keysound: '01',
  }));
}

/** Helper to create a mock headers object */
function makeHeaders(entries: Record<string, string>) {
  return {
    get(key: string) {
      return entries[key] ?? entries[key.toLowerCase()] ?? undefined;
    },
  };
}

describe('detectKeyMode', () => {
  // =============================================
  // Empty / edge cases
  // =============================================

  it('should return 7K for empty notes array', () => {
    expect(detectKeyMode([])).toBe('7K');
  });

  it('should return 7K for notes without columns', () => {
    const notes: BMSNote[] = [
      { beat: 0, keysound: '01' },
      { beat: 1, keysound: '02' },
    ];
    expect(detectKeyMode(notes)).toBe('7K');
  });

  // =============================================
  // Header-based detection (#6K, #4K)
  // =============================================

  it('should detect 6K from header extension command', () => {
    const notes = makeNotes(['1', '2', '3']);
    const headers = makeHeaders({ '6K': '1', '6k': '1' });
    expect(detectKeyMode(notes, headers)).toBe('6K');
  });

  it('should detect 4K from header extension command', () => {
    const notes = makeNotes(['1', '2']);
    const headers = makeHeaders({ '4K': '1', '4k': '1' });
    expect(detectKeyMode(notes, headers)).toBe('4K');
  });

  it('should prioritize 6K header over 4K header', () => {
    const notes = makeNotes(['1', '2']);
    const headers = makeHeaders({ '6K': '1', '4K': '1', '6k': '1', '4k': '1' });
    expect(detectKeyMode(notes, headers)).toBe('6K');
  });

  // =============================================
  // IIDX SP modes (with SC/FZ)
  // =============================================

  it('should detect 7K for SC + 7 keys + FZ', () => {
    const notes = makeNotes(['SC', '1', '2', '3', '4', '5', '6', '7', 'FZ']);
    expect(detectKeyMode(notes)).toBe('7K');
  });

  it('should detect 5K for SC + 5 keys', () => {
    const notes = makeNotes(['SC', '1', '2', '3', '4', '5']);
    expect(detectKeyMode(notes)).toBe('5K');
  });

  it('should detect 7K when SC present and column 6 or 7 used (partial usage)', () => {
    const notes = makeNotes(['SC', '1', '3', '5', '7']);
    // IIDX: column 7 exists (from channel 19) → must be 7K
    expect(detectKeyMode(notes)).toBe('7K');
  });

  it('should detect 6K (에리팩) for SC + 1,2,3,5,6,7 without col 4 (no header needed)', () => {
    // SC+1,2,3,5,6,7+FZ with col 4 absent = 에리팩 스타일 6K — detectable without header
    const notes = makeNotes(['SC', '1', '2', '3', '5', '6', '7']);
    expect(detectKeyMode(notes)).toBe('6K');
  });

  it('should detect 6K for SC + 6 key columns with #6K header', () => {
    const notes = makeNotes(['SC', '1', '2', '3', '5', '6', '7']);
    const headers = makeHeaders({ '6K': '1', '6k': '1' });
    expect(detectKeyMode(notes, headers)).toBe('6K');
  });

  it('should detect 7K for SC + columns 6/7 when col 4 is also present', () => {
    // col 4 present → not 에리팩 → 7K
    const notes = makeNotes(['SC', '1', '2', '3', '4', '5', '6', '7']);
    expect(detectKeyMode(notes)).toBe('7K');
  });

  it('should detect 4K (유이팩) for SC + 1,2,4,5 without col 3 (no header needed)', () => {
    // SC+1,2,4,5+FZ with col 3 absent = 유이팩 스타일 4K — detectable without header
    const notes = makeNotes(['SC', '1', '2', '4', '5']);
    expect(detectKeyMode(notes)).toBe('4K');
  });

  it('should detect 5K for SC + 1,2,3,4,5 (standard 5K, not 유이팩)', () => {
    // col 3 present → not 유이팩 → 5K
    const notes = makeNotes(['SC', '1', '2', '3', '4', '5']);
    expect(detectKeyMode(notes)).toBe('5K');
  });

  // =============================================
  // IIDX DP modes (with 2P columns)
  // =============================================

  it('should detect 14K for DP with columns 1-7 and SC + SC2', () => {
    const notes = makeNotes(['SC', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', 'SC2']);
    expect(detectKeyMode(notes)).toBe('14K');
  });

  it('should detect 10K for DP with columns 1-5 and SC + SC2', () => {
    const notes = makeNotes(['SC', '1', '2', '3', '4', '5', '8', '9', '10', 'SC2']);
    expect(detectKeyMode(notes)).toBe('10K');
  });

  // =============================================
  // Keyboard SP modes (no scratch)
  // =============================================

  it('should detect 8K for 8 numeric columns', () => {
    const notes = makeNotes(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(detectKeyMode(notes)).toBe('8K');
  });

  it('should detect 9K for 9 numeric columns', () => {
    const notes = makeNotes(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(detectKeyMode(notes)).toBe('9K');
  });

  it('should detect 10K for sparse IIDX DP gap pattern (no col 6/7, ≤10 columns)', () => {
    // maxNumericColumn = 12, no cols 6/7, numericCount = 4 (≤10) → IIDX DP gap → 10K
    const notes = makeNotes(['1', '5', '10', '12']);
    expect(detectKeyMode(notes)).toBe('10K');
  });

  it('should detect 12K for keyboard DP with col 6 or 7 present (≤12 columns)', () => {
    // Has col 6 → keyboard style, not IIDX gap → 12K
    const notes = makeNotes(['1', '5', '6', '10', '12']);
    expect(detectKeyMode(notes)).toBe('12K');
  });

  it('should detect 24K for columns up to 18+', () => {
    const notes = makeNotes(['1', '5', '10', '18']);
    expect(detectKeyMode(notes)).toBe('24K');
  });

  it('should detect 48K for columns up to 24+', () => {
    const notes = makeNotes(['1', '10', '24']);
    expect(detectKeyMode(notes)).toBe('48K');
  });

  // =============================================
  // Keyboard DP modes
  // =============================================

  it('should detect 12K for keyboard DP with columns 1-10 (≤12 columns, has col 6/7)', () => {
    // 10 numeric columns with cols 6, 7 present → keyboard style, not IIDX gap → 12K
    const notes = makeNotes(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(detectKeyMode(notes)).toBe('12K');
  });

  it('should detect 10K for IIDX DP gap pattern without SC (cols 1-5, 8-12, no 6/7)', () => {
    // IIDX DP 10K without scratch notes: columns 1-5 + 8-12, gap at 6,7
    const notes = makeNotes(['1', '2', '3', '4', '5', '8', '9', '10', '11', '12']);
    expect(detectKeyMode(notes)).toBe('10K');
  });

  it('should detect 10K for partial IIDX DP gap pattern (fewer columns, no 6/7)', () => {
    // Only some 1P + 2P columns used, still IIDX gap pattern
    const notes = makeNotes(['1', '3', '5', '8', '10']);
    expect(detectKeyMode(notes)).toBe('10K');
  });

  it('should detect 18K for keyboard DP with > 12 numeric columns', () => {
    // 14 numeric columns → 18K
    const notes = makeNotes(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14']);
    expect(detectKeyMode(notes)).toBe('18K');
  });

  it('should detect 24K for keyboard DP with columns reaching 18', () => {
    const notes = makeNotes(['1', '5', '10', '18']);
    expect(detectKeyMode(notes)).toBe('24K');
  });

  // =============================================
  // 7+1 structure-based 6K/4K detection (no SC)
  // =============================================

  it('should detect 4K for columns 1,2,4,5 without SC (7+1 structure)', () => {
    const notes = makeNotes(['1', '2', '4', '5']);
    expect(detectKeyMode(notes)).toBe('4K');
  });

  it('should detect 6K for columns 1,2,3,5,6,7 without column 4 or SC', () => {
    const notes = makeNotes(['1', '2', '3', '5', '6', '7']);
    expect(detectKeyMode(notes)).toBe('6K');
  });

  it('should detect 7K for all columns 1-7 without SC', () => {
    const notes = makeNotes(['1', '2', '3', '4', '5', '6', '7']);
    expect(detectKeyMode(notes)).toBe('7K');
  });

  it('should detect 5K for columns 1-5 without SC', () => {
    const notes = makeNotes(['1', '2', '3', '4', '5']);
    expect(detectKeyMode(notes)).toBe('5K');
  });

  // =============================================
  // Minimal usage
  // =============================================

  it('should detect 4K for minimal keyboard usage (columns 1-2)', () => {
    const notes = makeNotes(['1', '2']);
    expect(detectKeyMode(notes)).toBe('4K');
  });

  it('should handle notes with only BGM column (no column string)', () => {
    const notes: BMSNote[] = [
      { beat: 0, keysound: '01', noteType: 'bgm' },
      { beat: 1, keysound: '02', noteType: 'bgm' },
    ];
    // column is undefined, so usedColumns is empty => 7K fallback
    expect(detectKeyMode(notes)).toBe('7K');
  });
});
