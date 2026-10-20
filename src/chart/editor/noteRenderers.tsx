/**
 * Note Renderers
 *
 * NotesRenderer, HoverPreview, RubberBandRect, DragGhostNotes,
 * EditorJudgmentLine, NotePassEffect
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';
import type { LaneConfig } from '../laneConfig';
import {
  MIN_NOTE_CAPACITY,
  MIN_SELECTION_CAPACITY,
  MIN_LONGNOTE_CAPACITY,
  MIN_LAYER_MARKER_CAPACITY,
  MIN_ACTIVE_FLASH_CAPACITY,
  MIN_BGM_TAIL_CAPACITY,
  NOTE_PADDING,
} from './types';
import type { CustomNoteColors, LayerConfig, LayerKey } from './types';
import { useNoteHeight, getLaneColorHex, getNoteColorHex, getSelectionColorHex, getBgmLaneId, _dummy, _color } from './editorUtils';
import { TextLabels } from './gridRenderers';
import {
  LN_LOOK_BACK,
  VIEWPORT_CULL_MARGIN,
  instanceCapacity,
  lowerBoundByBeat,
  upperBoundByBeat,
  maxNotesInBeatWindow,
  sortNotesByBeat,
} from './noteIndex';

/** BGM tails look back this many beats (WAV duration rarely exceeds it). */
const BGM_LOOK_BACK = 20;

/** Instance counts per NotesRenderer mesh. */
interface NoteMeshCounts {
  notes: number;
  selection: number;
  longNotes: number;
  markers: number;
  flash: number;
  bgmTails: number;
}

const ZERO_COUNTS: NoteMeshCounts = { notes: 0, selection: 0, longNotes: 0, markers: 0, flash: 0, bgmTails: 0 };

/** Note renderer (InstancedMesh-based, viewport culling + dirty check, dynamically sized) */
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
  layerConfig?: LayerConfig;
  highlightKeysound?: string | null;
  /** WAV duration (keysoundId → seconds) for BGM tail visualization */
  wavDurations?: Map<string, number>;
  /** BPM at start (for duration→beats conversion) */
  baseBpm?: number;
  /** Custom note color overrides */
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

  // Sort ascending by beat — re-sorts only when the notes reference changes (O(N log N) once → O(log N) per frame)
  const sortedNotes = useMemo(() => sortNotesByBeat(notes), [notes]);

  // ── Dynamic capacity ──────────────────────────────────────────────────────
  // Estimate how many instances the densest culling window needs so meshes are
  // sized up-front; anything the estimate misses (long notes reaching in from
  // below, layer filters, etc.) is caught by the overflow check in useFrame,
  // which grows the meshes instead of silently dropping notes.
  const cullWindowBeats = viewportBeats * (1 + 2 * VIEWPORT_CULL_MARGIN);
  const estimate = useMemo<NoteMeshCounts>(() => {
    const windowNotes = maxNotesInBeatWindow(sortedNotes, cullWindowBeats);
    let lnCount = 0;
    let markerCount = 0;
    let bgmCount = 0;
    for (const n of sortedNotes) {
      if (n.endBeat !== undefined) lnCount++;
      if (n.additionalKeysounds && n.additionalKeysounds.length > 0) markerCount++;
      if (n.noteType === 'bgm') bgmCount++;
    }
    return {
      notes: windowNotes,
      selection: 0,
      longNotes: 2 * Math.min(lnCount, windowNotes),
      markers: Math.min(markerCount, windowNotes),
      flash: 0,
      bgmTails: Math.min(bgmCount, windowNotes),
    };
  }, [sortedNotes, cullWindowBeats]);

  const [grown, setGrown] = useState<NoteMeshCounts>(ZERO_COUNTS);
  const growPendingRef = useRef(false);

  const notesCap = instanceCapacity(Math.max(estimate.notes, grown.notes), MIN_NOTE_CAPACITY);
  // Visible selected notes can never exceed min(selection size, visible notes)
  const selectionCap = instanceCapacity(
    Math.max(Math.min(selectedNotes.size, estimate.notes), grown.selection),
    MIN_SELECTION_CAPACITY
  );
  const longNoteCap = instanceCapacity(Math.max(estimate.longNotes, grown.longNotes), MIN_LONGNOTE_CAPACITY);
  const markerCap = instanceCapacity(Math.max(estimate.markers, grown.markers), MIN_LAYER_MARKER_CAPACITY);
  const flashCap = instanceCapacity(grown.flash, MIN_ACTIVE_FLASH_CAPACITY);
  const bgmTailCap = instanceCapacity(Math.max(estimate.bgmTails, grown.bgmTails), MIN_BGM_TAIL_CAPACITY);
  const capsKey = `${notesCap}|${selectionCap}|${longNoteCap}|${markerCap}|${flashCap}|${bgmTailCap}`;

  // A capacity change remounts the meshes; allow the next overflow report.
  useEffect(() => {
    growPendingRef.current = false;
  }, [capsKey]);

  const prevDataRef = useRef<{
    notes: EditableBMSNote[];
    selectedNotes: Set<string>;
    beatScale: number;
    scrollBeat: number;
    viewportBeats: number;
    highlightKeysound: string | null | undefined;
    customColors: CustomNoteColors | undefined;
    layerConfig: typeof layerConfig;
    capsKey: string;
    camY: number;
    camZoom: number;
    camHalfH: number;
  }>({ notes: [], selectedNotes: new Set(), beatScale: 0, scrollBeat: -1, viewportBeats: 0, highlightKeysound: undefined, customColors: undefined, layerConfig: undefined, capsKey: '', camY: NaN, camZoom: NaN, camHalfH: NaN });

  useFrame((state) => {
    const notesMesh = notesMeshRef.current;
    const selectionMesh = selectionMeshRef.current;
    const longNoteMesh = longNoteMeshRef.current;
    const layerMarkerMesh = layerMarkerMeshRef.current;
    const activeFlashMesh = activeFlashMeshRef.current;
    if (!notesMesh || !selectionMesh || !longNoteMesh || !layerMarkerMesh) return;

    // Visible beat range straight from the camera (accounts for the fit-to-width
    // zoom, which the scrollBeat/viewportBeats props alone do not).
    const cam = state.camera as THREE.OrthographicCamera;
    const isOrtho = cam.isOrthographicCamera === true;
    const camZoom = isOrtho ? cam.zoom || 1 : 1;
    const camHalfH = isOrtho ? (cam.top - cam.bottom) / 2 / camZoom : 0;
    const camY = cam.position.y;

    const isPlaying = scrollBeatImperativeRef?.current !== undefined;
    const prev = prevDataRef.current;
    if (
      !isPlaying &&
      prev.notes === notes &&
      prev.selectedNotes === selectedNotes &&
      prev.beatScale === beatScale &&
      Math.abs(prev.scrollBeat - scrollBeat) < 0.01 &&
      prev.viewportBeats === viewportBeats &&
      prev.highlightKeysound === highlightKeysound &&
      prev.customColors === customColors &&
      prev.layerConfig === layerConfig &&
      prev.capsKey === capsKey &&
      Math.abs(prev.camY - camY) < 0.5 &&
      Math.abs(prev.camZoom - camZoom) < 1e-4 &&
      Math.abs(prev.camHalfH - camHalfH) < 0.5
    ) {
      return;
    }
    prevDataRef.current = { notes, selectedNotes, beatScale, scrollBeat, viewportBeats, highlightKeysound, customColors, layerConfig, capsKey, camY, camZoom, camHalfH };
    const playBeat = scrollBeatImperativeRef?.current;

    // Visible range + small margin (VIEWPORT_CULL_MARGIN of the visible span on each side)
    let visMin: number;
    let visMax: number;
    if (isOrtho && camHalfH > 0 && beatScale > 0) {
      visMin = (camY - camHalfH) / beatScale;
      visMax = (camY + camHalfH) / beatScale;
    } else {
      visMin = scrollBeat;
      visMax = scrollBeat + viewportBeats;
    }
    const margin = (visMax - visMin) * VIEWPORT_CULL_MARGIN + (beatScale > 0 ? noteHeight / beatScale : 0);
    const minBeat = visMin - margin;
    const maxBeat = visMax + margin;

    let noteCount = 0;
    let selectionCount = 0;
    let longNoteCount = 0;
    let layerMarkerCount = 0;
    let activeFlashCount = 0;

    // Binary search to iterate only the viewport range (long notes covered by up to LN_LOOK_BACK beats)
    const noteStartIdx = lowerBoundByBeat(sortedNotes, minBeat - LN_LOOK_BACK);
    const noteEndIdx = upperBoundByBeat(sortedNotes, maxBeat);

    for (let ni = noteStartIdx; ni < noteEndIdx; ni++) {
      const note = sortedNotes[ni];

      // Layer visibility filter
      const noteLayer = (note.noteType || 'playable') as LayerKey;
      const layerSettings = layerConfig?.[noteLayer];
      if (layerSettings && !layerSettings.visible) continue;

      const noteMaxBeat = note.endBeat ?? note.beat;
      if (noteMaxBeat < minBeat) continue; // ends before the visible window starts

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

      // Note body
      if (noteCount < notesCap) {
        _dummy.position.set(x, y, 0);
        _dummy.scale.set(lane.width - NOTE_PADDING * 2, noteHeight, 1);
        _dummy.updateMatrix();
        notesMesh.setMatrixAt(noteCount, _dummy.matrix);
        _color.setHex(colorHex);
        if (layerOpacity < 1.0) _color.multiplyScalar(layerOpacity);
        notesMesh.setColorAt(noteCount, _color);
      }
      noteCount++;

      // Selection highlight
      if (selectedNotes.has(note.id)) {
        if (selectionCount < selectionCap) {
          _dummy.position.set(x, y, 1);
          _dummy.scale.set(lane.width, noteHeight + 2, 1);
          _dummy.updateMatrix();
          selectionMesh.setMatrixAt(selectionCount, _dummy.matrix);
          _color.setHex(getSelectionColorHex(customColors));
          selectionMesh.setColorAt(selectionCount, _color);
        }
        selectionCount++;
      }

      // Long note body + end cap (two instances)
      if (note.endBeat !== undefined) {
        const endY = note.endBeat * beatScale + noteHeight / 2;
        if (longNoteCount + 1 < longNoteCap) {
          const bodyY = (y + endY) / 2;
          const bodyHeight = Math.abs(endY - y);

          _dummy.position.set(x, bodyY, -0.5);
          _dummy.scale.set(lane.width - NOTE_PADDING * 2, bodyHeight, 1);
          _dummy.updateMatrix();
          longNoteMesh.setMatrixAt(longNoteCount, _dummy.matrix);
          _color.setHex(colorHex);
          longNoteMesh.setColorAt(longNoteCount, _color);

          _dummy.position.set(x, endY, 0);
          _dummy.scale.set(lane.width - NOTE_PADDING * 2, noteHeight, 1);
          _dummy.updateMatrix();
          longNoteMesh.setMatrixAt(longNoteCount + 1, _dummy.matrix);
          longNoteMesh.setColorAt(longNoteCount + 1, _color);
        }
        longNoteCount += 2;
      }

      // Multi-keysound layer marker
      if (note.additionalKeysounds && note.additionalKeysounds.length > 0) {
        if (layerMarkerCount < markerCap) {
          _dummy.position.set(x + lane.width / 2 - 3, y, 1.5);
          _dummy.scale.set(5, 5, 1);
          _dummy.rotation.z = Math.PI / 4;
          _dummy.updateMatrix();
          layerMarkerMesh.setMatrixAt(layerMarkerCount, _dummy.matrix);
          _color.setHex(0xffdd00);
          layerMarkerMesh.setColorAt(layerMarkerCount, _color);
          _dummy.rotation.z = 0;
        }
        layerMarkerCount++;
      }

      // Active note flash near the judgment line
      if (activeFlashMesh && playBeat !== undefined) {
        const dist = Math.abs(note.beat - playBeat);
        if (dist < 0.5) {
          if (activeFlashCount < flashCap) {
            const alpha = 1 - dist * 2;
            _dummy.position.set(x, y, 0.5);
            _dummy.scale.set(lane.width + 4, noteHeight + 4, 1);
            _dummy.updateMatrix();
            activeFlashMesh.setMatrixAt(activeFlashCount, _dummy.matrix);
            _color.setHex(laneColorHex.normal);
            _color.multiplyScalar(alpha);
            activeFlashMesh.setColorAt(activeFlashCount, _color);
          }
          activeFlashCount++;
        }
      }
    }

    notesMesh.count = Math.min(noteCount, notesCap);
    notesMesh.instanceMatrix.needsUpdate = true;
    if (notesMesh.instanceColor) notesMesh.instanceColor.needsUpdate = true;

    selectionMesh.count = Math.min(selectionCount, selectionCap);
    selectionMesh.instanceMatrix.needsUpdate = true;
    if (selectionMesh.instanceColor) selectionMesh.instanceColor.needsUpdate = true;

    longNoteMesh.count = Math.min(longNoteCount, longNoteCap);
    longNoteMesh.instanceMatrix.needsUpdate = true;
    if (longNoteMesh.instanceColor) longNoteMesh.instanceColor.needsUpdate = true;

    layerMarkerMesh.count = Math.min(layerMarkerCount, markerCap);
    layerMarkerMesh.instanceMatrix.needsUpdate = true;
    if (layerMarkerMesh.instanceColor) layerMarkerMesh.instanceColor.needsUpdate = true;

    if (activeFlashMesh) {
      activeFlashMesh.count = Math.min(activeFlashCount, flashCap);
      activeFlashMesh.instanceMatrix.needsUpdate = true;
      if (activeFlashMesh.instanceColor) activeFlashMesh.instanceColor.needsUpdate = true;
    }

    // BGM duration tails
    let tailCount = 0;
    const bgmTailMesh = bgmTailMeshRef.current;
    if (bgmTailMesh && wavDurations && wavDurations.size > 0) {
      const bgmStartIdx = lowerBoundByBeat(sortedNotes, minBeat - BGM_LOOK_BACK);
      for (let bi = bgmStartIdx; bi < noteEndIdx; bi++) {
        const note = sortedNotes[bi];
        if (note.noteType !== 'bgm') continue;
        const dur = wavDurations.get(note.keysound);
        if (!dur || dur <= 0) continue;

        const laneId = getBgmLaneId(note);
        const lane = laneMap.get(laneId);
        if (!lane) continue;

        // Convert seconds to beats using baseBpm
        const durationBeats = (dur / 60) * baseBpm;
        if (note.beat + durationBeats < minBeat) continue;
        if (tailCount < bgmTailCap) {
          const startY = note.beat * beatScale + noteHeight / 2;
          const endY = (note.beat + durationBeats) * beatScale + noteHeight / 2;
          const tailHeight = endY - startY;
          const centerY = (startY + endY) / 2;
          const x = offsetX + lane.x + lane.width / 2;

          _dummy.position.set(x, centerY, -1);
          _dummy.scale.set(Math.max(1, lane.width - NOTE_PADDING * 2 - 2), tailHeight, 1);
          _dummy.updateMatrix();
          bgmTailMesh.setMatrixAt(tailCount, _dummy.matrix);
          _color.setHex(0x666666);
          bgmTailMesh.setColorAt(tailCount, _color);
        }
        tailCount++;
      }
      bgmTailMesh.count = Math.min(tailCount, bgmTailCap);
      bgmTailMesh.instanceMatrix.needsUpdate = true;
      if (bgmTailMesh.instanceColor) bgmTailMesh.instanceColor.needsUpdate = true;
    } else if (bgmTailMesh) {
      bgmTailMesh.count = 0;
      bgmTailMesh.instanceMatrix.needsUpdate = true;
    }

    // Overflow → grow the meshes (power-of-two) on the next render instead of dropping notes
    if (
      !growPendingRef.current && (
        noteCount > notesCap ||
        selectionCount > selectionCap ||
        longNoteCount > longNoteCap ||
        layerMarkerCount > markerCap ||
        activeFlashCount > flashCap ||
        tailCount > bgmTailCap
      )
    ) {
      growPendingRef.current = true;
      const needed: NoteMeshCounts = {
        notes: noteCount,
        selection: selectionCount,
        longNotes: longNoteCount,
        markers: layerMarkerCount,
        flash: activeFlashCount,
        bgmTails: tailCount,
      };
      setGrown((p) => ({
        notes: Math.max(p.notes, needed.notes),
        selection: Math.max(p.selection, needed.selection),
        longNotes: Math.max(p.longNotes, needed.longNotes),
        markers: Math.max(p.markers, needed.markers),
        flash: Math.max(p.flash, needed.flash),
        bgmTails: Math.max(p.bgmTails, needed.bgmTails),
      }));
    }
  });

  // Initialization: set default colors (re-run whenever a mesh is re-created at a new capacity)
  useEffect(() => {
    const meshConfigs: [React.RefObject<THREE.InstancedMesh | null>, number][] = [
      [notesMeshRef, notesCap],
      [selectionMeshRef, selectionCap],
      [longNoteMeshRef, longNoteCap],
      [layerMarkerMeshRef, markerCap],
      [activeFlashMeshRef, flashCap],
      [bgmTailMeshRef, bgmTailCap],
    ];
    _color.setHex(0xffffff);
    for (const [ref, max] of meshConfigs) {
      const mesh = ref.current;
      if (!mesh) continue;
      for (let i = 0; i < max; i++) {
        mesh.setColorAt(i, _color);
      }
      mesh.count = 0;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // Force the next frame to rebuild instance data into the (possibly new) meshes
    prevDataRef.current = { ...prevDataRef.current, capsKey: '' };
  }, [notesCap, selectionCap, longNoteCap, markerCap, flashCap, bgmTailCap]);

  return (
    <group>
      <instancedMesh
        key={`notes-${notesCap}`}
        ref={notesMeshRef}
        args={[undefined, undefined, notesCap]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>

      <instancedMesh
        key={`sel-${selectionCap}`}
        ref={selectionMeshRef}
        args={[undefined, undefined, selectionCap]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0.5} />
      </instancedMesh>

      <instancedMesh
        key={`ln-${longNoteCap}`}
        ref={longNoteMeshRef}
        args={[undefined, undefined, longNoteCap]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0.4} />
      </instancedMesh>

      <instancedMesh
        key={`marker-${markerCap}`}
        ref={layerMarkerMeshRef}
        args={[undefined, undefined, markerCap]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>

      <instancedMesh
        key={`flash-${flashCap}`}
        ref={activeFlashMeshRef}
        args={[undefined, undefined, flashCap]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0.7} blending={THREE.AdditiveBlending} />
      </instancedMesh>

      <instancedMesh
        key={`tail-${bgmTailCap}`}
        ref={bgmTailMeshRef}
        args={[undefined, undefined, bgmTailCap]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0.15} />
      </instancedMesh>

      {/* BGM WAV ID labels */}
      <BgmLabels
        sortedNotes={sortedNotes}
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

/** Maximum number of BGM ID labels rendered at once (one mesh each). */
const MAX_BGM_LABELS = 200;
/** BGM lanes narrower than this (adaptive BGM width) skip labels — the text would spill into neighbours. */
const MIN_BGM_LABEL_LANE_WIDTH = 16;

/** Sub-component that renders WAV ID text labels on BGM notes. */
const BgmLabels = React.memo(function BgmLabels({
  sortedNotes,
  lanes,
  beatScale,
  scrollBeat,
  viewportBeats,
  offsetX,
  layerConfig,
}: {
  /** Notes sorted ascending by beat */
  sortedNotes: EditableBMSNote[];
  lanes: LaneConfig[];
  beatScale: number;
  scrollBeat: number;
  viewportBeats: number;
  offsetX: number;
  layerConfig?: LayerConfig;
}) {
  const bgmVisible = layerConfig?.bgm?.visible ?? true;
  const bgmLanes = useMemo(() => lanes.filter((l) => l.isBgm), [lanes]);
  const bgmLaneMap = useMemo(() => new Map(bgmLanes.map((l) => [l.id, l])), [bgmLanes]);

  const labels = useMemo(() => {
    if (!bgmVisible || bgmLanes.length === 0) return [];
    // At low zoom labels become unreadable and only increase draw calls — hide them
    if (beatScale < 15) return [];

    // Visible range plus a small margin; iterate bottom → top so visible labels fill the cap first
    const margin = viewportBeats * 0.15;
    const minBeat = scrollBeat - margin;
    const maxBeat = scrollBeat + viewportBeats + margin;
    const start = lowerBoundByBeat(sortedNotes, minBeat);
    const end = upperBoundByBeat(sortedNotes, maxBeat);

    const result: { y: number; text: string; laneId: string }[] = [];
    for (let i = start; i < end && result.length < MAX_BGM_LABELS; i++) {
      const note = sortedNotes[i];
      if (note.noteType !== 'bgm') continue;
      const laneId = getBgmLaneId(note);
      const lane = bgmLaneMap.get(laneId);
      if (!lane || lane.width < MIN_BGM_LABEL_LANE_WIDTH) continue;
      result.push({
        y: note.beat * beatScale,
        text: note.keysound,
        laneId,
      });
    }
    return result;
  }, [sortedNotes, bgmLanes, bgmLaneMap, bgmVisible, beatScale, scrollBeat, viewportBeats]);

  // Memoize byLane — TextLabels won't re-render unless labels changes
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

/** Hover preview */
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
  // All hooks must be declared before any early return (rules of hooks)
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

/** Rubber band selection rectangle */
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

/** Ghost note preview during drag move (InstancedMesh-based, 3 draw calls, sized to the selection) */
const MIN_GHOST_CAPACITY = 256;

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

  const ghostLnCount = useMemo(
    () => ghostNotes.reduce((acc, n) => acc + (n.endBeat !== undefined ? 1 : 0), 0),
    [ghostNotes]
  );
  const ghostCapacity = instanceCapacity(ghostNotes.length, MIN_GHOST_CAPACITY);
  const ghostLnCapacity = instanceCapacity(ghostLnCount, MIN_GHOST_CAPACITY);

  const laneIndexMap = useMemo(
    () => new Map(lanes.map((lane, i) => [lane.id, i] as const)),
    [lanes]
  );

  useFrame(() => {
    const ghostMesh = ghostMeshRef.current;
    const ghostLnBody = ghostLnBodyMeshRef.current;
    const ghostLnCap = ghostLnCapMeshRef.current;
    if (!ghostMesh || !ghostLnBody || !ghostLnCap) return;

    let noteCount = 0;
    let lnCount = 0;

    for (const note of ghostNotes) {
      if (noteCount >= ghostCapacity) break;

      const noteLaneId = note.noteType === 'bgm' ? getBgmLaneId(note) : note.column;
      const currentLaneIdx = noteLaneId !== undefined ? (laneIndexMap.get(noteLaneId) ?? -1) : -1;
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
      if (note.endBeat !== undefined && lnCount < ghostLnCapacity) {
        const endY = (note.endBeat + beatDelta) * beatScale + noteHeight / 2;
        const bodyY = (y + endY) / 2;
        const bodyHeight = Math.abs(endY - y);

        _dummy.position.set(x, bodyY, 2);
        _dummy.scale.set(laneWidth, bodyHeight, 1);
        _dummy.updateMatrix();
        ghostLnBody.setMatrixAt(lnCount, _dummy.matrix);

        _dummy.position.set(x, endY, 3);
        _dummy.scale.set(laneWidth, noteHeight, 1);
        _dummy.updateMatrix();
        ghostLnCap.setMatrixAt(lnCount, _dummy.matrix);
        lnCount++;
      }
    }

    ghostMesh.count = noteCount;
    ghostMesh.instanceMatrix.needsUpdate = true;

    ghostLnBody.count = lnCount;
    ghostLnBody.instanceMatrix.needsUpdate = true;

    ghostLnCap.count = lnCount;
    ghostLnCap.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        key={`ghost-${ghostCapacity}`}
        ref={ghostMeshRef}
        args={[undefined, undefined, ghostCapacity]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#00ffff" transparent opacity={0.4} />
      </instancedMesh>
      <instancedMesh
        key={`ghost-body-${ghostLnCapacity}`}
        ref={ghostLnBodyMeshRef}
        args={[undefined, undefined, ghostLnCapacity]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#00ffff" transparent opacity={0.2} />
      </instancedMesh>
      <instancedMesh
        key={`ghost-cap-${ghostLnCapacity}`}
        ref={ghostLnCapMeshRef}
        args={[undefined, undefined, ghostLnCapacity]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#00ffff" transparent opacity={0.4} />
      </instancedMesh>
    </group>
  );
});

/** Note pass effect (InstancedMesh-based, 1 draw call) */
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

/** Judgment line (horizontal line showing current playback position) */
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
