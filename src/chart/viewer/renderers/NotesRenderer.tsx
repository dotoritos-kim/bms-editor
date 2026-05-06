/**
 * NotesRenderer.tsx
 * Instanced note rendering for NoteChartViewer scroll/playback modes.
 * Extracted from NoteChartViewer.tsx (Stage E).
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { BMSNote } from '@rhythm-archive/bms-core';
import type { Positioning } from '@rhythm-archive/bms-core';
import type { LaneConfig } from '../../laneConfig';
import type { NoteTypeFilter } from '../../NoteChartViewer';
import {
  NOTE_HEIGHT,
  NOTE_PADDING,
  sharedNoteGeometry,
  sharedCircleGeometry,
  sharedBgmGeometry,
  sharedLnBodyGeometry,
  getMaterial,
  getNoteColor,
} from './viewerRenderUtils';

// ─── InstancedNotes ──────────────────────────────────────────────────────────
export const InstancedNotes = React.memo(function InstancedNotes({
  positions,
  scales,
  color,
  opacity = 1,
  zIndex = 0,
  geometry,
}: {
  positions: [number, number][];
  scales: [number, number][];
  color: string;
  opacity?: number;
  zIndex?: number;
  geometry: THREE.BufferGeometry;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = positions.length;
  const material = getMaterial(color, opacity);

  useEffect(() => {
    if (!meshRef.current || count === 0) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      position.set(positions[i][0], positions[i][1], zIndex);
      scale.set(scales[i][0], scales[i][1], 1);
      matrix.compose(position, quaternion, scale);
      meshRef.current.setMatrixAt(i, matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, scales, count, zIndex]);

  if (count === 0) return null;

  return (
    <instancedMesh
      key={`${color}-${count}`}
      ref={meshRef}
      args={[geometry, material, count]}
      frustumCulled={false}
    />
  );
});

// ─── NotesRenderer ───────────────────────────────────────────────────────────
export const NotesRenderer = React.memo(function NotesRenderer({
  notes,
  lanes,
  beatScale,
  noteTypeFilter,
  diffMode,
  addedNotes,
  removedNotes,
  modifiedNotes = [],
  positioning,
  scaleWidthByScroll = false,
  noteScale = 1.0,
  unchangedOpacity,
}: {
  notes: BMSNote[];
  lanes: LaneConfig[];
  beatScale: number;
  noteTypeFilter: NoteTypeFilter;
  diffMode: boolean;
  addedNotes: BMSNote[];
  removedNotes: BMSNote[];
  modifiedNotes?: BMSNote[];
  positioning?: Positioning | null;
  scaleWidthByScroll?: boolean;
  noteScale?: number;
  unchangedOpacity?: number;
}) {
  const totalWidth = (() => { const last = lanes[lanes.length - 1]; return last ? last.x + last.width : 0; })();
  const offsetX = -totalWidth / 2;
  const laneMap = useMemo(() => new Map(lanes.map(l => [l.id, l])), [lanes]);
  const addedSet   = useMemo(() => new Set(addedNotes.map(n => `${n.beat}-${n.column}`)),   [addedNotes]);
  const removedSet = useMemo(() => new Set(removedNotes.map(n => `${n.beat}-${n.column}`)), [removedNotes]);
  const modifiedSet = useMemo(() => new Set(modifiedNotes.map(n => `${n.beat}-${n.column}`)), [modifiedNotes]);

  const getPositionY = useCallback((beat: number) => {
    if (positioning) return positioning.position(beat) * beatScale + NOTE_HEIGHT / 2;
    return beat * beatScale + NOTE_HEIGHT / 2;
  }, [positioning, beatScale]);

  const getHeightScale = useCallback((beat: number) => {
    let scrollScale = 1;
    if (scaleWidthByScroll && positioning) {
      const speed = Math.abs(positioning.effectiveSpeed(beat));
      scrollScale = Math.max(0.3, Math.min(2.0, speed));
    }
    return scrollScale * noteScale;
  }, [scaleWidthByScroll, positioning, noteScale]);

  const noteGroups = useMemo(() => {
    const groups: Record<string, {
      positions: [number, number][];
      scales: [number, number][];
      color: string;
      opacity: number;
      zIndex: number;
      type: 'note' | 'circle' | 'bgm' | 'lnBody';
    }> = {};

    const addToGroup = (
      key: string,
      pos: [number, number],
      scale: [number, number],
      color: string,
      opacity: number,
      zIndex: number,
      type: 'note' | 'circle' | 'bgm' | 'lnBody',
    ) => {
      if (!groups[key]) {
        groups[key] = { positions: [], scales: [], color, opacity, zIndex, type };
      }
      groups[key].positions.push(pos);
      groups[key].scales.push(scale);
    };

    for (const note of notes) {
      if (!note.column) continue;
      const type = note.noteType || 'playable';
      if (!noteTypeFilter[type as keyof NoteTypeFilter]) continue;

      const lane = laneMap.get(note.column);
      if (!lane) continue;

      const x = offsetX + lane.x + NOTE_PADDING + (lane.width - NOTE_PADDING * 2) / 2;
      const y = getPositionY(note.beat);
      const baseWidth = lane.width - NOTE_PADDING * 2;
      const heightScale = getHeightScale(note.beat);
      const noteKey = `${note.beat}-${note.column}`;
      const isAdded    = diffMode && addedSet.has(noteKey);
      const isRemoved  = diffMode && removedSet.has(noteKey);
      const isModified = diffMode && modifiedSet.has(noteKey);
      const color = getNoteColor(note, lane.color, isAdded, isRemoved, isModified);

      if (note.endBeat !== undefined) {
        const endY = getPositionY(note.endBeat);
        const endHeightScale = getHeightScale(note.endBeat);
        const bodyHeight = Math.abs(endY - y);
        const bodyCenter = (y + endY) / 2;
        const lnBodyKey = `lnBody-${color}`;
        const lnNoteKey = `lnNote-${color}`;
        addToGroup(lnBodyKey, [x, bodyCenter], [baseWidth, bodyHeight], color, 0.4, -0.5, 'lnBody');
        addToGroup(lnNoteKey, [x, y],    [baseWidth, heightScale],    color, 1, 0, 'note');
        addToGroup(lnNoteKey, [x, endY], [baseWidth, endHeightScale], color, 1, 0, 'note');
        continue;
      }

      if (type === 'landmine') {
        const radius = (Math.min(baseWidth / 2, NOTE_HEIGHT / 2) - 1) * heightScale;
        addToGroup(`mine-${color}`, [x, y], [radius, radius], color, 1, 0, 'circle');
        continue;
      }

      if (type === 'invisible') {
        addToGroup(`invis-${lane.color}`, [x, y], [baseWidth, heightScale], lane.color, 0.15, 0, 'note');
        continue;
      }

      if (type === 'bgm') {
        addToGroup('bgm', [x, y], [baseWidth - 4, heightScale], '#666666', 1, -1, 'bgm');
        continue;
      }

      const isUnchanged = diffMode && !isAdded && !isRemoved && !isModified;
      const noteOpacity = isUnchanged && unchangedOpacity !== undefined ? unchangedOpacity : 1;
      addToGroup(`reg-${color}-${noteOpacity}`, [x, y], [baseWidth, heightScale], color, noteOpacity, 0, 'note');
    }

    return groups;
  }, [notes, lanes, beatScale, noteTypeFilter, diffMode, addedSet, removedSet, modifiedSet, laneMap, offsetX, getPositionY, getHeightScale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <group>
      {Object.entries(noteGroups).map(([key, group]) => {
        const geometry = group.type === 'circle' ? sharedCircleGeometry
          : group.type === 'bgm' ? sharedBgmGeometry
            : group.type === 'lnBody' ? sharedLnBodyGeometry
              : sharedNoteGeometry;
        return (
          <InstancedNotes
            key={key}
            positions={group.positions}
            scales={group.scales}
            color={group.color}
            opacity={group.opacity}
            zIndex={group.zIndex}
            geometry={geometry}
          />
        );
      })}
    </group>
  );
});
