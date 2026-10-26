/**
 * useBmsChart Hook
 *
 * Hook that loads and parses a BMS file and provides chart information.
 */

import { useState, useCallback } from 'react';
import { BMSParser, BMSNote, Positioning, Timing } from '@rhythm-archive/bms-core';
import type { ISongInfoData } from '@rhythm-archive/bms-core';
import type { KeyMode } from './NoteChartViewer';
import { getErrorMessage } from '../utils';

/** BPM change event */
export interface BpmChange {
  beat: number;
  bpm: number;
}

/** STOP event */
export interface StopEvent {
  beat: number;
  /** Stop duration (beats) */
  duration: number;
}

/** Scroll speed change event */
export interface ScrollSpeedChange {
  beat: number;
  /** Scroll speed multiplier (1.0 = default) */
  speed: number;
}

export interface BmsChartInfo {
  /** Song info */
  songInfo: ISongInfoData | null;
  /** Parsed notes array */
  notes: BMSNote[];
  /** Key mode */
  keyMode: KeyMode;
  /** Total beat count */
  totalBeats: number;
  /** BPM info */
  bpm: {
    initial: number;
    min: number;
    max: number;
  };
  /** BPM change list */
  bpmChanges: BpmChange[];
  /** LN type */
  lnType: number;
  /** Note statistics */
  stats: {
    total: number;
    scratch: number;
    longNotes: number;
    landmines: number;
    invisible: number;
  };
  /** STOP info */
  stops: StopEvent[];
  /** Scroll speed change info */
  scrollChanges: ScrollSpeedChange[];
  /** Preview/background audio file path */
  previewAudio: string | null;
  /** Keysound mapping (ID -> filename) */
  keysounds: Record<string, string>;
  /** Positioning object (for scroll position calculation) */
  positioning: Positioning | null;
  /** Timing object (for time-to-beat conversion) */
  timing: Timing | null;
}

export interface UseBmsChartOptions {
  /** Base URL */
  baseUrl: string;
  /** BMS file path */
  bmsPath?: string;
}

export interface UseBmsChartState {
  /** Chart info */
  chart: BmsChartInfo | null;
  /** Loading state */
  isLoading: boolean;
  /** Error */
  error: string | null;
  /** Whether loading is complete */
  isLoaded: boolean;
}

export interface UseBmsChartControls {
  /** Load chart */
  load: (path?: string) => Promise<void>;
  /** Reset */
  reset: () => void;
}

export type UseBmsChartReturn = [UseBmsChartState, UseBmsChartControls];

/**
 * Detect key mode from channels.
 * Analyzes the columns used by notes and returns the appropriate key mode.
 *
 * Detection priority:
 * 1. Header extension commands (#KEYMODE, Qwilight #4K / #6K / #8K)
 * 2. DP (whether 2P columns are used)
 * 3. Keyboard style (only numeric columns, no SC/FZ)
 * 4. IIDX style (includes SC/FZ)
 *
 * 4K/6K/8K (the U_E / Yuipack modes) are told apart only by their value-less
 * extension commands, as Qwilight does: without one, the same channels are a
 * 5K/7K chart.
 */
export function detectKeyMode(
  notes: BMSNote[],
  headers?: { get: (key: string) => string | undefined; has?: (key: string) => boolean },
): KeyMode {
  // Check header extension commands (#4K, #6K, #8K, #KEYMODE)
  if (headers) {
    // Qwilight counts #4K / #6K / #8K only without a value ("#6K 1" is not the
    // command); get() is then undefined or empty, has() tells it from absent
    const command = (key: string) => {
      const value = headers.get(key);
      return !value && (headers.has ? headers.has(key) : value !== undefined);
    };
    if (command('4k')) return '4K';
    if (command('6k')) return '6K';
    if (command('8k')) return '8K';
    const keymode = headers.get('keymode');
    if (keymode) {
      const km = keymode.trim().toUpperCase();
      const valid: KeyMode[] = ['4K','5K','6K','7K','8K','9K','10K','12K','14K','18K','24K','48K'];
      if (valid.includes(km as KeyMode)) return km as KeyMode;
    }
  }
  const usedColumns = new Set<string>();

  for (const note of notes) {
    if (note.column) {
      usedColumns.add(note.column);
    }
  }

  // Empty chart with no notes → return the most common mode 7K
  if (usedColumns.size === 0) return '7K';

  // Check for high column numbers (for keyboard modes like 24K, 48K)
  const maxNumericColumn = Array.from(usedColumns)
    .filter(col => /^\d+$/.test(col))
    .map(col => parseInt(col, 10))
    .reduce((max, num) => Math.max(max, num), 0);

  // Scratch/FZ detection (IIDX style indicators)
  const hasScratch = usedColumns.has('SC');
  const hasScratch2 = usedColumns.has('SC2');
  const hasFZ = usedColumns.has('FZ');
  const hasFZ2 = usedColumns.has('FZ2');
  const hasIIDXSpecialLanes = hasScratch || hasScratch2 || hasFZ || hasFZ2;

  // 2P side columns for DP detection
  // For IIDX DP: columns 10-14, SC2, FZ2 (columns 8-9 are ambiguous — could be 8K/9K SP)
  // For Keyboard DP: columns 10+
  const iidxDP2PColumns = ['10', '11', '12', '13', '14', 'SC2', 'FZ2'];
  const hasIIDX2P = iidxDP2PColumns.some(col => usedColumns.has(col));
  const hasKeyboard2P = maxNumericColumn >= 10;  // Keyboard DP uses columns 10+

  // ============================================
  // DP (Double Play) modes
  // ============================================
  if (hasIIDX2P || hasKeyboard2P) {
    // IIDX DP style (uses SC/SC2): 14K or 10K
    // In IIDX DP, columns 8-14 are the 2P side (7 keys + scratch)
    if (hasIIDXSpecialLanes) {
      // 14K: 7 keys + scratch each side (uses columns 6, 7, 13, 14)
      if (usedColumns.has('6') || usedColumns.has('7') || usedColumns.has('13') || usedColumns.has('14')) {
        return '14K';
      }
      // 10K: 5 keys + scratch each side
      return '10K';
    }

    // Keyboard DP style (no SC): determined by column number + actual column count used
    const usedNumericColumns = Array.from(usedColumns).filter(col => /^\d+$/.test(col));
    const numericCount = usedNumericColumns.length;

    // 48K: keyboard DP (24 keys each side)
    if (maxNumericColumn >= 24) return '48K';

    // 24K: keyboard DP (columns up to 24, 12 per side)
    if (maxNumericColumn >= 18) return '24K';

    if (maxNumericColumn >= 10) {
      // Detect IIDX DP gap pattern: if columns 6 and 7 are absent, it's IIDX DP style
      // (In IIDX DP: 1P=1-5, 2P=8-12; columns 6,7 are only used in 7K)
      const hasCol6or7 = usedColumns.has('6') || usedColumns.has('7');
      if (!hasCol6or7 && numericCount <= 10) return '10K';

      // Determine based on actual number of columns used
      if (numericCount <= 12) return '12K';
      return '18K';
    }

    // 12K: keyboard 6 keys each side (no scratch)
    return '12K';
  }

  // ============================================
  // SP (Single Play) modes
  // ============================================

  // IIDX SP style (uses SC/FZ)
  if (hasIIDXSpecialLanes) {
    if (usedColumns.has('6') || usedColumns.has('7')) return '7K';

    // Standard 5K: SC+1-5+FZ
    return '5K';
  }

  // Keyboard SP style (no SC): determined by column number
  // 48K SP (keyboard)
  if (maxNumericColumn >= 24) return '48K';

  // 24K SP (keyboard) - columns 1-24
  if (maxNumericColumn >= 12) return '24K';

  // 9K: PMS style, or keyboard 8-9 keys (lanes 1-9)
  if (maxNumericColumn >= 8 || usedColumns.has('9')) return '9K';

  // 4K/6K/8K need their extension command (handled above); without one the
  // keys fit the 5K / 7K lanes
  if (maxNumericColumn >= 6) return '7K';
  return '5K';
}

/**
 * Calculate total beat count.
 */
function calculateTotalBeats(notes: BMSNote[]): number {
  let maxBeat = 0;
  for (const note of notes) {
    const endBeat = note.endBeat ?? note.beat;
    if (endBeat > maxBeat) maxBeat = endBeat;
  }
  return Math.ceil(maxBeat) + 4;
}

/**
 * Calculate note statistics.
 */
function calculateStats(notes: BMSNote[]) {
  let total = 0;
  let scratch = 0;
  let longNotes = 0;
  let landmines = 0;
  let invisible = 0;

  for (const note of notes) {
    if (!note.column) continue;

    const noteType = note.noteType || 'playable';

    // Count by note type
    if (noteType === 'landmine') {
      landmines++;
    } else if (noteType === 'invisible') {
      invisible++;
    } else if (noteType === 'playable') {
      total++;

      if (note.column === 'SC' || note.column === 'SC2') {
        scratch++;
      }

      if (note.endBeat !== undefined) {
        longNotes++;
      }
    }
  }

  return { total, scratch, longNotes, landmines, invisible };
}

/**
 * Hook for loading and parsing a BMS chart.
 */
export function useBmsChart(options: UseBmsChartOptions): UseBmsChartReturn {
  const { baseUrl, bmsPath: initialPath } = options;

  const [state, setState] = useState<UseBmsChartState>({
    chart: null,
    isLoading: false,
    error: null,
    isLoaded: false,
  });

  const load = useCallback(async (path?: string) => {
    const bmsPath = path || initialPath;
    if (!bmsPath) {
      setState(prev => ({
        ...prev,
        error: 'No BMS file path provided',
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const parser = new BMSParser();

      // Load BMS file - Use query parameter for files with special characters to avoid reverse proxy issues
      const hasSpecialChars = /[#[\]%]/.test(bmsPath);
      const url = hasSpecialChars
        ? `${baseUrl}?path=${encodeURIComponent(bmsPath)}`
        : `${baseUrl}/${bmsPath.split('/').map(segment => encodeURIComponent(segment)).join('/')}`;
      const bmsContent = await parser.fetchFromUrl(url);

      // Parse (debug logs are printed by compiler)
      const chart = parser.compileString(bmsContent);
      const songInfo = parser.getSongInfo();
      const notesObj = parser.getNotes();

      if (!notesObj) {
        throw new Error('Failed to parse notes');
      }

      const notes = notesObj.all();

      // Extract BPM info
      const bpmHeader = chart.headers.get('bpm');
      const initialBpm = bpmHeader ? parseFloat(bpmHeader) : 130;
      let minBpm = initialBpm;
      let maxBpm = initialBpm;

      // Collect BPM change events
      const bpmChanges: BpmChange[] = [];
      const objects = chart.objects.allSorted();

      for (const obj of objects) {
        // Channel 03: direct hex BPM value
        if (obj.channel === '03') {
          const bpmValue = parseInt(obj.value, 16);
          if (!isNaN(bpmValue) && bpmValue > 0) {
            const beat = chart.measureToBeat(obj.measure, obj.fraction);
            bpmChanges.push({ beat, bpm: bpmValue });
            if (bpmValue < minBpm) minBpm = bpmValue;
            if (bpmValue > maxBpm) maxBpm = bpmValue;
          }
        }
        // Channel 08: #BPMxx reference
        else if (obj.channel === '08') {
          // #EXBPMxx is an alias of #BPMxx (#BPMxx wins when both exist)
          const bpmValue = parseFloat(chart.headers.get('bpm' + obj.value) ?? chart.headers.get('exbpm' + obj.value) ?? '');
          if (!isNaN(bpmValue) && bpmValue > 0) {
            const beat = chart.measureToBeat(obj.measure, obj.fraction);
            bpmChanges.push({ beat, bpm: bpmValue });
            if (bpmValue < minBpm) minBpm = bpmValue;
            if (bpmValue > maxBpm) maxBpm = bpmValue;
          }
        }
      }

      // Additional BPM range check from headers
      chart.headers.each((key, value) => {
        if (key.toLowerCase().startsWith('bpm') && key.toLowerCase() !== 'bpm') {
          const bpmValue = parseFloat(value);
          if (!isNaN(bpmValue)) {
            if (bpmValue < minBpm) minBpm = bpmValue;
            if (bpmValue > maxBpm) maxBpm = bpmValue;
          }
        }
      });

      // Check LN type
      const lnTypeHeader = chart.headers.get('lntype');
      const lnType = lnTypeHeader ? parseInt(lnTypeHeader) : 1;

      // Collect STOP info (channel 09)
      const stops: StopEvent[] = [];
      for (const obj of objects) {
        if (obj.channel === '09') {
          // STOP value references the #STOPxx header
          const stopHeader = chart.headers.get('stop' + obj.value);
          if (stopHeader) {
            // STOP value is in 1/192 whole-note units = 1/48 beat (negative values
            // supported - minus-stop gimmick). Same conversion as bms-core Timing.
            const stopValue = parseInt(stopHeader, 10) / 48;
            if (!isNaN(stopValue) && stopValue !== 0) {
              stops.push({
                beat: chart.measureToBeat(obj.measure, obj.fraction),
                duration: stopValue,
              });
            }
          }
        }
      }

      // Collect scroll speed changes (channel SC or header-based)
      const scrollChanges: ScrollSpeedChange[] = [];
      for (const obj of objects) {
        // Channel SC: scroll speed change (used in some BMS files)
        if (obj.channel.toUpperCase() === 'SC') {
          const scrollHeader = chart.headers.get('scroll' + obj.value);
          if (scrollHeader) {
            const scrollValue = parseFloat(scrollHeader);
            if (!isNaN(scrollValue)) {
              scrollChanges.push({
                beat: chart.measureToBeat(obj.measure, obj.fraction),
                speed: scrollValue,
              });
            }
          }
        }
      }

      // Additionally check if #SCROLL headers are defined
      chart.headers.each((key, _value) => {
        if (key.toLowerCase().startsWith('scroll') && key.toLowerCase() !== 'scroll') {
          // Some BMS files define SCROLL01, SCROLL02 format
          // The actual scroll values used are referenced from channels
        }
      });

      // Extract preview/background audio file
      // Check #PREVIEW header or #WAV01 (common background music slot)
      let previewAudio: string | null = null;
      const previewHeader = chart.headers.get('preview');
      if (previewHeader) {
        previewAudio = previewHeader;
      } else {
        // WAV01 is commonly used as the background music
        const wav01 = chart.headers.get('wav01');
        if (wav01) {
          previewAudio = wav01;
        }
      }

      // Extract keysound mapping
      const keysounds: Record<string, string> = {};
      chart.headers.each((key, value) => {
        const match = key.match(/^wav(\S\S)$/i);
        if (match) {
          keysounds[match[1].toLowerCase()] = value;
        }
      });

      // Create Timing and Positioning objects (scroll gimmick support)
      const timing = Timing.fromBMSChart(chart);
      const positioning = Positioning.fromBMSChart(chart, timing);

      // Debug: compare WAV definitions vs note keysound IDs
      if (import.meta.env.DEV) {
        const wavIds = Object.keys(keysounds);
        const noteKeysoundIds = [...new Set(notes.filter(n => n.keysound).map(n => n.keysound!.toLowerCase()))];

        // Find note keysound IDs with no matching WAV definition
        const missingWavDefs = noteKeysoundIds.filter(id => !keysounds[id]);
        const unusedWavDefs = wavIds.filter(id => !noteKeysoundIds.includes(id));

        if (missingWavDefs.length > 0 || unusedWavDefs.length > 0) {
          console.group('[useBmsChart] WAV Definition Analysis');
          console.log(`Total WAV definitions: ${wavIds.length}`);
          console.log(`Unique keysound IDs in notes: ${noteKeysoundIds.length}`);

          if (missingWavDefs.length > 0) {
            console.warn(`⚠️ Notes reference ${missingWavDefs.length} keysounds with NO WAV definition`);
            console.warn(`Missing IDs: [${missingWavDefs.slice(0, 20).join(', ')}]${missingWavDefs.length > 20 ? '...' : ''}`);
          }

          if (unusedWavDefs.length > 0) {
            console.log(`ℹ️ ${unusedWavDefs.length} WAV definitions not used by any note`);
          }

          // Analyze ID format
          const numericWavIds = wavIds.filter(id => /^\d+$/.test(id));
          const alphaWavIds = wavIds.filter(id => /[a-z]/i.test(id));
          const numericNoteIds = noteKeysoundIds.filter(id => /^\d+$/.test(id));
          const alphaNoteIds = noteKeysoundIds.filter(id => /[a-z]/i.test(id));

          console.log(`WAV IDs: ${numericWavIds.length} numeric, ${alphaWavIds.length} alphanumeric`);
          console.log(`Note keysound IDs: ${numericNoteIds.length} numeric, ${alphaNoteIds.length} alphanumeric`);

          // Warn on pattern mismatch
          if (numericWavIds.length > 0 && alphaWavIds.length === 0 && alphaNoteIds.length > 0) {
            console.error('❌ MISMATCH: WAV definitions are numeric-only but notes use alphanumeric IDs');
            console.error('This may indicate a BMS parsing issue or unsupported BMS format');
          }

          console.groupEnd();
        }
      }

      const chartInfo: BmsChartInfo = {
        songInfo: songInfo ? {
          title: songInfo.title,
          subtitles: songInfo.subtitles,
          artist: songInfo.artist,
          subartists: songInfo.subartists,
          genre: songInfo.genre,
          difficulty: songInfo.difficulty,
          level: songInfo.level,
        } : null,
        notes,
        keyMode: detectKeyMode(notes, chart.headers),
        totalBeats: calculateTotalBeats(notes),
        bpm: {
          initial: initialBpm,
          min: minBpm,
          max: maxBpm,
        },
        bpmChanges,
        lnType,
        stats: calculateStats(notes),
        stops,
        scrollChanges,
        previewAudio,
        keysounds,
        positioning,
        timing,
      };

      setState({
        chart: chartInfo,
        isLoading: false,
        error: null,
        isLoaded: true,
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to load chart');
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: message,
        isLoaded: false,
      }));
    }
  }, [baseUrl, initialPath]);

  const reset = useCallback(() => {
    setState({
      chart: null,
      isLoading: false,
      error: null,
      isLoaded: false,
    });
  }, []);

  return [state, { load, reset }];
}
