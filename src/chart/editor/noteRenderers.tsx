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
import type { CustomNoteColors } from './types';
import { useNoteHeight, getLaneColorHex, getNoteColorHex, getSelectionColorHex, getBgmLaneId, isBgmLaneId, _dummy, _color } from './editorUtils';
import { TextLabels } from './gridRenderers';

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
  highlightKeysound,
  wavDurations,
  baseBpm = 120,
  customColors,
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
  highlightKeysound?: string | null;
  /** WAV duration (keysoundId → seconds) for BGM tail visualization */
  wavDurations?: Map<string, number>;
  /** BPM at start (for duration→beats conversion) */
  baseBpm?: number;
  /** 커스텀 노트 색상 오버라이드 */
  customColors?: CustomNoteColors;
}) {
  const noteHeight = useNoteHeight();
  const notesMeshRef = useRef<THREE.InstancedMesh>(null);
  const selectionMeshRef = useRef<THREE.InstancedMesh>(null);
  const longNoteMeshRef = useRef<THREE.InstancedMesh>(null);
  const layerMarkerMeshRef = useRef<THREE.InstancedMesh>(null);
  const activeFlashMeshRef = useRef<THREE.InstancedMesh>(null);
  const bgmTailMeshRef = useRef<THREE.InstancedMesh>(null);

  const laneMap = useMemo(
    () => new Map(lanes.map((lane) => [lane.id, lane])),
    [lanes]
  );

  // beat 오름차순 정렬 — notes 참조가 바뀔 때만 재정렬 (O(N log N) once → O(log N) per frame)
  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => a.beat - b.beat),
    [notes]
  );

  const prevDataRef = useRef<{
    notes: EditableBMSNote[];
    selectedNotes: Set<string>;
    beatScale: number;
    scrollBeat: number;
    viewportBeats: number;
    highlightKeysound: string | null | undefined;
  }>({ notes: [], selectedNotes: new Set(), beatScale: 0, scrollBeat: -1, viewportBeats: 0, highlightKeysound: undefined });

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
      prev.viewportBeats === viewportBeats &&
      prev.highlightKeysound === highlightKeysound
    ) {
      return;
    }
    prevDataRef.current = { notes, selectedNotes, beatScale, scrollBeat, viewportBeats, highlightKeysound };
    const playBeat = scrollBeatImperativeRef?.current;

    const buffer = viewportBeats * 0.5;
    const minBeat = scrollBeat - buffer;
    const maxBeat = scrollBeat + viewportBeats + buffer;

    let noteCount = 0;
    let selectionCount = 0;
    let longNoteCount = 0;
    let layerMarkerCount = 0;
    let activeFlashCount = 0;

    // 이진탐색으로 viewport 범위만 순회 (LN은 최대 64 beat 룩백으로 커버)
    const LN_LOOK_BACK = 64;
    let lo = 0, hi = sortedNotes.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedNotes[mid].beat < minBeat - LN_LOOK_BACK) lo = mid + 1; else hi = mid; }
    const noteStartIdx = lo;
    lo = noteStartIdx; hi = sortedNotes.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedNotes[mid].beat <= maxBeat) lo = mid + 1; else hi = mid; }
    const noteEndIdx = lo;

    for (let ni = noteStartIdx; ni < noteEndIdx; ni++) {
      const note = sortedNotes[ni];
      if (noteCount >= MAX_VISIBLE_EDITOR_NOTES) break;

      // Layer visibility filter
      const noteLayer = (note.noteType || 'playable') as 'playable' | 'invisible' | 'landmine' | 'bgm';
      const layerSettings = layerConfig?.[noteLayer];
      if (layerSettings && !layerSettings.visible) continue;

      const noteMaxBeat = note.endBeat ?? note.beat;
      if (noteMaxBeat < minBeat) continue; // LN이 룩백 구간 시작 전에 끝난 경우

      const laneId = note.noteType === 'bgm' ? getBgmLaneId(note) : (note.column || '');
      const lane = laneMap.get(laneId);
      if (!lane) continue;

      const x = offsetX + lane.x + lane.width / 2;
      const y = note.beat * beatScale + noteHeight / 2;
      const laneColorHex = getLaneColorHex(lane.color);
      const isNoteHighlighted = !!highlightKeysound && (
        note.keysound === highlightKeysound ||
        note.additionalKeysounds?.some((ak) => ak.keysound === highlightKeysound)
      );
      const colorHex = getNoteColorHex(note, laneColorHex, false, isNoteHighlighted, customColors);
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
        _color.setHex(getSelectionColorHex(customColors));
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

    // BGM duration tails
    const bgmTailMesh = bgmTailMeshRef.current;
    if (bgmTailMesh && wavDurations && wavDurations.size > 0) {
      let tailCount = 0;
      const MAX_TAILS = 200;
      // BGM tail 이진탐색 (WAV duration 룩백 20 beat)
      const BGM_LOOK_BACK = 20;
      let bgmLo = 0, bgmHi = sortedNotes.length;
      while (bgmLo < bgmHi) { const mid = (bgmLo + bgmHi) >> 1; if (sortedNotes[mid].beat < minBeat - BGM_LOOK_BACK) bgmLo = mid + 1; else bgmHi = mid; }
      const bgmStartIdx = bgmLo;
      bgmLo = bgmStartIdx; bgmHi = sortedNotes.length;
      while (bgmLo < bgmHi) { const mid = (bgmLo + bgmHi) >> 1; if (sortedNotes[mid].beat <= maxBeat) bgmLo = mid + 1; else bgmHi = mid; }
      const bgmEndIdx = bgmLo;
      for (let bi = bgmStartIdx; bi < bgmEndIdx; bi++) {
        const note = sortedNotes[bi];
        if (tailCount >= MAX_TAILS) break;
        if (note.noteType !== 'bgm') continue;
        const dur = wavDurations.get(note.keysound);
        if (!dur || dur <= 0) continue;

        const laneId = getBgmLaneId(note);
        const lane = laneMap.get(laneId);
        if (!lane) continue;

        // Convert seconds to beats using baseBpm
        const durationBeats = (dur / 60) * baseBpm;
        const startY = note.beat * beatScale + noteHeight / 2;
        const endY = (note.beat + durationBeats) * beatScale + noteHeight / 2;
        const tailHeight = endY - startY;
        const centerY = (startY + endY) / 2;
        const x = offsetX + lane.x + lane.width / 2;

        _dummy.position.set(x, centerY, -1);
        _dummy.scale.set(lane.width - NOTE_PADDING * 2 - 2, tailHeight, 1);
        _dummy.updateMatrix();
        bgmTailMesh.setMatrixAt(tailCount, _dummy.matrix);
        _color.setHex(0x666666);
        bgmTailMesh.setColorAt(tailCount, _color);
        tailCount++;
      }
      bgmTailMesh.count = tailCount;
      bgmTailMesh.instanceMatrix.needsUpdate = true;
      if (bgmTailMesh.instanceColor) bgmTailMesh.instanceColor.needsUpdate = true;
    } else if (bgmTailMesh) {
      bgmTailMesh.count = 0;
      bgmTailMesh.instanceMatrix.needsUpdate = true;
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
      [bgmTailMeshRef, 200],
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

      <instancedMesh
        ref={bgmTailMeshRef}
        args={[undefined, undefined, 200]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0.15} />
      </instancedMesh>

      {/* BGM WAV ID labels */}
      <BgmLabels
        notes={notes}
        lanes={lanes}
        beatScale={beatScale}
        scrollBeat={scrollBeat}
        viewportBeats={viewportBeats}
        offsetX={offsetX}
        layerConfig={layerConfig}
      />
    </group>
  );
});

/** BGM 노트에 WAV ID 텍스트 라벨을 표시하는 서브 컴포넌트 */
const BgmLabels = React.memo(function BgmLabels({
  notes,
  lanes,
  beatScale,
  scrollBeat,
  viewportBeats,
  offsetX,
  layerConfig,
}: {
  notes: EditableBMSNote[];
  lanes: LaneConfig[];
  beatScale: number;
  scrollBeat: number;
  viewportBeats: number;
  offsetX: number;
  layerConfig?: {
    bgm: { visible: boolean; locked: boolean; opacity: number };
    [key: string]: { visible: boolean; locked: boolean; opacity: number };
  };
}) {
  const bgmVisible = layerConfig?.bgm?.visible ?? true;
  const bgmLanes = useMemo(() => lanes.filter((l) => l.isBgm), [lanes]);

  const labels = useMemo(() => {
    if (!bgmVisible || bgmLanes.length === 0) return [];
    // 저줌 시 레이블이 읽기 불가하고 draw call만 증가 → 숨김
    if (beatScale < 15) return [];

    const MAX_LABELS = 50;
    const buffer = viewportBeats * 0.5;
    const minBeat = scrollBeat - buffer;
    const maxBeat = scrollBeat + viewportBeats + buffer;

    const result: { y: number; text: string; laneId: string }[] = [];
    for (const note of notes) {
      if (result.length >= MAX_LABELS) break;
      if (note.noteType !== 'bgm') continue;
      if (note.beat < minBeat || note.beat > maxBeat) continue;
      const laneId = getBgmLaneId(note);
      const lane = bgmLanes.find((l) => l.id === laneId);
      if (!lane) continue;
      result.push({
        y: note.beat * beatScale,
        text: note.keysound,
        laneId,
      });
    }
    return result;
  }, [notes, bgmLanes, bgmVisible, beatScale, scrollBeat, viewportBeats]);

  // byLane을 useMemo로 메모이제이션 — labels가 바뀌지 않으면 TextLabels가 재렌더링하지 않음
  const byLane = useMemo(() => {
    const map = new Map<string, { y: number; text: string }[]>();
    for (const l of labels) {
      const arr = map.get(l.laneId);
      if (arr) arr.push({ y: l.y, text: l.text });
      else map.set(l.laneId, [{ y: l.y, text: l.text }]);
    }
    return map;
  }, [labels]);

  if (labels.length === 0) return null;

  return (
    <>
      {bgmLanes.map((lane) => {
        const laneLabels = byLane.get(lane.id);
        if (!laneLabels || laneLabels.length === 0) return null;
        return (
          <TextLabels
            key={lane.id}
            labels={laneLabels}
            x={offsetX + lane.x + lane.width / 2}
            z={2}
            color="#cccccc"
            align="left"
            worldHeight={8}
          />
        );
      })}
    </>
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
  // hooks는 early return 전에 모두 선언 (rules of hooks)
  const w = (lane?.width ?? 0) - NOTE_PADDING * 2;
  const silentEdgeGeom = useMemo(() => new THREE.PlaneGeometry(w, noteHeight), [w, noteHeight]);

  if (!lane) return null;

  const x = offsetX + lane.x + lane.width / 2;
  const y = beat * beatScale + noteHeight / 2;

  if (isSilent) {
    return (
      <group position={[x, y, 2]}>
        <mesh>
          <planeGeometry args={[w, noteHeight]} />
          <meshBasicMaterial color="#888888" transparent opacity={0.25} />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[silentEdgeGeom]} />
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

/** 드래그 이동 시 고스트 노트 미리보기 (InstancedMesh 기반, 3 draw calls) */
const MAX_GHOST_NOTES = 500;
const MAX_GHOST_LN_BODIES = 500;

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
  const ghostMeshRef = useRef<THREE.InstancedMesh>(null);
  const ghostLnBodyMeshRef = useRef<THREE.InstancedMesh>(null);
  const ghostLnCapMeshRef = useRef<THREE.InstancedMesh>(null);

  const ghostNotes = useMemo(() => {
    return notes.filter((n) => selectedNotes.has(n.id));
  }, [notes, selectedNotes]);

  useFrame(() => {
    const ghostMesh = ghostMeshRef.current;
    const ghostLnBody = ghostLnBodyMeshRef.current;
    const ghostLnCap = ghostLnCapMeshRef.current;
    if (!ghostMesh || !ghostLnBody || !ghostLnCap) return;

    let noteCount = 0;
    let lnBodyCount = 0;
    let lnCapCount = 0;

    for (const note of ghostNotes) {
      if (noteCount >= MAX_GHOST_NOTES) break;

      const noteLaneId = note.noteType === 'bgm' ? getBgmLaneId(note) : note.column;
      const currentLaneIdx = lanes.findIndex((l) => l.id === noteLaneId);
      const targetLaneIdx = Math.max(0, Math.min(lanes.length - 1, currentLaneIdx + columnDelta));
      const targetLane = lanes[targetLaneIdx];
      if (!targetLane) continue;

      const x = offsetX + targetLane.x + targetLane.width / 2;
      const y = (note.beat + beatDelta) * beatScale + noteHeight / 2;
      const laneWidth = targetLane.width - NOTE_PADDING * 2;

      // Ghost note body
      _dummy.position.set(x, y, 3);
      _dummy.scale.set(laneWidth, noteHeight, 1);
      _dummy.updateMatrix();
      ghostMesh.setMatrixAt(noteCount, _dummy.matrix);
      noteCount++;

      // Long note body + end cap
      if (note.endBeat !== undefined && lnBodyCount < MAX_GHOST_LN_BODIES) {
        const endY = (note.endBeat! + beatDelta) * beatScale + noteHeight / 2;
        const bodyY = (y + endY) / 2;
        const bodyHeight = Math.abs(endY - y);

        _dummy.position.set(x, bodyY, 2);
        _dummy.scale.set(laneWidth, bodyHeight, 1);
        _dummy.updateMatrix();
        ghostLnBody.setMatrixAt(lnBodyCount, _dummy.matrix);
        lnBodyCount++;

        if (lnCapCount < MAX_GHOST_LN_BODIES) {
          _dummy.position.set(x, endY, 3);
          _dummy.scale.set(laneWidth, noteHeight, 1);
          _dummy.updateMatrix();
          ghostLnCap.setMatrixAt(lnCapCount, _dummy.matrix);
          lnCapCount++;
        }
      }
    }

    ghostMesh.count = noteCount;
    ghostMesh.instanceMatrix.needsUpdate = true;

    ghostLnBody.count = lnBodyCount;
    ghostLnBody.instanceMatrix.needsUpdate = true;

    ghostLnCap.count = lnCapCount;
    ghostLnCap.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={ghostMeshRef}
        args={[undefined, undefined, MAX_GHOST_NOTES]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#00ffff" transparent opacity={0.4} />
      </instancedMesh>
      <instancedMesh
        ref={ghostLnBodyMeshRef}
        args={[undefined, undefined, MAX_GHOST_LN_BODIES]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#00ffff" transparent opacity={0.2} />
      </instancedMesh>
      <instancedMesh
        ref={ghostLnCapMeshRef}
        args={[undefined, undefined, MAX_GHOST_LN_BODIES]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#00ffff" transparent opacity={0.4} />
      </instancedMesh>
    </group>
  );
});

/** 노트 통과 이펙트 (InstancedMesh 기반, 1 draw call) */
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
  const meshRef = useRef<THREE.InstancedMesh>(null);
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
    const mesh = meshRef.current;
    if (!mesh) return;

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
        const effectLaneId = note.noteType === 'bgm' ? getBgmLaneId(note) : (note.column || '');
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
    let count = 0;
    for (let i = 0; i < MAX_NOTE_PASS_EFFECTS; i++) {
      const slot = slots[i];
      if (!slot.active) continue;

      const elapsed = now - slot.startTime;
      if (elapsed > NOTE_PASS_DURATION) {
        slot.active = false;
        continue;
      }

      const t = elapsed / NOTE_PASS_DURATION;
      const scale = 20 * (1 + t * 0.5);
      _dummy.position.set(slot.x, slot.y, 7);
      _dummy.scale.set(scale, scale, 1);
      _dummy.updateMatrix();
      mesh.setMatrixAt(count, _dummy.matrix);
      // AdditiveBlending: color intensity = visual opacity
      _color.setHex(slot.colorHex);
      _color.multiplyScalar(0.6 * (1 - t));
      mesh.setColorAt(count, _color);
      count++;
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_NOTE_PASS_EFFECTS]}
      frustumCulled={false}
    >
      <circleGeometry args={[1, 16]} />
      <meshBasicMaterial transparent opacity={1} blending={THREE.AdditiveBlending} />
    </instancedMesh>
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
