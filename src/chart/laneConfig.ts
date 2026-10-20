/**
 * Shared lane configuration for BMS chart editor and viewer.
 * Defines lane layout per key mode (column positions, widths, colors).
 */

import type { KeyMode } from './NoteChartViewer';

/** Lane configuration */
export interface LaneConfig {
  id: string;
  x: number;
  width: number;
  color: string;
  isScratch: boolean;
  isBgm: boolean;
  originalIndex: number;
}

/** Preferred (maximum) width of a single BGM lane in world px. */
export const BGM_LANE_MAX_WIDTH = 30;
/** Minimum width of a single BGM lane in world px. */
export const BGM_LANE_MIN_WIDTH = 8;
/**
 * Width budget for the whole BGM area. Up to 16 lanes keep the full 30px width;
 * beyond that the lanes shrink so that many simultaneous BGM notes (e.g. 40 BGM
 * notes on one tick) do not blow up the content width and squeeze the playable
 * lanes to a few pixels via the fit-to-width camera zoom.
 */
export const BGM_AREA_TARGET_WIDTH = 480;

/** Per-lane BGM width for a given BGM lane count: clamp(480 / n, 8, 30). */
export function getBgmLaneWidth(numBgmLanes: number): number {
  if (numBgmLanes <= 0) return BGM_LANE_MAX_WIDTH;
  return Math.max(BGM_LANE_MIN_WIDTH, Math.min(BGM_LANE_MAX_WIDTH, BGM_AREA_TARGET_WIDTH / numBgmLanes));
}

/** Generate lane configuration for a given key mode */
export function generateLaneConfig(keyMode: KeyMode, bgmChannelCount?: number): LaneConfig[] {
  const LANE_CONFIGS: Record<
    KeyMode,
    {
      lanes: string[];
      colors: Record<string, string>;
      laneWidth: number;
      scratchWidth: number;
    }
  > = {
    '4K': {
      lanes: ['SC', '1', '2', '4', '5', 'FZ'],
      colors: {
        SC: '#ff3366',
        '1': '#ffffff',
        '2': '#3399ff',
        '4': '#ffffff',
        '5': '#3399ff',
        FZ: '#888888',
      },
      laneWidth: 35,
      scratchWidth: 35,
    },
    '5K': {
      lanes: ['SC', '1', '2', '3', '4', '5', 'FZ'],
      colors: {
        SC: '#ff3366',
        '1': '#ffffff',
        '2': '#3399ff',
        '3': '#ffffff',
        '4': '#3399ff',
        '5': '#ffffff',
        FZ: '#888888',
      },
      laneWidth: 31,
      scratchWidth: 35,
    },
    '6K': {
      lanes: ['SC', '1', '2', '3', '5', '6', '7', 'FZ'],
      colors: {
        SC: '#ff3366',
        '1': '#ffffff',
        '2': '#3399ff',
        '3': '#ffffff',
        '5': '#3399ff',
        '6': '#ffffff',
        '7': '#3399ff',
        FZ: '#888888',
      },
      laneWidth: 28,
      scratchWidth: 31,
    },
    '7K': {
      lanes: ['SC', '1', '2', '3', '4', '5', '6', '7', 'FZ'],
      colors: {
        SC: '#ff3366',
        '1': '#ffffff',
        '2': '#3399ff',
        '3': '#ffffff',
        '4': '#3399ff',
        '5': '#ffffff',
        '6': '#3399ff',
        '7': '#ffffff',
        FZ: '#888888',
      },
      laneWidth: 25,
      scratchWidth: 31,
    },
    '8K': {
      lanes: ['1', '2', '3', '4', '5', '6', '7', '8'],
      colors: {
        '1': '#ff6b6b',
        '2': '#ffd93d',
        '3': '#6bcb77',
        '4': '#4d96ff',
        '5': '#4d96ff',
        '6': '#6bcb77',
        '7': '#ffd93d',
        '8': '#ff6b6b',
      },
      laneWidth: 25,
      scratchWidth: 0,
    },
    '9K': {
      lanes: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
      colors: {
        '1': '#ff6b6b',
        '2': '#ffd93d',
        '3': '#6bcb77',
        '4': '#4d96ff',
        '5': '#e056fd',
        '6': '#4d96ff',
        '7': '#6bcb77',
        '8': '#ffd93d',
        '9': '#ff6b6b',
      },
      laneWidth: 24,
      scratchWidth: 0,
    },
    '10K': {
      // 2P keys use columns 8-12 (bms-core IIDX DP mapping: channels 21-25),
      // so a 10K chart's 2P notes land on visible lanes and save to 21-25.
      lanes: ['SC', '1', '2', '3', '4', '5', '8', '9', '10', '11', '12', 'SC2'],
      colors: {
        SC: '#ff3366',
        '1': '#ffffff',
        '2': '#3399ff',
        '3': '#ffffff',
        '4': '#3399ff',
        '5': '#ffffff',
        '8': '#ffffff',
        '9': '#3399ff',
        '10': '#ffffff',
        '11': '#3399ff',
        '12': '#ffffff',
        SC2: '#ff3366',
      },
      laneWidth: 18,
      scratchWidth: 28,
    },
    '12K': {
      lanes: Array.from({ length: 12 }, (_, i) => (i + 1).toString()),
      colors: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [
          (i + 1).toString(),
          ['#ff6b6b', '#4ecdc4', '#ffe66d', '#ffe66d', '#4ecdc4', '#ff6b6b'][i % 6],
        ])
      ),
      laneWidth: 18,
      scratchWidth: 0,
    },
    '14K': {
      lanes: ['SC', '1', '2', '3', '4', '5', '6', '7', 'FZ', '8', '9', '10', '11', '12', '13', '14', 'FZ2', 'SC2'],
      colors: {
        SC: '#ff3366', '1': '#ffffff', '2': '#3399ff', '3': '#ffffff',
        '4': '#3399ff', '5': '#ffffff', '6': '#3399ff', '7': '#ffffff',
        FZ: '#888888', '8': '#ffffff', '9': '#3399ff', '10': '#ffffff',
        '11': '#3399ff', '12': '#ffffff', '13': '#3399ff', '14': '#ffffff',
        FZ2: '#888888', SC2: '#ff3366',
      },
      laneWidth: 14,
      scratchWidth: 25,
    },
    '18K': {
      lanes: Array.from({ length: 18 }, (_, i) => (i + 1).toString()),
      colors: Object.fromEntries(
        Array.from({ length: 18 }, (_, i) => [
          (i + 1).toString(),
          ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#e056fd', '#4d96ff', '#6bcb77', '#ffd93d', '#ff6b6b'][i % 9],
        ])
      ),
      laneWidth: 13,
      scratchWidth: 0,
    },
    '24K': {
      lanes: Array.from({ length: 24 }, (_, i) => (i + 1).toString()),
      colors: Object.fromEntries(
        Array.from({ length: 24 }, (_, i) => [(i + 1).toString(), i % 2 === 0 ? '#ffffff' : '#6688aa'])
      ),
      laneWidth: 10,
      scratchWidth: 0,
    },
    '48K': {
      lanes: Array.from({ length: 48 }, (_, i) => (i + 1).toString()),
      colors: Object.fromEntries(
        Array.from({ length: 48 }, (_, i) => [(i + 1).toString(), i % 2 === 0 ? '#ffffff' : '#6688aa'])
      ),
      laneWidth: 5,
      scratchWidth: 0,
    },
  };

  const BGM_GAP = 6;

  const config = LANE_CONFIGS[keyMode];
  let x = 0;

  const lanes = config.lanes.map((id, index) => {
    const isScratch = id === 'SC' || id === 'SC2';
    const width = isScratch ? config.scratchWidth : config.laneWidth;
    const lane: LaneConfig = {
      id,
      x,
      width,
      color: config.colors[id] || '#ffffff',
      isScratch,
      isBgm: false,
      originalIndex: index,
    };
    x += width;
    return lane;
  });

  // BGM lanes at the right end (with gap).
  // bgmChannelCount === undefined → 0 lanes (playable structure only — used by tests
  // and by callers that filter out BGM via getLaneIds).
  // bgmChannelCount === N (>= 0) → exactly N lanes.
  const numBgmLanes = Math.max(0, bgmChannelCount ?? 0);
  if (numBgmLanes > 0) {
    const bgmLaneWidth = getBgmLaneWidth(numBgmLanes);
    const bgmColors = ['#666666', '#7a6655', '#556677', '#667755', '#775566', '#557766', '#665577', '#776655'];
    x += BGM_GAP;
    for (let ch = 0; ch < numBgmLanes; ch++) {
      lanes.push({
        id: ch === 0 ? 'BGM' : `BGM${ch}`,
        x,
        width: bgmLaneWidth,
        color: bgmColors[ch % bgmColors.length],
        isScratch: false,
        isBgm: true,
        originalIndex: lanes.length,
      });
      x += bgmLaneWidth;
    }
  }

  return lanes;
}

/** Return lane ID list for a key mode (excluding BGM lanes — playable lanes only) */
export function getLaneIds(keyMode: KeyMode): string[] {
  return generateLaneConfig(keyMode).filter((l) => !l.isBgm).map((l) => l.id);
}

/** Return the 1P/2P split index for DP modes (divider position). Returns null for SP modes. */
export function getDpSplitIndex(keyMode: KeyMode): number | null {
  switch (keyMode) {
    case '10K': return 6;  // SC,1-5 | 8-12,SC2
    case '12K': return 6;  // 1-6 | 7-12
    case '14K': return 9;  // SC,1-7,FZ | 8-14,FZ2,SC2
    case '18K': return 9;  // 1-9 | 10-18
    default: return null;  // 24K/48K are extended keyboard, not clearly DP
  }
}

/** Calculate lane background color (alternating background derived from lane note color) */
export function getLaneBackground(lane: LaneConfig): string {
  if (lane.isBgm) return '#1a1a1a';
  if (lane.isScratch) return '#2a1a2a';
  // Blend lane color into base at 12% to produce IIDX-style alternating background
  const base = [0x1a, 0x1a, 0x30];
  const laneRgb = [
    parseInt(lane.color.slice(1, 3), 16),
    parseInt(lane.color.slice(3, 5), 16),
    parseInt(lane.color.slice(5, 7), 16),
  ];
  const t = 0.12;
  const r = Math.round(base[0] + (laneRgb[0] - base[0]) * t);
  const g = Math.round(base[1] + (laneRgb[1] - base[1]) * t);
  const b = Math.round(base[2] + (laneRgb[2] - base[2]) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '00')}${b.toString(16).padStart(2, '0')}`;
}
