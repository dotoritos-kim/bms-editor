/**
 * Note Renderers
 *
 * NotesRenderer, HoverPreview, RubberBandRect, DragGhostNotes,
 * EditorJudgmentLine, NotePassEffect
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';
import type { LaneConfig } from '../laneConfig';
import {
  MAX_VISIBLE_EDITOR_NOTES,
  MAX_VISIBLE_SELECTIONS,
  MAX_VISIBLE_LONGNOTE_BODIES,
  MAX_VISIBLE_LAYER_MARKERS,
  MAX_ACTIVE_FLASH,
  NOTE_PADDING,
} from './types';
import { useNoteHeight, getLaneColorHex, getNoteColorHex, _dummy, _color } from './editorUtils';

/** 노트 렌더러 (InstancedMesh 기반, viewport culling + dirty check) */
export const NotesRenderer = React.memo(function NotesRenderer({
  notes,
  lanes,
  beatScale,
  selectedNotes,
  offsetX,
  scrollBeat,
  viewportBeats,
  scrollBeatImperativeRef,
  layerConfig,
}: {
  notes: EditableBMSNote[];
  lanes: LaneConfig[];
  beatScale: number;
  selectedNotes: Set<string>;
  offsetX: number;
  scrollBeat: number;
  viewportBeats: number;
  scrollBeatImperativeRef?: React.RefObject<number>;
  layerConfig?: {
    playable: { visible: boolean; locked: boolean; opacity: number };
    invisible: { visible: boolean; locked: boolean; opacity: number };
    landmine: { visible: boolean; locked: boolean; opacity: number };
    bgm: { visible: boolean; locked: boolean; opacity: number };
  };
}) {
  const noteHeight = useNoteHeight();
  const notesMeshRef = useRef<THREE.InstancedMesh>(null);
  const selectionMeshRef = useRef<THREE.InstancedMesh>(null);
  const longNoteMeshRef = useRef<THREE.InstancedMesh>(null);
  const layerMarkerMeshRef = useRef<THREE.InstancedMesh>(null);
  const activeFlashMeshRef = useRef<THREE.InstancedMesh>(null);

  const laneMap = useMemo(
    () => new Map(lanes.map((lane) => [lane.id, lane])),
    [lanes]
  );

  const prevDataRef = useRef<{
    notes: EditableBMSNote[];
    selectedNotes: Set<string>;
    beatScale: number;
    scrollBeat: number;
    viewportBeats: number;
  }>({ notes: [], selectedNotes: new Set(), beatScale: 0, scrollBeat: -1, viewportBeats: 0 });

  useFrame(() => {
    const notesMesh = notesMeshRef.current;
    const selectionMesh = selectionMeshRef.current;
    const longNoteMesh = longNoteMeshRef.current;
    const layerMarkerMesh = layerMarkerMeshRef.current;
    const activeFlashMesh = activeFlashMeshRef.current;
    if (!notesMesh || !selectionMesh || !longNoteMesh || !layerMarkerMesh) return;

    const isPlaying = scrollBeatImperativeRef?.current !== undefined;
    const prev = prevDataRef.current;
    if (
      !isPlaying &&
      prev.notes === notes &&
      prev.selectedNotes === selectedNotes &&
      prev.beatScale === beatScale &&
      Math.abs(prev.scrollBeat - scrollBeat) < 0.01 &&
      prev.viewportBeats === viewportBeats
    ) {
      return;
    }
    prevDataRef.current = { notes, selectedNotes, beatScale, scrollBeat, viewportBeats };
    const playBeat = scrollBeatImperativeRef?.current;

    const buffer = viewportBeats * 0.5;
    const minBeat = scrollBeat - buffer;
    const maxBeat = scrollBeat + viewportBeats + buffer;

    let noteCount = 0;
    let selectionCount = 0;
    let longNoteCount = 0;
    let layerMarkerCount = 0;
    let activeFlashCount = 0;

    for (const note of notes) {
      if (noteCount >= MAX_VISIBLE_EDITOR_NOTES) break;

      // Layer visibility filter
      const noteLayer = (note.noteType || 'playable') as 'playable' | 'invisible' | 'landmine' | 'bgm';
      const layerSettings = layerConfig?.[noteLayer];
      if (layerSettings && !layerSettings.visible) continue;

      const noteMaxBeat = note.endBeat ?? note.beat;
      if (noteMaxBeat < minBeat || note.beat > maxBeat) continue;

      const laneId = note.noteType === 'bgm' ? 'BGM' : (note.column || '');
      const lane = laneMap.get(laneId);
      if (!lane) continue;

      const x = offsetX + lane.x + lane.width / 2;
      const y = note.beat * beatScale + noteHeight / 2;
      const laneColorHex = getLaneColorHex(lane.color);
      const colorHex = getNoteColorHex(note, laneColorHex, false);
      const layerOpacity = layerSettings?.opacity ?? 1.0;

      // 노트 본체
      _dummy.position.set(x, y, 0);
      _dummy.scale.set(lane.width - NOTE_PADDING * 2, noteHeight, 1);
      _dummy.updateMatrix();
      notesMesh.setMatrixAt(noteCount, _dummy.matrix);
      _color.setHex(colorHex);
      if (layerOpacity < 1.0) _color.multiplyScalar(layerOpacity);
      notesMesh.setColorAt(noteCount, _color);

      // 선택 하이라이트
      if (selectedNotes.has(note.id) && selectionCount < MAX_VISIBLE_SELECTIONS) {
        _dummy.position.set(x, y, 1);
        _dummy.scale.set(lane.width, noteHeight + 2, 1);
        _dummy.updateMatrix();
        selectionMesh.setMatrixAt(selectionCount, _dummy.matrix);
        _color.setHex(0x00ffff);
        selectionMesh.setColorAt(selectionCount, _color);
        selectionCount++;
      }

      // 롱노트 바디
      if (note.endBeat !== undefined && longNoteCount < MAX_VISIBLE_LONGNOTE_BODIES) {
        const endY = note.endBeat * beatScale + noteHeight / 2;
        const bodyY = (y + endY) / 2;
        const bodyHeight = Math.abs(endY - y);

        // Body
        _dummy.position.set(x, bodyY, -0.5);
        _dummy.scale.set(lane.width - NOTE_PADDING * 2, bodyHeight, 1);
        _dummy.updateMatrix();
        longNoteMesh.setMatrixAt(longNoteCount, _dummy.matrix);
        _color.setHex(colorHex);
        longNoteMesh.setColorAt(longNoteCount, _color);
        longNoteCount++;

        // End cap
        if (longNoteCount < MAX_VISIBLE_LONGNOTE_BODIES) {
          _dummy.position.set(x, endY, 0);
          _dummy.scale.set(lane.width - NOTE_PADDING * 2, noteHeight, 1);
          _dummy.updateMatrix();
          longNoteMesh.setMatrixAt(longNoteCount, _dummy.matrix);
          _color.setHex(colorHex);
          longNoteMesh.setColorAt(longNoteCount, _color);
          longNoteCount++;
        }
      }

      // 멀티 키음 레이어 마커
      if (note.additionalKeysounds && note.additionalKeysounds.length > 0 && layerMarkerCount < MAX_VISIBLE_LAYER_MARKERS) {
        _dummy.position.set(x + lane.width / 2 - 3, y, 1.5);
        _dummy.scale.set(5, 5, 1);
        _dummy.rotation.z = Math.PI / 4;
        _dummy.updateMatrix();
        layerMarkerMesh.setMatrixAt(layerMarkerCount, _dummy.matrix);
        _color.setHex(0xffdd00);
        layerMarkerMesh.setColorAt(layerMarkerCount, _color);
        layerMarkerCount++;
        _dummy.rotation.z = 0;
      }

      // 판정선 근처 활성 노트 플래시
      if (activeFlashMesh && playBeat !== undefined && activeFlashCount < MAX_ACTIVE_FLASH) {
        const dist = Math.abs(note.beat - playBeat);
        if (dist < 0.5) {
          const alpha = 1 - dist * 2;
          _dummy.position.set(x, y, 0.5);
          _dummy.scale.set(lane.width + 4, noteHeight + 4, 1);
          _dummy.updateMatrix();
          activeFlashMesh.setMatrixAt(activeFlashCount, _dummy.matrix);
          _color.setHex(laneColorHex.normal);
          _color.multiplyScalar(alpha);
          activeFlashMesh.setColorAt(activeFlashCount, _color);
          activeFlashCount++;
        }
      }

      noteCount++;
    }

    notesMesh.count = noteCount;
    notesMesh.instanceMatrix.needsUpdate = true;
    if (notesMesh.instanceColor) notesMesh.instanceColor.needsUpdate = true;

    selectionMesh.count = selectionCount;
    selectionMesh.instanceMatrix.needsUpdate = true;
    if (selectionMesh.instanceColor) selectionMesh.instanceColor.needsUpdate = true;

    longNoteMesh.count = longNoteCount;
    longNoteMesh.instanceMatrix.needsUpdate = true;
    if (longNoteMesh.instanceColor) longNoteMesh.instanceColor.needsUpdate = true;

    layerMarkerMesh.count = layerMarkerCount;
    layerMarkerMesh.instanceMatrix.needsUpdate = true;
    if (layerMarkerMesh.instanceColor) layerMarkerMesh.instanceColor.needsUpdate = true;

    if (activeFlashMesh) {
      activeFlashMesh.count = activeFlashCount;
      activeFlashMesh.instanceMatrix.needsUpdate = true;
      if (activeFlashMesh.instanceColor) activeFlashMesh.instanceColor.needsUpdate = true;
    }
  });

  // 초기화: 기본 색상 설정
  useEffect(() => {
    const meshConfigs: [React.RefObject<THREE.InstancedMesh | null>, number][] = [
      [notesMeshRef, MAX_VISIBLE_EDITOR_NOTES],
      [selectionMeshRef, MAX_VISIBLE_SELECTIONS],
      [longNoteMeshRef, MAX_VISIBLE_LONGNOTE_BODIES],
      [layerMarkerMeshRef, MAX_VISIBLE_LAYER_MARKERS],
      [activeFlashMeshRef, MAX_ACTIVE_FLASH],
    ];
    for (const [ref, max] of meshConfigs) {
      const mesh = ref.current;
      if (!mesh) continue;
      _color.setHex(0xffffff);
      for (let i = 0; i < max; i++) {
        mesh.setColorAt(i, _color);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, []);

  return (
    <group>
      <instancedMesh
        ref={notesMeshRef}
        args={[undefined, undefined, MAX_VISIBLE_EDITOR_NOTES]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>

      <instancedMesh
        ref={selectionMeshRef}
        args={[undefined, undefined, MAX_VISIBLE_SELECTIONS]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0.5} />
      </instancedMesh>

      <instancedMesh
        ref={longNoteMeshRef}
        args={[undefined, undefined, MAX_VISIBLE_LONGNOTE_BODIES]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0.4} />
      </instancedMesh>

      <instancedMesh
        ref={layerMarkerMeshRef}
        args={[undefined, undefined, MAX_VISIBLE_LAYER_MARKERS]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>

      <instancedMesh
        ref={activeFlashMeshRef}
        args={[undefined, undefined, MAX_ACTIVE_FLASH]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0.7} blending={THREE.AdditiveBlending} />
      </instancedMesh>
    </group>
  );
});

/** 호버 미리보기 */
export const HoverPreview = React.memo(function HoverPreview({
  beat,
  column,
  lanes,
  beatScale,
  offsetX,
  isSilent = false,
  isLongNote = false,
}: {
  beat: number;
  column: string;
  lanes: LaneConfig[];
  beatScale: number;
  offsetX: number;
  isSilent?: boolean;
  isLongNote?: boolean;
}) {
  const noteHeight = useNoteHeight();
  const lane = lanes.find((l) => l.id === column);
  if (!lane) return null;

  const x = offsetX + lane.x + lane.width / 2;
  const y = beat * beatScale + noteHeight / 2;
  const w = lane.width - NOTE_PADDING * 2;

  if (isSilent) {
    return (
      <group position={[x, y, 2]}>
        <mesh>
          <planeGeometry args={[w, noteHeight]} />
          <meshBasicMaterial color="#888888" transparent opacity={0.25} />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.PlaneGeometry(w, noteHeight)]} />
          <lineBasicMaterial color="#aaaaaa" transparent opacity={0.6} />
        </lineSegments>
      </group>
    );
  }

  if (isLongNote) {
    const lnLength = 0.5 * beatScale;
    const endY = y + lnLength;
    const bodyY = (y + endY) / 2;
    return (
      <group>
        <mesh position={[x, y, 2]}>
          <planeGeometry args={[w, noteHeight]} />
          <meshBasicMaterial color={lane.color} transparent opacity={0.5} />
        </mesh>
        <mesh position={[x, bodyY, 1.5]}>
          <planeGeometry args={[w, lnLength]} />
          <meshBasicMaterial color={lane.color} transparent opacity={0.2} />
        </mesh>
        <mesh position={[x, endY, 2]}>
          <planeGeometry args={[w, noteHeight]} />
          <meshBasicMaterial color={lane.color} transparent opacity={0.5} />
        </mesh>
      </group>
    );
  }

  return (
    <mesh position={[x, y, 2]}>
      <planeGeometry args={[w, noteHeight]} />
      <meshBasicMaterial color={lane.color} transparent opacity={0.5} />
    </mesh>
  );
});

/** Rubber band 선택 사각형 */
export const RubberBandRect = React.memo(function RubberBandRect({
  startX,
  startY,
  endX,
  endY,
}: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}) {
  const centerX = (startX + endX) / 2;
  const centerY = (startY + endY) / 2;
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  if (width < 1 && height < 1) return null;

  return (
    <mesh position={[centerX, centerY, 10]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color="#4488ff" transparent opacity={0.2} />
    </mesh>
  );
});

/** 드래그 이동 시 고스트 노트 미리보기 */
export const DragGhostNotes = React.memo(function DragGhostNotes({
  notes,
  selectedNotes,
  lanes,
  beatScale,
  offsetX,
  beatDelta,
  columnDelta,
}: {
  notes: EditableBMSNote[];
  selectedNotes: Set<string>;
  lanes: LaneConfig[];
  beatScale: number;
  offsetX: number;
  beatDelta: number;
  columnDelta: number;
}) {
  const noteHeight = useNoteHeight();
  const ghostNotes = useMemo(() => {
    return notes.filter((n) => selectedNotes.has(n.id));
  }, [notes, selectedNotes]);

  return (
    <group>
      {ghostNotes.map((note) => {
        const currentLaneIdx = lanes.findIndex((l) => l.id === note.column);
        const targetLaneIdx = Math.max(0, Math.min(lanes.length - 1, currentLaneIdx + columnDelta));
        const targetLane = lanes[targetLaneIdx];
        if (!targetLane) return null;

        const x = offsetX + targetLane.x + targetLane.width / 2;
        const y = (note.beat + beatDelta) * beatScale + noteHeight / 2;
        const laneWidth = targetLane.width - NOTE_PADDING * 2;

        return (
          <group key={note.id}>
            <mesh position={[x, y, 3]}>
              <planeGeometry args={[laneWidth, noteHeight]} />
              <meshBasicMaterial color="#00ffff" transparent opacity={0.4} />
            </mesh>
            {note.endBeat !== undefined && (() => {
              const endY = (note.endBeat + beatDelta) * beatScale + noteHeight / 2;
              const bodyY = (y + endY) / 2;
              const bodyHeight = Math.abs(endY - y);
              return (
                <>
                  <mesh position={[x, bodyY, 2]}>
                    <planeGeometry args={[laneWidth, bodyHeight]} />
                    <meshBasicMaterial color="#00ffff" transparent opacity={0.2} />
                  </mesh>
                  <mesh position={[x, endY, 3]}>
                    <planeGeometry args={[laneWidth, noteHeight]} />
                    <meshBasicMaterial color="#00ffff" transparent opacity={0.4} />
                  </mesh>
                </>
              );
            })()}
          </group>
        );
      })}
    </group>
  );
});

/** 노트 통과 이펙트 */
const MAX_NOTE_PASS_EFFECTS = 16;
const NOTE_PASS_DURATION = 0.2;

interface NotePassSlot {
  active: boolean;
  x: number;
  y: number;
  colorHex: number;
  startTime: number;
}

export const NotePassEffect = React.memo(function NotePassEffect({
  scrollBeatImperativeRef,
  notes,
  lanes,
  beatScale,
  offsetX,
}: {
  scrollBeatImperativeRef: React.RefObject<number>;
  notes: EditableBMSNote[];
  lanes: LaneConfig[];
  beatScale: number;
  offsetX: number;
}) {
  const noteHeight = useNoteHeight();
  const meshRefs = useRef<(THREE.Mesh | null)[]>(new Array(MAX_NOTE_PASS_EFFECTS).fill(null));
  const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>(new Array(MAX_NOTE_PASS_EFFECTS).fill(null));
  const slotsRef = useRef<NotePassSlot[]>(
    Array.from({ length: MAX_NOTE_PASS_EFFECTS }, () => ({
      active: false, x: 0, y: 0, colorHex: 0xffffff, startTime: 0,
    }))
  );
  const lastBeatRef = useRef<number>(-1);
  const nextSlotRef = useRef(0);

  const laneMap = useMemo(
    () => new Map(lanes.map((lane) => [lane.id, lane])),
    [lanes]
  );

  const sortedNotes = useMemo(() => {
    return [...notes]
      .filter((n) => n.noteType !== 'invisible')
      .sort((a, b) => a.beat - b.beat);
  }, [notes]);

  useFrame(({ clock }) => {
    const currentBeat = scrollBeatImperativeRef.current ?? -1;
    const prevBeat = lastBeatRef.current;
    const now = clock.getElapsedTime();

    if (prevBeat >= 0 && currentBeat > prevBeat) {
      let lo = 0, hi = sortedNotes.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sortedNotes[mid].beat <= prevBeat) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < sortedNotes.length && sortedNotes[i].beat <= currentBeat; i++) {
        const note = sortedNotes[i];
        const effectLaneId = note.noteType === 'bgm' ? 'BGM' : (note.column || '');
        const lane = laneMap.get(effectLaneId);
        if (!lane) continue;

        const slot = nextSlotRef.current % MAX_NOTE_PASS_EFFECTS;
        nextSlotRef.current++;
        slotsRef.current[slot] = {
          active: true,
          x: offsetX + lane.x + lane.width / 2,
          y: note.beat * beatScale + noteHeight / 2,
          colorHex: getLaneColorHex(lane.color).normal,
          startTime: now,
        };
      }
    }
    lastBeatRef.current = currentBeat;

    const slots = slotsRef.current;
    for (let i = 0; i < MAX_NOTE_PASS_EFFECTS; i++) {
      const mesh = meshRefs.current[i];
      const mat = matRefs.current[i];
      if (!mesh || !mat) continue;

      const slot = slots[i];
      if (!slot.active) {
        mesh.visible = false;
        continue;
      }

      const elapsed = now - slot.startTime;
      if (elapsed > NOTE_PASS_DURATION) {
        slot.active = false;
        mesh.visible = false;
        continue;
      }

      const t = elapsed / NOTE_PASS_DURATION;
      mesh.visible = true;
      mesh.position.set(slot.x, slot.y, 7);
      const scale = 1 + t * 0.5;
      mesh.scale.set(20 * scale, 20 * scale, 1);
      mat.color.setHex(slot.colorHex);
      mat.opacity = 0.6 * (1 - t);
    }
  });

  return (
    <group>
      {Array.from({ length: MAX_NOTE_PASS_EFFECTS }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el; }}
          visible={false}
        >
          <circleGeometry args={[1, 16]} />
          <meshBasicMaterial
            ref={(el) => { matRefs.current[i] = el; }}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            color="#ffffff"
          />
        </mesh>
      ))}
    </group>
  );
});

/** 판정선 (재생 중 현재 위치를 표시하는 수평선) */
export const EditorJudgmentLine = React.memo(function EditorJudgmentLine({
  scrollBeatImperativeRef,
  beatScale,
  totalWidth,
}: {
  scrollBeatImperativeRef: React.RefObject<number>;
  beatScale: number;
  totalWidth: number;
}) {
  const wideGlowRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const beat = scrollBeatImperativeRef.current ?? 0;
    const y = beat * beatScale;
    if (wideGlowRef.current) wideGlowRef.current.position.y = y;
    if (glowRef.current) glowRef.current.position.y = y;
    if (meshRef.current) meshRef.current.position.y = y;
    if (coreRef.current) coreRef.current.position.y = y;
    if (glowMatRef.current) {
      glowMatRef.current.opacity = 0.2 + 0.15 * Math.sin(clock.getElapsedTime() * 4);
    }
  });

  const fullWidth = totalWidth + 40;

  return (
    <group>
      <mesh ref={wideGlowRef} position={[0, 0, 2]}>
        <planeGeometry args={[fullWidth, 32]} />
        <meshBasicMaterial color="#ff6600" transparent opacity={0.08} />
      </mesh>
      <mesh ref={glowRef} position={[0, 0, 3]}>
        <planeGeometry args={[fullWidth, 16]} />
        <meshBasicMaterial ref={glowMatRef} color="#ff6600" transparent opacity={0.3} />
      </mesh>
      <mesh ref={meshRef} position={[0, 0, 4]}>
        <planeGeometry args={[fullWidth, 4]} />
        <meshBasicMaterial color="#ff6600" />
      </mesh>
      <mesh ref={coreRef} position={[0, 0, 5]}>
        <planeGeometry args={[fullWidth, 2]} />
        <meshBasicMaterial color="#ffcc00" />
      </mesh>
    </group>
  );
});
