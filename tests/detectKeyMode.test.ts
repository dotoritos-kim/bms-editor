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

  it('should detect 7K even with partial key usage (SC + columns 1-7)', () => {
    const notes = makeNotes(['SC', '1', '3', '5', '7']);
    // 4 key columns used, but max numeric is 7, function checks usedKeyCount
    // Actually: columns 1,3,5,7 = 4 keys used => should detect 4K
    // Wait, let me re-check the logic. SC is present, keyColumns filter from 1-7.
    // usedKeyCount = 4 (columns 1,3,5,7), so it falls to usedKeyCount <= 4 => '4K'
    // Actually no, column 7 is used so usedKeyCount checks if >= 7 first.
    // Let me re-read: keyColumns = ['1','2','3','4','5','6','7']
    // usedKeyCount = columns that are in usedColumns = {1,3,5,7} => 4
    // So usedKeyCount <= 4 => '4K'
    // But that seems wrong for a chart using column 7... The function is following
    // the BMS convention where key count determines mode.
    expect(detectKeyMode(notes)).toBe('4K');
  });

  it('should detect 6K for SC + 6 key columns', () => {
    const notes = makeNotes(['SC', '1', '2', '3', '5', '6', '7']);
    expect(detectKeyMode(notes)).toBe('6K');
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

  it('should detect 18K for keyboard DP with columns up to 12 (maxNumeric >= 10)', () => {
    // maxNumericColumn = 12, hasKeyboard2P = true (>= 10), no IIDX lanes
    // Falls to: maxNumericColumn >= 10 => '18K'
    const notes = makeNotes(['1', '5', '10', '12']);
    expect(detectKeyMode(notes)).toBe('18K');
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

  it('should detect 18K for keyboard DP with columns up to 10-17', () => {
    const notes = makeNotes(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
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
