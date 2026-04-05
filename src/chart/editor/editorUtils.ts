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
export function getNoteColorHex(
  note: EditableBMSNote,
  laneColorHex: { normal: number; invisible: number },
  isSelected: boolean
): number {
  if (isSelected) return 0x00ffff;

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
