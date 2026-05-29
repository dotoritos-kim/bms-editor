/**
 * NoteChartEditor Pure Utility Functions
 *
 * Pure utility functions: coordinate conversion, grid snapping, color calculation
 */

import React from 'react';
import * as THREE from 'three';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';
import { DEFAULT_NOTE_HEIGHT } from './types';
import type { GridSnap, CustomNoteColors } from './types';

// Note height Context (referenced by child components)
export const NoteHeightContext = React.createContext(DEFAULT_NOTE_HEIGHT);
export function useNoteHeight() { return React.useContext(NoteHeightContext); }

/** Returns the lane ID for a BGM note. Returns 'BGM', 'BGM1', 'BGM2', etc. based on bgmChannel. */
export function getBgmLaneId(note: EditableBMSNote): string {
  const ch = note.bgmChannel ?? 0;
  return ch === 0 ? 'BGM' : `BGM${ch}`;
}

/** Returns true if the lane ID is a BGM lane. */
export function isBgmLaneId(laneId: string): boolean {
  return laneId === 'BGM' || laneId.startsWith('BGM');
}

/** Extracts the bgmChannel number from a lane ID. */
export function bgmLaneIdToChannel(laneId: string): number {
  if (laneId === 'BGM') return 0;
  return parseInt(laneId.slice(3), 10) || 0;
}

// Converts a beat to measure + fraction
export function beatToMeasureFraction(
  beat: number,
  beatsPerMeasure: number = 4
): { measure: number; fraction: number } {
  const measure = Math.floor(beat / beatsPerMeasure);
  const fraction = (beat % beatsPerMeasure) / beatsPerMeasure;
  return { measure, fraction };
}

/**
 * Snaps a beat to the grid using tick-based integer arithmetic to eliminate floating-point errors.
 * Operates in integer ticks at 960 ticks/beat, then converts back to beats.
 */
export function snapBeatToGrid(beat: number, gridSnap: GridSnap | number): number {
  const TICKS_PER_BEAT = 960;
  const tick = Math.round(beat * TICKS_PER_BEAT);
  const gridTicks = Math.round(TICKS_PER_BEAT * 4 / gridSnap);
  if (gridTicks <= 0) return beat;
  const snapped = Math.round(tick / gridTicks) * gridTicks;
  return snapped / TICKS_PER_BEAT;
}

// Lane color cache (moves new THREE.Color() calls outside useFrame)
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

// CSS color string → hex number cache (THREE.Color parsing is slow, so caching is essential)
const _customColorCache = new Map<string, number>();
function parseCustomColor(color: string): number | null {
  if (_customColorCache.has(color)) return _customColorCache.get(color)!;
  try {
    const hex = new THREE.Color(color).getHex();
    _customColorCache.set(color, hex);
    return hex;
  } catch {
    return null;
  }
}

// Converts note color to a hex number (uses cache, reduces GC pressure)
// Priority: isSelected > isHighlighted > customColors > noteType default
export function getNoteColorHex(
  note: EditableBMSNote,
  laneColorHex: { normal: number; invisible: number },
  isSelected: boolean,
  isHighlighted: boolean = false,
  customColors?: CustomNoteColors
): number {
  if (isSelected) {
    if (customColors?.selection) {
      const hex = parseCustomColor(customColors.selection);
      if (hex !== null) return hex;
    }
    return 0x00ffff;
  }
  if (isHighlighted) return 0xffa500;

  switch (note.noteType) {
    case 'invisible': {
      if (customColors?.invisible) {
        const hex = parseCustomColor(customColors.invisible);
        if (hex !== null) return hex;
      }
      return laneColorHex.invisible;
    }
    case 'landmine': {
      if (customColors?.landmine) {
        const hex = parseCustomColor(customColors.landmine);
        if (hex !== null) return hex;
      }
      return 0xff4444;
    }
    case 'bgm': {
      if (customColors?.bgm) {
        const hex = parseCustomColor(customColors.bgm);
        if (hex !== null) return hex;
      }
      return 0x666666;
    }
    default: {
      if (customColors?.playable) {
        const hex = parseCustomColor(customColors.playable);
        if (hex !== null) return hex;
      }
      return laneColorHex.normal;
    }
  }
}

/** Selection highlight color (supports customColors override). */
export function getSelectionColorHex(customColors?: CustomNoteColors): number {
  if (customColors?.selection) {
    const hex = parseCustomColor(customColors.selection);
    if (hex !== null) return hex;
  }
  return 0x00ffff;
}

// Reusable objects (reduces GC pressure)
export const _dummy = new THREE.Object3D();
export const _color = new THREE.Color();
