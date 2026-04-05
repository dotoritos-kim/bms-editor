/**
 * Shared lane configuration for BMS chart editor and viewer.
 * Defines lane layout per key mode (column positions, widths, colors).
 */

import type { KeyMode } from './NoteChartViewer';

/** 레인 설정 */
export interface LaneConfig {
  id: string;
  x: number;
  width: number;
  color: string;
  isScratch: boolean;
  isBgm: boolean;
  originalIndex: number;
}

/** 키 모드별 레인 설정 생성 */
export function generateLaneConfig(keyMode: KeyMode): LaneConfig[] {
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
      lanes: ['SC', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'SC2'],
      colors: {
        SC: '#ff3366',
        '1': '#ffffff',
        '2': '#3399ff',
        '3': '#ffffff',
        '4': '#3399ff',
        '5': '#ffffff',
        '6': '#ffffff',
        '7': '#3399ff',
        '8': '#ffffff',
        '9': '#3399ff',
        '10': '#ffffff',
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

  const BGM_LANE_WIDTH = 30;
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

  // BGM lane at the right end (with gap)
  x += BGM_GAP;
  lanes.push({
    id: 'BGM',
    x,
    width: BGM_LANE_WIDTH,
    color: '#666666',
    isScratch: false,
    isBgm: true,
    originalIndex: lanes.length,
  });

  return lanes;
}

/** 키 모드의 레인 ID 목록 반환 (BGM 레인 제외 — 플레이어블 레인만) */
export function getLaneIds(keyMode: KeyMode): string[] {
  return generateLaneConfig(keyMode).filter((l) => !l.isBgm).map((l) => l.id);
}

/** DP 모드의 1P/2P 구분 인덱스 반환 (구분선 위치). SP 모드는 null. */
export function getDpSplitIndex(keyMode: KeyMode): number | null {
  switch (keyMode) {
    case '10K': return 6;  // SC,1-5 | 6-10,SC2
    case '12K': return 6;  // 1-6 | 7-12
    case '14K': return 9;  // SC,1-7,FZ | 8-14,FZ2,SC2
    case '18K': return 9;  // 1-9 | 10-18
    default: return null;  // 24K/48K are extended keyboard, not clearly DP
  }
}

/** 레인 배경색 계산 (레인 노트 색상에 따라 교차 배경 생성) */
export function getLaneBackground(lane: LaneConfig): string {
  if (lane.isBgm) return '#1a1a1a';
  if (lane.isScratch) return '#2a1a2a';
  // 레인 색상을 base에 12% 블렌딩하여 IIDX 스타일 교차 배경
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
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
