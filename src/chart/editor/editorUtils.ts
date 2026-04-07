/**
 * NoteChartEditor Pure Utility Functions
 *
 * 좌표 변환, 그리드 스냅, 색상 계산 등 순수 함수
 */

import React from 'react';
import * as THREE from 'three';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';
import { DEFAULT_NOTE_HEIGHT } from './types';
import type { GridSnap } from './types';

// 노트 높이 Context (하위 컴포넌트에서 참조)
export const NoteHeightContext = React.createContext(DEFAULT_NOTE_HEIGHT);
export function useNoteHeight() { return React.useContext(NoteHeightContext); }

/** BGM 노트의 레인 ID를 반환. bgmChannel에 따라 'BGM', 'BGM1', 'BGM2' 등 */
export function getBgmLaneId(note: EditableBMSNote): string {
  const ch = note.bgmChannel ?? 0;
  return ch === 0 ? 'BGM' : `BGM${ch}`;
}

/** 레인 ID가 BGM 레인인지 확인 */
export function isBgmLaneId(laneId: string): boolean {
  return laneId === 'BGM' || laneId.startsWith('BGM');
}

/** 레인 ID에서 bgmChannel 번호 추출 */
export function bgmLaneIdToChannel(laneId: string): number {
  if (laneId === 'BGM') return 0;
  return parseInt(laneId.slice(3), 10) || 0;
}

// 비트를 마디와 분수로 변환
export function beatToMeasureFraction(
  beat: number,
  beatsPerMeasure: number = 4
): { measure: number; fraction: number } {
  const measure = Math.floor(beat / beatsPerMeasure);
  const fraction = (beat % beatsPerMeasure) / beatsPerMeasure;
  return { measure, fraction };
}

/**
 * 비트를 그리드에 스냅 (tick 기반 정수 연산 — 부동소수점 오차 제거)
 * 960 ticks/beat 기준으로 정수 연산 후 beat로 변환
 */
export function snapBeatToGrid(beat: number, gridSnap: GridSnap | number): number {
  const TICKS_PER_BEAT = 960;
  const tick = Math.round(beat * TICKS_PER_BEAT);
  const gridTicks = Math.round(TICKS_PER_BEAT * 4 / gridSnap);
  if (gridTicks <= 0) return beat;
  const snapped = Math.round(tick / gridTicks) * gridTicks;
  return snapped / TICKS_PER_BEAT;
}

// 레인 색상 캐시 (new THREE.Color() 호출을 useFrame 밖으로 이동)
const _laneColorCache = new Map<string, { normal: number; invisible: number }>();
export function getLaneColorHex(laneColor: string): { normal: number; invisible: number } {
  let cached = _laneColorCache.get(laneColor);
  if (!cached) {
    const c = new THREE.Color(laneColor);
    const normal = c.getHex();
    const invisible = c.clone().multiplyScalar(0.4).getHex();
    cached = { normal, invisible };
    _laneColorCache.set(laneColor, cached);
  }
  return cached;
}

// 노트 색상을 hex number로 변환 (캐시 사용, GC 압력 제거)
// 우선순위: isSelected(cyan) > isHighlighted(주황) > noteType 기본
export function getNoteColorHex(
  note: EditableBMSNote,
  laneColorHex: { normal: number; invisible: number },
  isSelected: boolean,
  isHighlighted: boolean = false
): number {
  if (isSelected) return 0x00ffff;
  if (isHighlighted) return 0xffa500;

  switch (note.noteType) {
    case 'invisible':
      return laneColorHex.invisible;
    case 'landmine':
      return 0xff4444;
    case 'bgm':
      return 0x666666;
    default:
      return laneColorHex.normal;
  }
}

// 재사용 가능한 오브젝트 (GC 압력 감소)
export const _dummy = new THREE.Object3D();
export const _color = new THREE.Color();
