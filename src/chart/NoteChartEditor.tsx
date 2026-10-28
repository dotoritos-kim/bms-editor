/**
 * NoteChartEditor Component
 *
 * Component that displays a BMS note chart in editable form.
 * Module structure:
 *   editor/types.ts         — types, constants, interfaces
 *   editor/editorUtils.ts   — pure utility functions (snap, color, conversion)
 *   editor/gridRenderers.tsx — lane/measure line/BPM/STOP renderers
 *   editor/noteRenderers.tsx — note/hover/ghost/effect renderers
 *   editor/EditorToolbar.tsx — editor toolbar
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';

/** True when a keyboard event originates from a text-entry element (input, textarea, select, contenteditable). */
function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target.isContentEditable;
}
import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { cn } from '../utils';
import type { NoteType, EditableBMSNote } from '@rhythm-archive/bms-core';
import { generateLaneConfig } from './laneConfig';

// Sub-module imports
import {
  DEFAULT_NOTE_HEIGHT,
  isLayerInteractable,
  type NoteChartEditorProps,
  type CoordConverter,
  type LayerKey,
} from './editor/types';

/** Default beatScale per key mode (px/beat) */
function defaultBeatScaleForKeyMode(keyMode: string): number {
  if (['4K', '5K', '6K', '7K'].includes(keyMode)) return 20;
  if (['8K', '9K', '10K'].includes(keyMode)) return 15;
  if (['12K', '14K'].includes(keyMode)) return 12;
  if (['18K', '24K'].includes(keyMode)) return 8;
  if (keyMode === '48K') return 4;
  return 20;
}
import { NoteHeightContext, useNoteHeight, snapBeatToGrid, getBgmLaneId, isBgmLaneId, bgmLaneIdToChannel } from './editor/editorUtils';
import { LanesRenderer, MeasureLinesRenderer, BpmMarkersRenderer, StopMarkersRenderer, CurrentMeasureHighlight } from './editor/gridRenderers';
import { NotesRenderer, HoverPreview, RubberBandRect, DragGhostNotes, NotePassEffect, EditorJudgmentLine } from './editor/noteRenderers';
import {
  sortNotesByBeat, lowerBoundByBeat, upperBoundByBeat, findClosestNoteByBeat,
  noteHitHalfHeight, findClosestLongNoteEnd, findLongNoteBodyAt,
} from './editor/noteIndex';

/** Pointer travel (screen px) below which a press on a note is a click, not a drag. */
const DRAG_THRESHOLD_PX = 4;

/** Only playable lane notes can become long notes. */
function canBeLongNote(note: EditableBMSNote): boolean {
  return (note.noteType === undefined || note.noteType === 'playable') && note.column !== undefined;
}

/** Translucent head / body / end preview of a long note being created or resized. */
function LongNotePreview({ x, width, startY, endY, noteHeight, color }: {
  x: number; width: number; startY: number; endY: number; noteHeight: number; color: string;
}) {
  return (
    <group>
      <mesh position={[x, startY, 3]}><planeGeometry args={[width, noteHeight]} /><meshBasicMaterial color={color} transparent opacity={0.6} /></mesh>
      <mesh position={[x, (startY + endY) / 2, 2]}><planeGeometry args={[width, Math.abs(endY - startY)]} /><meshBasicMaterial color={color} transparent opacity={0.25} /></mesh>
      <mesh position={[x, endY, 3]}><planeGeometry args={[width, noteHeight]} /><meshBasicMaterial color={color} transparent opacity={0.6} /></mesh>
    </group>
  );
}

// Re-exports for backwards compatibility
export { EditorToolbar } from './editor/EditorToolbar';
export {
  GRID_SNAP_OPTIONS,
  DEFAULT_LAYER_SETTINGS,
  DEFAULT_LAYER_CONFIG,
  isLayerInteractable,
  isLayerVisible,
  getLayerOpacity,
} from './editor/types';
export type {
  EditorTool,
  SelectedNoteType,
  GridSnap,
  NoteChartEditorProps,
  NoteConvertTarget,
  ZoomControl,
  CustomNoteColors,
  LayerKey,
  LayerSettings,
  LayerConfig,
} from './editor/types';

/** Internal editor canvas component */
function EditorCanvas({
  notes,
  keyMode,
  totalBeats,
  beatScale: initialBeatScale = 20,
  activeTool,
  gridSnap,
  snapEnabled = true,
  gridSnapOverrides,
  layerConfig,
  selectedNotes,
  selectedNoteType,
  currentKeysound,
  bpmChanges,
  stopEvents,
  baseBpm,
  timeSignatures,
  onNoteAdd,
  onNoteDelete,
  onNoteMove,
  onNoteSelect,
  onNoteUpdate,
  onNotesConvert,
  onBpmChange,
  onBpmRequest,
  onBpmEditRequest,
  onStopRequest,
  onStopEditRequest,
  onStopDelete,
  onKeysoundAssign,
  onDropKeysound: _onDropKeysound,
  onNoteHover,
  highlightKeysound,
  scrollToBeat: externalScrollBeat,
  onScrollChange,
  coordConverterRef,
  scrollBeatImperativeRef,
  bgmChannelCount,
  zoomControlRef,
  onBeatScaleChange,
  customColors,
}: Omit<NoteChartEditorProps, 'height' | 'className' | 'hasUnsavedChanges' | 'branchName' | 'noteHeight'> & {
  coordConverterRef?: React.MutableRefObject<CoordConverter | null>;
  scrollBeatImperativeRef?: React.RefObject<number>;
}) {
  const { camera, gl, size } = useThree();
  const noteHeight = useNoteHeight();
  const [scrollBeat, setScrollBeat] = useState(-4); // Start slightly below beat 0 so bottom edge isn't flush with window
  const [beatScale, setBeatScale] = useState(() =>
    initialBeatScale === 20 ? defaultBeatScaleForKeyMode(keyMode) : initialBeatScale
  );
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ beat: number; column: string } | null>(null);
  const [resizing, setResizing] = useState<{ noteId: string; startEndBeat: number } | null>(null);
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [dragDelta, setDragDelta] = useState<{ beatDelta: number; columnDelta: number } | null>(null);
  // LN drag creation state
  const [lnDragCreate, setLnDragCreate] = useState<{ startBeat: number; column: string; currentEndBeat: number } | null>(null);
  // Snap guideline: nearest note beat when hovering/dragging
  const [snapGuideBeat, setSnapGuideBeat] = useState<number | null>(null);
  const pointerUpProcessedRef = useRef(false);
  // Notes being dragged, fixed at pointer-down (the selection prop may lag a render behind)
  const dragNoteIdsRef = useRef<string[]>([]);
  // Screen position of the pointer-down that started a drag / resize
  const pressClientRef = useRef({ x: 0, y: 0 });
  const pendingBeatScaleRef = useRef<number | null>(null);
  // Suppress hover preview during scroll (wheel)
  const scrollSuppressRef = useRef(false);
  const scrollSuppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialBeatScaleReportedRef = useRef(false);
  // Double-click detection for stop/bpm editing in select mode
  const lastClickRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });

  const scrollBeatRef = useRef(scrollBeat);
  const beatScaleRef = useRef(beatScale);
  const viewportBeatsRef = useRef(16);
  scrollBeatRef.current = scrollBeat;
  beatScaleRef.current = beatScale;

  const lanes = useMemo(() => generateLaneConfig(keyMode, bgmChannelCount), [keyMode, bgmChannelCount]);
  const totalWidth = useMemo(() => {
    const last = lanes[lanes.length - 1];
    return last ? last.x + last.width : 0;
  }, [lanes]);
  const totalHeight = totalBeats * beatScale;
  const offsetX = -totalWidth / 2;

  const CONTENT_PADDING = 85;
  const contentWidth = totalWidth + CONTENT_PADDING;
  // Camera zoom the useFrame below converges to (fit content width, max 4x).
  const targetZoom = size.width > 0 && contentWidth > 0 ? Math.min(size.width / contentWidth, 4) : 1;
  // World-space viewport height in beats. Must divide by the zoom: with a wide
  // lane layout (zoom < 1) the screen shows more beats than size.height / beatScale.
  const viewportBeats = size.height / (targetZoom > 0 ? targetZoom : 1) / beatScale;

  // Beat-sorted views for O(log N) hit-testing (shared by pointer handlers)
  const sortedNotes = useMemo(() => sortNotesByBeat(notes), [notes]);
  const longNotes = useMemo(() => notes.filter((n) => n.endBeat !== undefined), [notes]);
  const laneMap = useMemo(() => new Map(lanes.map((l) => [l.id, l])), [lanes]);

  // Sync external scroll position
  const prevExternalScrollRef = useRef(externalScrollBeat);
  const isExternalUpdateRef = useRef(false);
  useEffect(() => {
    if (externalScrollBeat !== undefined && externalScrollBeat !== prevExternalScrollRef.current) {
      prevExternalScrollRef.current = externalScrollBeat;
      const maxScroll = Math.max(0, totalBeats - viewportBeatsRef.current + 4);
      const clamped = Math.max(0, Math.min(maxScroll, externalScrollBeat));
      isExternalUpdateRef.current = true;
      setScrollBeat(clamped);
    }
  }, [externalScrollBeat, totalBeats]);

  useEffect(() => {
    if (isExternalUpdateRef.current) { isExternalUpdateRef.current = false; return; }
    onScrollChange?.(scrollBeat);
  }, [scrollBeat, onScrollChange]);

  // Mouse wheel scroll + Ctrl+Wheel zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Suppress hover preview during scroll to avoid unintended keysound playback
      scrollSuppressRef.current = true;
      if (scrollSuppressTimerRef.current) clearTimeout(scrollSuppressTimerRef.current);
      scrollSuppressTimerRef.current = setTimeout(() => { scrollSuppressRef.current = false; }, 150);
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY > 0 ? (1 / 1.15) : 1.15;
        const newScale = Math.max(2, Math.min(200, Math.round(beatScaleRef.current * factor)));
        // Anchor zoom to cursor: keep the beat under the mouse fixed
        const rect = gl.domElement.getBoundingClientRect();
        const cursorYFraction = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        const oldViewportBeats = viewportBeatsRef.current;
        const newViewportBeats = oldViewportBeats * beatScaleRef.current / newScale;
        const cursorBeat = scrollBeatRef.current + cursorYFraction * oldViewportBeats;
        const newScrollBeat = cursorBeat - cursorYFraction * newViewportBeats;
        const maxScroll = Math.max(0, totalBeats - newViewportBeats + 4);
        setBeatScale(newScale);
        pendingBeatScaleRef.current = newScale;
        setScrollBeat(Math.max(0, Math.min(maxScroll, newScrollBeat)));
      } else {
        const delta = e.deltaY > 0 ? -4 : 4;
        const maxScroll = Math.max(0, totalBeats - viewportBeatsRef.current + 4);
        setScrollBeat((prev) => Math.max(0, Math.min(maxScroll, prev + delta)));
      }
    };
    gl.domElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => gl.domElement.removeEventListener('wheel', handleWheel);
  }, [gl.domElement, totalBeats]);

  // Tool-specific cursor (+ grabbing when dragging)
  useEffect(() => {
    if (isDragging) {
      gl.domElement.style.cursor = 'grabbing';
      return;
    }
    const cursorMap: Record<string, string> = {
      select: 'default', addNote: 'cell', delete: 'crosshair',
      move: 'grab', keysound: 'pointer', bpm: 'cell', stop: 'cell',
    };
    gl.domElement.style.cursor = cursorMap[activeTool] || 'default';
  }, [activeTool, isDragging, gl.domElement]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableEventTarget(e.target)) return; // typing in a field — leave the keys alone
      switch (e.key) {
        case 'PageUp': {
          e.preventDefault();
          const maxScroll = Math.max(0, totalBeats - viewportBeatsRef.current + 4);
          setScrollBeat((prev) => Math.min(maxScroll, prev + 16));
          break;
        }
        case 'PageDown': e.preventDefault(); setScrollBeat((prev) => Math.max(0, prev - 16)); break;
        case 'Home': e.preventDefault(); setScrollBeat(0); break;
        case 'End': {
          e.preventDefault();
          const maxScroll = Math.max(0, totalBeats - viewportBeatsRef.current + 4);
          setScrollBeat(maxScroll);
          break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalBeats]);

  // Camera update
  const contentWidthRef = useRef(contentWidth);
  contentWidthRef.current = contentWidth;

  // Priority -1: update the camera before the renderers' useFrame callbacks so
  // their camera-based viewport culling sees this frame's position (no lag).
  // Negative priorities do not take over R3F's render loop.
  useFrame(() => {
    const orthoCamera = camera as THREE.OrthographicCamera;
    if (size.width > 0 && contentWidthRef.current > 0) {
      const targetZoom = Math.min(size.width / contentWidthRef.current, 4);
      const diff = Math.abs(orthoCamera.zoom - targetZoom);
      if (diff > 0.001) {
        orthoCamera.zoom = diff < 0.01 ? targetZoom : THREE.MathUtils.lerp(orthoCamera.zoom, targetZoom, 0.15);
        orthoCamera.updateProjectionMatrix();
      }
    }
    const zoom = orthoCamera.zoom || 1;
    const viewportHeight = size.height / zoom;
    viewportBeatsRef.current = viewportHeight / beatScaleRef.current;
    const effectiveScrollBeat = scrollBeatImperativeRef?.current ?? scrollBeatRef.current;
    const targetY = effectiveScrollBeat * beatScaleRef.current + viewportHeight / 2;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.15);
    // Report initial beatScale once (first frame after mount)
    if (!initialBeatScaleReportedRef.current) {
      initialBeatScaleReportedRef.current = true;
      onBeatScaleChange?.(beatScaleRef.current);
    }
    // rAF debounce: if pendingBeatScaleRef is set, call onBeatScaleChange then clear
    if (pendingBeatScaleRef.current !== null) {
      onBeatScaleChange?.(pendingBeatScaleRef.current);
      pendingBeatScaleRef.current = null;
    }
  }, -1);

  // Coordinate conversion
  const _screenVec = useMemo(() => new THREE.Vector3(), []);
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((screenX - rect.left) / rect.width) * 2 - 1;
      const y = -((screenY - rect.top) / rect.height) * 2 + 1;
      _screenVec.set(x, y, 0);
      _screenVec.unproject(camera);
      return { x: _screenVec.x, y: _screenVec.y };
    },
    [camera, gl.domElement, _screenVec]
  );

  // Shift key tracking for free move (snap bypass)
  // Track actual pointer position to avoid false hover events when camera lerps after scroll
  const lastPointerClientRef = useRef({ x: -1, y: -1 });

  const shiftHeldRef = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const worldToLaneBeat = useCallback(
    (worldX: number, worldY: number) => {
      const relativeX = worldX - offsetX;
      let column: string | null = null;
      for (const lane of lanes) {
        if (relativeX >= lane.x && relativeX < lane.x + lane.width) { column = lane.id; break; }
      }
      const rawBeat = worldY / beatScale;
      // Snap 3-stage: snapEnabled OFF → free, Shift held → free, otherwise → grid snap
      const beat = (snapEnabled && !shiftHeldRef.current) ? snapBeatToGrid(rawBeat, gridSnap) : rawBeat;
      return { column, beat };
    },
    [lanes, offsetX, beatScale, gridSnap, snapEnabled]
  );

  useEffect(() => {
    if (coordConverterRef) {
      coordConverterRef.current = {
        screenToWorldBeat: (clientX: number, clientY: number) => {
          const world = screenToWorld(clientX, clientY);
          const result = worldToLaneBeat(world.x, world.y);
          if (!result.column) return null;
          return { beat: result.beat, column: result.column };
        },
      };
    }
    return () => { if (coordConverterRef) coordConverterRef.current = null; };
  }, [coordConverterRef, screenToWorld, worldToLaneBeat]);

  // Keep size and totalBeats in refs for latest-value access in fitToChart
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const totalBeatsZoomRef = useRef(totalBeats);
  totalBeatsZoomRef.current = totalBeats;

  useEffect(() => {
    if (!zoomControlRef) return;
    zoomControlRef.current = {
      zoomIn: () => {
        setBeatScale((prev) => {
          const n = Math.min(200, Math.round(prev * 1.3));
          pendingBeatScaleRef.current = n;
          return n;
        });
      },
      zoomOut: () => {
        setBeatScale((prev) => {
          const n = Math.max(2, Math.round(prev / 1.3));
          pendingBeatScaleRef.current = n;
          return n;
        });
      },
      zoomTo: (scale: number) => {
        const n = Math.max(2, Math.min(200, Math.round(scale)));
        setBeatScale(n);
        pendingBeatScaleRef.current = n;
      },
      fitToChart: () => {
        const ortho = camera as THREE.OrthographicCamera;
        const zoom = ortho.zoom || 1;
        const viewH = sizeRef.current.height / zoom;
        const tb = totalBeatsZoomRef.current;
        const n = tb > 0 ? Math.max(2, Math.min(200, Math.round(viewH / (tb * 1.1)))) : 20;
        setBeatScale(n);
        setScrollBeat(0);
        pendingBeatScaleRef.current = n;
      },
    };
    return () => { if (zoomControlRef) zoomControlRef.current = null; };
  }, [zoomControlRef, camera]);

  const worldToLaneRawBeat = useCallback(
    (worldX: number, worldY: number) => {
      const relativeX = worldX - offsetX;
      let column: string | null = null;
      for (const lane of lanes) {
        if (relativeX >= lane.x && relativeX < lane.x + lane.width) { column = lane.id; break; }
      }
      return { column, rawBeat: worldY / beatScale };
    },
    [lanes, offsetX, beatScale]
  );

  // Hit detection. Notes are drawn centred at beat * beatScale + noteHeight / 2,
  // so hit-tests compare that centre against the pointer with a tolerance of
  // the note's half-height (never under a few screen pixels at the current zoom).
  const hitTarget = useCallback(
    (worldX: number, worldY: number) => {
      const { column, rawBeat } = worldToLaneRawBeat(worldX, worldY);
      const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
      return {
        column,
        centerBeat: rawBeat - noteHeight / 2 / beatScale,
        tolerance: noteHitHalfHeight(noteHeight, zoom) / beatScale,
      };
    },
    [worldToLaneRawBeat, camera, noteHeight, beatScale]
  );

  const findNoteAtPosition = useCallback(
    (worldX: number, worldY: number): EditableBMSNote | null => {
      const { column, centerBeat, tolerance } = hitTarget(worldX, worldY);
      if (!column) return null;
      const bgmLane = isBgmLaneId(column);
      const matches = (note: EditableBMSNote) => {
        // Skip notes on locked/hidden layers
        const noteLayer = (note.noteType || 'playable') as LayerKey;
        if (!isLayerInteractable(noteLayer, layerConfig)) return false;
        if (bgmLane) return note.noteType === 'bgm' && getBgmLaneId(note) === column;
        return note.column === column;
      };
      // Binary search: only notes whose head lies within the click tolerance are tested
      const head = findClosestNoteByBeat(sortedNotes, centerBeat, tolerance, matches);
      if (head || bgmLane) return head;
      // A long note can also be grabbed by its body
      return findLongNoteBodyAt(longNotes, centerBeat, matches);
    },
    [hitTarget, sortedNotes, longNotes, layerConfig]
  );

  /** Long note whose end cap is under the pointer, with its distance in beats. */
  const findLongNoteEndAtPosition = useCallback(
    (worldX: number, worldY: number): { note: EditableBMSNote; dist: number } | null => {
      const { column, centerBeat, tolerance } = hitTarget(worldX, worldY);
      if (!column || isBgmLaneId(column)) return null;
      return findClosestLongNoteEnd(longNotes, centerBeat, tolerance, (note) =>
        note.column === column && isLayerInteractable((note.noteType || 'playable') as LayerKey, layerConfig));
    },
    [hitTarget, longNotes, layerConfig]
  );

  /**
   * Pointer down on the end cap of a long note — or on any note when
   * `allowShortNote` (Alt-drag / long-note tool) — starts dragging its end.
   * A short note dragged this way becomes a long note.
   */
  const tryStartLongNoteResize = useCallback(
    (worldX: number, worldY: number, clientX: number, clientY: number, allowShortNote: boolean): boolean => {
      const end = findLongNoteEndAtPosition(worldX, worldY);
      const head = findNoteAtPosition(worldX, worldY);
      let target: EditableBMSNote | null = null;
      if (end) {
        // Prefer the head when the pointer is closer to it (short long notes)
        const { centerBeat } = hitTarget(worldX, worldY);
        const headDist = head ? Math.abs(head.beat - centerBeat) : Infinity;
        if (end.dist <= headDist) target = end.note;
      }
      if (!target && allowShortNote && head && canBeLongNote(head)) target = head;
      if (!target) return false;
      setResizing({ noteId: target.id, startEndBeat: target.endBeat ?? target.beat });
      setDragStart({ x: worldX, y: worldY });
      pressClientRef.current = { x: clientX, y: clientY };
      onNoteSelect([target.id]);
      return true;
    },
    [findLongNoteEndAtPosition, findNoteAtPosition, hitTarget, onNoteSelect]
  );

  /** Grid-snapped end beat for a long-note resize with the end cap under the pointer. */
  const resizeEndBeat = useCallback(
    (worldY: number, note: EditableBMSNote): number => {
      const rawEnd = (worldY - noteHeight / 2) / beatScale;
      const end = (snapEnabled && !shiftHeldRef.current) ? snapBeatToGrid(rawEnd, gridSnap) : rawEnd;
      return Math.max(end, note.beat + Math.max(4 / gridSnap, 0.25));
    },
    [noteHeight, beatScale, snapEnabled, gridSnap]
  );

  const findNotesInRect = useCallback(
    (x1: number, y1: number, x2: number, y2: number): string[] => {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minBeat = (Math.min(y1, y2) - noteHeight / 2) / beatScale;
      const maxBeat = (Math.max(y1, y2) - noteHeight / 2) / beatScale;
      const ids: string[] = [];
      const end = upperBoundByBeat(sortedNotes, maxBeat);
      for (let i = lowerBoundByBeat(sortedNotes, minBeat); i < end; i++) {
        const note = sortedNotes[i];
        const laneId = note.noteType === 'bgm' ? getBgmLaneId(note) : note.column;
        const lane = laneId !== undefined ? laneMap.get(laneId) : undefined;
        if (!lane) continue;
        const noteX = offsetX + lane.x + lane.width / 2;
        if (noteX >= minX && noteX <= maxX) ids.push(note.id);
      }
      return ids;
    },
    [sortedNotes, laneMap, offsetX, beatScale, noteHeight]
  );

  // Event handlers
  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const { clientX, clientY } = e.nativeEvent;
      const pointerActuallyMoved =
        clientX !== lastPointerClientRef.current.x || clientY !== lastPointerClientRef.current.y;
      lastPointerClientRef.current = { x: clientX, y: clientY };

      const world = screenToWorld(clientX, clientY);
      const { column, beat } = worldToLaneBeat(world.x, world.y);

      if (column && beat >= 0) setHoverPosition({ beat, column });
      else setHoverPosition(null);

      const idle = !isDragging && !rubberBand && !resizing && !lnDragCreate;
      if ((onNoteHover || (idle && activeTool === 'select')) && pointerActuallyMoved && !scrollSuppressRef.current) {
        const hoveredNote = findNoteAtPosition(world.x, world.y);
        onNoteHover?.(hoveredNote?.keysound && hoveredNote.keysound !== '00' ? hoveredNote.keysound : null);
        // Select tool: show what a press would do (resize an LN end / move a note)
        if (idle && activeTool === 'select') {
          const end = findLongNoteEndAtPosition(world.x, world.y);
          gl.domElement.style.cursor = end ? 'ns-resize' : hoveredNote ? 'grab' : 'default';
        }
      }

      if (rubberBand) {
        // Clamp Y to [0, totalHeight] so rubber band stays within the chart (doesn't bleed into status bar)
        const clampedY = Math.max(0, Math.min(totalHeight, world.y));
        setRubberBand((prev) => prev ? { ...prev, endX: world.x, endY: clampedY } : null);
      }

      if (resizing && dragStart) {
        const note = notes.find((n) => n.id === resizing.noteId);
        if (note) setDragDelta({ beatDelta: resizeEndBeat(world.y, note) - resizing.startEndBeat, columnDelta: 0 });
      }

      if (isDragging && dragStart && (activeTool === 'move' || activeTool === 'select')) {
        const { beat: startBeat } = worldToLaneBeat(dragStart.x, dragStart.y);
        const beatDelta = beat - startBeat;
        const startLaneIdx = lanes.findIndex((l) => { const relX = dragStart.x - offsetX; return relX >= l.x && relX < l.x + l.width; });
        const endLaneIdx = lanes.findIndex((l) => l.id === column);
        const columnDelta = endLaneIdx >= 0 && startLaneIdx >= 0 ? endLaneIdx - startLaneIdx : 0;
        setDragDelta({ beatDelta, columnDelta });
      }

      // LN drag creation: update endBeat as user drags
      if (lnDragCreate && dragStart) {
        const minEnd = lnDragCreate.startBeat + Math.max(4 / gridSnap, 0.25);
        setLnDragCreate((prev) => prev ? { ...prev, currentEndBeat: Math.max(beat, minEnd) } : null);
      }

      // Snap guideline: find nearest existing note beat in same column (viewport only)
      if (column && (activeTool === 'addNote' || activeTool === 'move' || (activeTool === 'select' && isDragging))) {
        const rawBeat = world.y / beatScale;
        const tolerance = 16 / beatScale; // 16px snap range
        let nearest: number | null = null;
        let nearestDist = tolerance;
        // Binary search: only notes within the snap tolerance of the pointer
        const end = upperBoundByBeat(sortedNotes, rawBeat + tolerance);
        for (let i = lowerBoundByBeat(sortedNotes, rawBeat - tolerance); i < end; i++) {
          const n = sortedNotes[i];
          if (n.column !== column && n.noteType !== 'bgm') continue;
          const dist = Math.abs(n.beat - rawBeat);
          if (dist < nearestDist && dist > 0.001) {
            nearestDist = dist;
            nearest = n.beat;
          }
        }
        setSnapGuideBeat(nearest);
      } else {
        setSnapGuideBeat(null);
      }
    },
    [screenToWorld, worldToLaneBeat, isDragging, dragStart, rubberBand, activeTool, lanes, offsetX, resizing, notes, sortedNotes, beatScale, gridSnap, totalHeight, onNoteHover, findNoteAtPosition, findLongNoteEndAtPosition, resizeEndBeat, gl.domElement, lnDragCreate]
  );

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      pointerUpProcessedRef.current = false;
      const world = screenToWorld(e.nativeEvent.clientX, e.nativeEvent.clientY);
      const { column, beat } = worldToLaneBeat(world.x, world.y);
      if (!column || beat < 0 || beat > totalBeats) return;
      const { clientX, clientY } = e.nativeEvent;
      if (e.nativeEvent.button === 2) {
        // Right-click on an unselected note selects it so the context menu acts on it
        const clickedNote = findNoteAtPosition(world.x, world.y);
        if (clickedNote && !selectedNotes.has(clickedNote.id)) onNoteSelect([clickedNote.id]);
        return;
      }
      const startNoteDrag = (ids: string[]) => {
        dragNoteIdsRef.current = ids;
        pressClientRef.current = { x: clientX, y: clientY };
        setIsDragging(true);
        setDragStart({ x: world.x, y: world.y });
      };

      switch (activeTool) {
        case 'select': {
          // LN end cap → resize; Alt+drag on a short note → stretch it into a long note
          if (tryStartLongNoteResize(world.x, world.y, clientX, clientY, e.nativeEvent.altKey)) break;
          const clickedNote = findNoteAtPosition(world.x, world.y);
          if (clickedNote) {
            if (e.nativeEvent.ctrlKey || e.nativeEvent.metaKey) {
              onNoteSelect([clickedNote.id], true);
            } else if (selectedNotes.has(clickedNote.id)) {
              // DAW-style: dragging a selected note moves the whole selection
              startNoteDrag(Array.from(selectedNotes));
            } else {
              // Press on an unselected note selects it and can drag it right away
              onNoteSelect([clickedNote.id]);
              startNoteDrag([clickedNote.id]);
            }
          } else {
            // Double-click empty space → edit nearby stop/bpm event
            const now = performance.now();
            const last = lastClickRef.current;
            const isDblClick = now - last.time < 350 && Math.abs(world.x - last.x) < 10 && Math.abs(world.y - last.y) < 10;
            lastClickRef.current = { time: now, x: world.x, y: world.y };

            if (isDblClick) {
              const rawBeat = world.y / beatScale;
              const tol = 8 / beatScale;
              const existingStop = stopEvents?.find((s) => Math.abs(s.measure * 4 + s.fraction * 4 - rawBeat) < tol);
              if (existingStop && onStopEditRequest) { onStopEditRequest(existingStop); break; }
              const existingBpm = bpmChanges?.find((c) => Math.abs(c.measure * 4 + c.fraction * 4 - rawBeat) < tol);
              if (existingBpm && onBpmEditRequest) { onBpmEditRequest(existingBpm); break; }
            }

            if (!e.nativeEvent.ctrlKey && !e.nativeEvent.metaKey) onNoteSelect([]);
            setRubberBand({ startX: world.x, startY: world.y, endX: world.x, endY: world.y });
          }
          break;
        }
        case 'addNote': {
          const isBgm = isBgmLaneId(column) || selectedNoteType === 'bgm';
          const isLN = !isBgm && selectedNoteType === 'longNote';
          // Long-note tool on an existing note: drag its end (a short note becomes a long note)
          if (isLN && tryStartLongNoteResize(world.x, world.y, clientX, clientY, true)) break;
          if (isLN) {
            // Start LN drag creation — finalized on pointerUp
            setLnDragCreate({ startBeat: beat, column, currentEndBeat: beat + Math.max(4 / gridSnap, 0.25) });
            setDragStart({ x: world.x, y: world.y });
          } else {
            // measure/fraction are recalculated tick-based in store.addNote
            const noteType: NoteType = isBgm ? 'bgm' : (selectedNoteType as NoteType);
            const bgmChannel = isBgmLaneId(column) ? bgmLaneIdToChannel(column) : undefined;
            onNoteAdd({
              beat, measure: 0, fraction: 0,
              tick: Math.round(beat * 960),
              column: isBgm ? undefined : column,
              keysound: currentKeysound,
              noteType,
              channel: '',
              bgmChannel,
            });
          }
          break;
        }
        case 'delete': {
          const clickedNote = findNoteAtPosition(world.x, world.y);
          if (clickedNote) {
            onNoteDelete([clickedNote.id]);
          } else if (stopEvents && onStopDelete) {
            const rawBeat = world.y / beatScale;
            const stopClickTolerance = 8 / beatScale;
            const existingStop = stopEvents.find((s) => Math.abs(s.measure * 4 + s.fraction * 4 - rawBeat) < stopClickTolerance);
            if (existingStop) onStopDelete(existingStop);
          }
          break;
        }
        case 'move': {
          const clickedNote = findNoteAtPosition(world.x, world.y);
          if (clickedNote) {
            if (selectedNotes.has(clickedNote.id)) {
              startNoteDrag(Array.from(selectedNotes));
            } else {
              onNoteSelect([clickedNote.id]);
              startNoteDrag([clickedNote.id]);
            }
          }
          break;
        }
        case 'keysound': {
          const clickedNote = findNoteAtPosition(world.x, world.y);
          if (clickedNote && onKeysoundAssign) onKeysoundAssign(clickedNote.id, currentKeysound);
          break;
        }
        case 'bpm': {
          const rawBeat = world.y / beatScale;
          const clickTolerance = 2 / beatScale;
          const existingBpm = bpmChanges?.find((c) => Math.abs(c.measure * 4 + c.fraction * 4 - rawBeat) < clickTolerance);
          if (existingBpm && onBpmEditRequest) onBpmEditRequest(existingBpm);
          else if (onBpmRequest) onBpmRequest(beat);
          else if (onBpmChange) onBpmChange(beat, baseBpm || 120);
          break;
        }
        case 'stop': {
          const rawBeat = world.y / beatScale;
          const stopClickTolerance = 8 / beatScale;
          const existingStop = stopEvents?.find((s) => Math.abs(s.measure * 4 + s.fraction * 4 - rawBeat) < stopClickTolerance);
          if (existingStop && onStopEditRequest) onStopEditRequest(existingStop);
          else if (onStopRequest) onStopRequest(beat);
          break;
        }
      }
    },
    [activeTool, screenToWorld, worldToLaneBeat, findNoteAtPosition, tryStartLongNoteResize, selectedNotes, selectedNoteType, currentKeysound, baseBpm, beatScale, totalBeats, gridSnap, bpmChanges, onNoteAdd, onNoteDelete, onNoteSelect, onBpmChange, onBpmRequest, onBpmEditRequest, onStopRequest, onStopEditRequest, onStopDelete, stopEvents, onKeysoundAssign]
  );

  // Pointer released outside the canvas: the R3F group never sees the
  // pointerup, so the drag / rubber-band / LN-create / resize state would
  // stick until the next click completed the stale gesture. Cancel it here.
  const gestureActive = isDragging || rubberBand !== null || lnDragCreate !== null || resizing !== null;
  useEffect(() => {
    if (!gestureActive) return;
    const cancelGesture = () => {
      if (pointerUpProcessedRef.current) return; // handled inside the canvas
      pointerUpProcessedRef.current = true;
      setIsDragging(false);
      setDragStart(null);
      setDragDelta(null);
      setRubberBand(null);
      setLnDragCreate(null);
      setResizing(null);
    };
    window.addEventListener('pointerup', cancelGesture);
    window.addEventListener('pointercancel', cancelGesture);
    return () => {
      window.removeEventListener('pointerup', cancelGesture);
      window.removeEventListener('pointercancel', cancelGesture);
    };
  }, [gestureActive]);

  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (pointerUpProcessedRef.current) return;
      pointerUpProcessedRef.current = true;

      // LN drag creation finalize
      if (lnDragCreate) {
        const { startBeat, column: lnColumn, currentEndBeat } = lnDragCreate;
        const minEnd = startBeat + Math.max(4 / gridSnap, 0.25);
        const finalEndBeat = Math.max(currentEndBeat, minEnd);
        onNoteAdd({
          beat: startBeat, measure: 0, fraction: 0,
          tick: Math.round(startBeat * 960),
          endTick: Math.round(finalEndBeat * 960),
          column: lnColumn,
          keysound: currentKeysound,
          noteType: 'playable',
          channel: '',
          endBeat: finalEndBeat,
        });
        setLnDragCreate(null);
        setDragStart(null);
        return;
      }

      const { clientX, clientY } = e.nativeEvent;
      const pointerTravel = Math.hypot(clientX - pressClientRef.current.x, clientY - pressClientRef.current.y);

      if (resizing) {
        if (onNoteUpdate && pointerTravel >= DRAG_THRESHOLD_PX) {
          const world = screenToWorld(clientX, clientY);
          const note = notes.find((n) => n.id === resizing.noteId);
          if (note) {
            const newEndBeat = resizeEndBeat(world.y, note);
            // A short note always changes (it becomes a long note); a long note only if its end moved
            if (note.endBeat === undefined || Math.abs(newEndBeat - resizing.startEndBeat) > 0.001) {
              onNoteUpdate(resizing.noteId, { endBeat: newEndBeat });
            }
          }
        }
        setResizing(null); setDragStart(null); setDragDelta(null);
        return;
      }

      if (rubberBand) {
        const { startX, startY, endX, endY } = rubberBand;
        if (Math.abs(endX - startX) > 3 || Math.abs(endY - startY) > 3) {
          const noteIds = findNotesInRect(startX, startY, endX, endY);
          onNoteSelect(noteIds, e.nativeEvent.ctrlKey || e.nativeEvent.metaKey);
        }
        setRubberBand(null);
        return;
      }

      const dragIds = dragNoteIdsRef.current;
      // Below the drag threshold the press was just a click (selection only)
      if (isDragging && dragStart && dragIds.length > 0 && pointerTravel >= DRAG_THRESHOLD_PX) {
        const world = screenToWorld(clientX, clientY);
        const { column: newColumn, beat: newBeat } = worldToLaneBeat(world.x, world.y);
        const { column: startColumn, beat: startBeat } = worldToLaneBeat(dragStart.x, dragStart.y);
        if (newColumn && startColumn) {
          const startIsBgm = isBgmLaneId(startColumn);
          const endIsBgm = isBgmLaneId(newColumn);

          if (!startIsBgm && endIsBgm) {
            // Playable → BGM: convert note type (beat shift only, no column delta)
            const beatDelta = newBeat - startBeat;
            if (Math.abs(beatDelta) > 0.01) {
              onNoteMove(dragIds, { beat: beatDelta }, gridSnap);
            }
            // Change type to BGM with target channel
            const targetChannel = bgmLaneIdToChannel(newColumn);
            if (onNotesConvert) {
              // One batched call (single undo step); the host spreads notes over distinct channels
              onNotesConvert(dragIds, { kind: 'bgm', channel: targetChannel });
            } else {
              for (const noteId of dragIds) {
                onNoteUpdate?.(noteId, { noteType: 'bgm', column: undefined, bgmChannel: targetChannel });
              }
            }
          } else if (startIsBgm && !endIsBgm) {
            // BGM → Playable: convert note type
            const beatDelta = newBeat - startBeat;
            if (Math.abs(beatDelta) > 0.01) {
              onNoteMove(dragIds, { beat: beatDelta }, gridSnap);
            }
            if (onNotesConvert) {
              // One batched call (single undo step); the host spreads notes over distinct columns
              onNotesConvert(dragIds, { kind: 'playable', column: newColumn });
            } else {
              for (const noteId of dragIds) {
                onNoteUpdate?.(noteId, { noteType: 'playable', column: newColumn, bgmChannel: undefined });
              }
            }
          } else {
            // Normal move within same type
            const beatDelta = newBeat - startBeat;
            const startLaneIdx = lanes.findIndex((l) => l.id === startColumn);
            const endLaneIdx = lanes.findIndex((l) => l.id === newColumn);
            const colDelta = endLaneIdx - startLaneIdx;
            if (Math.abs(beatDelta) > 0.01 || colDelta !== 0) {
              onNoteMove(dragIds, { beat: beatDelta, columnDelta: colDelta !== 0 ? colDelta : undefined }, gridSnap);
            }
          }
        }
      }

      setIsDragging(false); setDragStart(null); setDragDelta(null);
    },
    [isDragging, dragStart, screenToWorld, worldToLaneBeat, onNoteMove, onNoteUpdate, onNotesConvert, rubberBand, resizing, notes, gridSnap, findNotesInRect, onNoteSelect, lanes, lnDragCreate, currentKeysound, onNoteAdd, resizeEndBeat]
  );

  return (
    <group onPointerMove={handlePointerMove} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
      <mesh position={[0, totalHeight / 2, -10]}>
        <planeGeometry args={[totalWidth + 100, totalHeight + 100]} />
        <meshBasicMaterial color="#0a0a1a" transparent opacity={0.01} />
      </mesh>
      <LanesRenderer lanes={lanes} totalHeight={totalHeight} keyMode={keyMode} />
      <CurrentMeasureHighlight currentBeat={scrollBeat} totalWidth={totalWidth} beatScale={beatScale} timeSignatures={timeSignatures} />
      <MeasureLinesRenderer totalBeats={totalBeats} beatScale={beatScale} totalWidth={totalWidth} gridSnap={gridSnap} scrollBeat={scrollBeat} viewportBeats={viewportBeats} timeSignatures={timeSignatures} gridSnapOverrides={gridSnapOverrides} />
      <NotesRenderer notes={notes} lanes={lanes} beatScale={beatScale} selectedNotes={selectedNotes} offsetX={offsetX} scrollBeat={scrollBeat} viewportBeats={viewportBeats} scrollBeatImperativeRef={scrollBeatImperativeRef} layerConfig={layerConfig} highlightKeysound={highlightKeysound} customColors={customColors} />
      {activeTool === 'addNote' && !lnDragCreate && hoverPosition && (
        <HoverPreview beat={hoverPosition.beat} column={hoverPosition.column} lanes={lanes} beatScale={beatScale} offsetX={offsetX} isSilent={currentKeysound === '00'} isLongNote={selectedNoteType === 'longNote'} />
      )}
      {/* Stop/BPM tool hover line preview */}
      {(activeTool === 'stop' || activeTool === 'bpm') && hoverPosition && (
        <mesh position={[0, hoverPosition.beat * beatScale, 6]}>
          <planeGeometry args={[totalWidth + 20, 1.5]} />
          <meshBasicMaterial color={activeTool === 'stop' ? '#ff4444' : '#44aaff'} transparent opacity={0.6} />
        </mesh>
      )}
      {/* Snap guideline — horizontal line at nearest note beat */}
      {snapGuideBeat !== null && (
        <mesh position={[0, snapGuideBeat * beatScale, 6]}>
          <planeGeometry args={[totalWidth + 20, 1]} />
          <meshBasicMaterial color="#44ff88" transparent opacity={0.4} />
        </mesh>
      )}
      {rubberBand && <RubberBandRect startX={rubberBand.startX} startY={rubberBand.startY} endX={rubberBand.endX} endY={rubberBand.endY} />}
      {lnDragCreate && (() => {
        const lane = lanes.find((l) => l.id === lnDragCreate.column);
        if (!lane) return null;
        return (
          <LongNotePreview
            x={offsetX + lane.x + lane.width / 2} width={lane.width - 2} noteHeight={noteHeight} color={lane.color}
            startY={lnDragCreate.startBeat * beatScale + noteHeight / 2}
            endY={lnDragCreate.currentEndBeat * beatScale + noteHeight / 2}
          />
        );
      })()}
      {resizing && dragDelta && (() => {
        const note = notes.find((n) => n.id === resizing.noteId);
        const lane = note?.column !== undefined ? laneMap.get(note.column) : undefined;
        if (!note || !lane) return null;
        return (
          <LongNotePreview
            x={offsetX + lane.x + lane.width / 2} width={lane.width - 2} noteHeight={noteHeight} color={lane.color}
            startY={note.beat * beatScale + noteHeight / 2}
            endY={(resizing.startEndBeat + dragDelta.beatDelta) * beatScale + noteHeight / 2}
          />
        );
      })()}
      {isDragging && dragDelta && selectedNotes.size > 0 && (
        <DragGhostNotes notes={notes} selectedNotes={selectedNotes} lanes={lanes} beatScale={beatScale} offsetX={offsetX} beatDelta={dragDelta.beatDelta} columnDelta={dragDelta.columnDelta} />
      )}
      {bpmChanges && <BpmMarkersRenderer bpmChanges={bpmChanges} beatScale={beatScale} totalWidth={totalWidth} scrollBeat={scrollBeat} viewportBeats={viewportBeats} />}
      {stopEvents && stopEvents.length > 0 && <StopMarkersRenderer stopEvents={stopEvents} beatScale={beatScale} totalWidth={totalWidth} scrollBeat={scrollBeat} viewportBeats={viewportBeats} />}
      {scrollBeatImperativeRef && (
        <>
          <EditorJudgmentLine scrollBeatImperativeRef={scrollBeatImperativeRef} beatScale={beatScale} totalWidth={totalWidth} />
          <NotePassEffect scrollBeatImperativeRef={scrollBeatImperativeRef} notes={notes} lanes={lanes} beatScale={beatScale} offsetX={offsetX} />
        </>
      )}
    </group>
  );
}

/** Main NoteChartEditor component */
export const NoteChartEditor = React.memo(function NoteChartEditor({
  notes, keyMode, totalBeats, height = 600, beatScale = 20, className,
  activeTool, gridSnap, snapEnabled, gridSnapOverrides, layerConfig, selectedNotes, selectedNoteType, currentKeysound,
  bpmChanges, stopEvents, baseBpm = 120, timeSignatures,
  bgmChannelCount,
  onNoteAdd, onNoteDelete, onNoteMove, onNoteSelect, onNoteUpdate, onNotesConvert,
  onBpmChange, onBpmRequest, onBpmEditRequest, onStopRequest, onStopEditRequest, onStopDelete,
  onKeysoundAssign, onDropKeysound, onNoteHover,
  highlightKeysound,
  scrollToBeat, onScrollChange, scrollBeatImperativeRef,
  noteHeight: noteHeightProp = DEFAULT_NOTE_HEIGHT,
  zoomControlRef, onBeatScaleChange,
  customColors,
}: NoteChartEditorProps) {
  const coordConverterRef = useRef<CoordConverter | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableEventTarget(e.target)) return; // Delete inside an input edits text, not notes
      if (e.key === 'Delete' && selectedNotes.size > 0) {
        e.preventDefault();
        onNoteDelete(Array.from(selectedNotes));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNotes, onNoteDelete]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-keysound-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    const keysoundId = e.dataTransfer.getData('application/x-keysound-id');
    if (!keysoundId || !onDropKeysound) return;
    e.preventDefault();
    const converter = coordConverterRef.current;
    if (!converter) return;
    const result = converter.screenToWorldBeat(e.clientX, e.clientY);
    if (!result || !result.column) return;
    onDropKeysound(keysoundId, result.beat, result.column);
  }, [onDropKeysound]);

  return (
    <div className={cn('flex flex-col bg-background h-full', className)} onDragOver={handleDragOver} onDrop={handleDrop}>
      <Canvas
        style={{ height, minHeight: 0 }}
        orthographic
        camera={{ zoom: 1, position: [0, 0, 100], near: 0.1, far: 1000 }}
        gl={{ antialias: false }}
        resize={{ debounce: 16 }}
      >
        <NoteHeightContext.Provider value={noteHeightProp}>
        <color attach="background" args={[customColors?.background ?? '#0a0a1a']} />
        <EditorCanvas
          notes={notes} keyMode={keyMode} totalBeats={totalBeats} beatScale={beatScale}
          activeTool={activeTool} gridSnap={gridSnap} snapEnabled={snapEnabled} gridSnapOverrides={gridSnapOverrides} layerConfig={layerConfig} selectedNotes={selectedNotes}
          selectedNoteType={selectedNoteType} currentKeysound={currentKeysound}
          bpmChanges={bpmChanges} stopEvents={stopEvents} baseBpm={baseBpm} timeSignatures={timeSignatures}
          onNoteAdd={onNoteAdd} onNoteDelete={onNoteDelete} onNoteMove={onNoteMove}
          onNoteSelect={onNoteSelect} onNoteUpdate={onNoteUpdate} onNotesConvert={onNotesConvert}
          onBpmChange={onBpmChange} onBpmRequest={onBpmRequest} onBpmEditRequest={onBpmEditRequest}
          onStopRequest={onStopRequest} onStopEditRequest={onStopEditRequest} onStopDelete={onStopDelete}
          onKeysoundAssign={onKeysoundAssign} onDropKeysound={onDropKeysound} onNoteHover={onNoteHover}
          highlightKeysound={highlightKeysound}
          bgmChannelCount={bgmChannelCount}
          scrollToBeat={scrollToBeat} onScrollChange={onScrollChange}
          coordConverterRef={coordConverterRef} scrollBeatImperativeRef={scrollBeatImperativeRef}
          zoomControlRef={zoomControlRef} onBeatScaleChange={onBeatScaleChange}
          customColors={customColors}
        />
        </NoteHeightContext.Provider>
      </Canvas>
    </div>
  );
});

export default NoteChartEditor;
