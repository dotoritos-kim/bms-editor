/**
 * viewerRenderUtils.ts
 * Shared geometry instances, material cache, and pure rendering utilities
 * extracted from NoteChartViewer.
 */

import * as THREE from 'three';
import type { BMSNote } from '@rhythm-archive/bms-core';
import type { NoteTypeFilter } from '../../NoteChartViewer';

// ─── Shared geometry (created once, reused) ────────────────────────────────
export const NOTE_HEIGHT = 4;
export const NOTE_PADDING = 1;

export const sharedNoteGeometry = new THREE.PlaneGeometry(1, NOTE_HEIGHT);
export const sharedCircleGeometry = new THREE.CircleGeometry(1, 16);
export const sharedBgmGeometry = new THREE.PlaneGeometry(1, 2);
export const sharedLnBodyGeometry = new THREE.PlaneGeometry(1, 1);

// ─── Material cache ─────────────────────────────────────────────────────────
const materialCache = new Map<string, THREE.MeshBasicMaterial>();

export function getMaterial(color: string, opacity: number): THREE.MeshBasicMaterial {
  const key = `${color}-${opacity}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
    }));
  }
  return materialCache.get(key)!;
}

// ─── Note colour helper ──────────────────────────────────────────────────────
export function getNoteColor(
  note: BMSNote,
  laneColor: string,
  isAdded: boolean,
  isRemoved: boolean,
  isModified = false,
): string {
  if (isRemoved) return '#ff4444';
  if (isModified) return '#ffcc00';
  if (isAdded) return '#44ff44';

  const type = note.noteType || 'playable';
  switch (type) {
    case 'invisible':
      return laneColor + '44';
    case 'landmine': {
      const damage = note.damage ?? 50;
      if (damage >= 100) return '#ff00ff';
      if (damage >= 50)  return '#ff0000';
      if (damage >= 25)  return '#ff6600';
      return '#ffaa00';
    }
    case 'bgm':
      return '#666666';
    default:
      return laneColor;
  }
}

// ─── Note type filter check ──────────────────────────────────────────────────
export function notePassesFilter(note: BMSNote, filter: NoteTypeFilter): boolean {
  const type = note.noteType || 'playable';
  return !!filter[type as keyof NoteTypeFilter];
}

// ─── Canvas text texture helper (for BPM / timing markers) ──────────────────
export function createTextTexture(
  text: string,
  color: string,
  fontSize = 14,
  fontWeight = 'bold',
): { texture: THREE.CanvasTexture; width: number; height: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const scale = 2;
  const font = `${fontWeight} ${fontSize * scale}px "Segoe UI", Arial, sans-serif`;

  ctx.font = font;
  const metrics = ctx.measureText(text);

  const padding = 8;
  const canvasWidth  = Math.ceil(metrics.width) + padding * 2;
  const canvasHeight = Math.ceil(fontSize * scale * 1.4) + padding * 2;

  canvas.width  = canvasWidth;
  canvas.height = canvasHeight;

  ctx.fillStyle = 'rgba(10, 10, 20, 0.9)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(text, padding, canvasHeight / 2);

  ctx.fillStyle = color;
  ctx.fillText(text, padding, canvasHeight / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return {
    texture,
    width:  canvasWidth  / scale,
    height: canvasHeight / scale,
  };
}

// ─── Timing marker line helpers ──────────────────────────────────────────────
export function collectLinePoints(
  items: { beat: number; color?: string }[],
  getY: (beat: number) => number,
  halfWidth: number,
  defaultColor: string,
): { points: [number, number, number][]; color: string }[] {
  const colorGroups = new Map<string, [number, number, number][]>();

  for (const item of items) {
    const y = getY(item.beat);
    const color = item.color || defaultColor;
    if (!colorGroups.has(color)) {
      colorGroups.set(color, []);
    }
    colorGroups.get(color)!.push([-halfWidth, y, 2], [halfWidth, y, 2]);
  }

  return Array.from(colorGroups.entries()).map(([color, points]) => ({ points, color }));
}

export const MAX_TEXT_ELEMENTS = 50;

export function filterTextsByDensity<T extends { beat: number }>(
  items: T[],
  getY: (beat: number) => number,
  minPixelSpacing: number,
): T[] {
  if (items.length === 0) return [];

  const effectiveSpacing = items.length > 100
    ? Math.max(minPixelSpacing, minPixelSpacing * (items.length / 100))
    : minPixelSpacing;

  const result: T[] = [items[0]];
  let lastY = getY(items[0].beat);

  for (let i = 1; i < items.length && result.length < MAX_TEXT_ELEMENTS; i++) {
    const currentY = getY(items[i].beat);
    if (Math.abs(currentY - lastY) >= effectiveSpacing) {
      result.push(items[i]);
      lastY = currentY;
    }
  }

  return result;
}

// ─── Lane option helpers ─────────────────────────────────────────────────────
export function mulberry32(seed: number): () => number {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
