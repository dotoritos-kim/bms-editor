/**
 * NoteChartEditor Component
 *
 * BMS 노트 차트를 편집 가능하게 표시하는 컴포넌트
 * 모듈 구조:
 *   editor/types.ts         — 타입, 상수, 인터페이스
 *   editor/editorUtils.ts   — 순수 유틸리티 함수 (스냅, 색상, 변환)
 *   editor/gridRenderers.tsx — 레인/마디선/BPM/STOP 렌더러
 *   editor/noteRenderers.tsx — 노트/호버/고스트/이펙트 렌더러
 *   editor/EditorToolbar.tsx — 에디터 툴바
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { cn } from '../utils';
import type { NoteType, EditableBMSNote } from '@rhythm-archive/bms-core';
import type { KeyMode } from './NoteChartViewer';
import { generateLaneConfig } from './laneConfig';

// Sub-module imports
import {
  DEFAULT_NOTE_HEIGHT,
  type NoteChartEditorProps,
  type CoordConverter,
  type ZoomControl,
} from './editor/types';

/** 키모드별 기본 beatScale (px/beat) */
function defaultBeatScaleForKeyMode(keyMode: string): number {
  if (['4K', '5K', '6K', '7K'].includes(keyMode)) return 20;
  if (['8K', '9K', '10K'].includes(keyMode)) return 15;
  if (['12K', '14K'].includes(keyMode)) return 12;
  if (['18K', '24K'].includes(keyMode)) return 8;
  if (keyMode === '48K') return 4;
  return 20;
}
import { NoteHeightContext, snapBeatToGrid, getBgmLaneId, isBgmLaneId, bgmLaneIdToChannel } from './editor/editorUtils';
import { LanesRenderer, MeasureLinesRenderer, BpmMarkersRenderer, StopMarkersRenderer } from './editor/gridRenderers';
import { NotesRenderer, HoverPreview, RubberBandRect, DragGhostNotes, NotePassEffect, EditorJudgmentLine } from './editor/noteRenderers';

// Re-exports for backwards compatibility
export { EditorToolbar } from './editor/EditorToolbar';
export { GRID_SNAP_OPTIONS } from './editor/types';
export type { EditorTool, SelectedNoteType, GridSnap, NoteChartEditorProps, ZoomControl, CustomNoteColors } from './editor/types';

/** 에디터 캔버스 내부 컴포넌트 */
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
  const [scrollBeat, setScrollBeat] = useState(0);
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
  const pendingBeatScaleRef = useRef<number | null>(null);
  const initialBeatScaleReportedRef = useRef(false);

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

  // 외부 스크롤 동기화
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

  // 마우스 휠 스크롤 + Ctrl+Wheel 줌
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY > 0 ? (1 / 1.15) : 1.15;
        const newScale = Math.max(2, Math.min(200, Math.round(beatScaleRef.current * factor)));
        // 커서 고정 줌: 마우스 위치의 beat를 유지
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

  // 키보드 네비게이션
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  // 카메라 업데이트
  const contentWidthRef = useRef(contentWidth);
  contentWidthRef.current = contentWidth;

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
    // 초기 beatScale 한 번 보고 (mount 후 첫 프레임)
    if (!initialBeatScaleReportedRef.current) {
      initialBeatScaleReportedRef.current = true;
      onBeatScaleChange?.(beatScaleRef.current);
    }
    // rAF 디바운스: pendingBeatScaleRef가 있으면 onBeatScaleChange 호출 후 클리어
    if (pendingBeatScaleRef.current !== null) {
      onBeatScaleChange?.(pendingBeatScaleRef.current);
      pendingBeatScaleRef.current = null;
    }
  });

  // 좌표 변환
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
      // Snap 3단계: snapEnabled OFF → free, Shift held → free, otherwise → grid snap
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

  // size와 totalBeats를 ref로 유지 (fitToChart에서 최신값 접근)
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

  // 히트 판정
  const findNoteAtPosition = useCallback(
    (worldX: number, worldY: number): EditableBMSNote | null => {
      const { column, rawBeat } = worldToLaneRawBeat(worldX, worldY);
      if (!column) return null;
      const clickTolerance = 2 / beatScale;
      const bgmLane = isBgmLaneId(column);
      return (
        notes.find(
          (note) => {
            // Skip notes on locked/hidden layers
            const noteLayer = (note.noteType || 'playable') as keyof NonNullable<typeof layerConfig>;
            const ls = layerConfig?.[noteLayer];
            if (ls && (!ls.visible || ls.locked)) return false;
            if (bgmLane) {
              return note.noteType === 'bgm' && getBgmLaneId(note) === column &&
                Math.abs(note.beat - rawBeat) < clickTolerance;
            }
            return note.column === column && Math.abs(note.beat - rawBeat) < clickTolerance;
          }
        ) || null
      );
    },
    [notes, worldToLaneRawBeat, beatScale, layerConfig]
  );

  const findLongNoteEndAtPosition = useCallback(
    (worldX: number, worldY: number): EditableBMSNote | null => {
      const { column } = worldToLaneBeat(worldX, worldY);
      if (!column) return null;
      const rawBeat = worldY / beatScale;
      const tolerance = 3 / beatScale;
      return (
        notes.find(
          (note) => note.column === column && note.endBeat !== undefined && Math.abs(note.endBeat - rawBeat) < tolerance
        ) || null
      );
    },
    [notes, worldToLaneBeat, beatScale]
  );

  const findNotesInRect = useCallback(
    (x1: number, y1: number, x2: number, y2: number): string[] => {
      const noteHeight = DEFAULT_NOTE_HEIGHT;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minBeat = (Math.min(y1, y2) - noteHeight / 2) / beatScale;
      const maxBeat = (Math.max(y1, y2) - noteHeight / 2) / beatScale;
      return notes
        .filter((note) => {
          const laneId = note.noteType === 'bgm' ? getBgmLaneId(note) : note.column;
          const lane = lanes.find((l) => l.id === laneId);
          if (!lane) return false;
          const noteX = offsetX + lane.x + lane.width / 2;
          return noteX >= minX && noteX <= maxX && note.beat >= minBeat && note.beat <= maxBeat;
        })
        .map((n) => n.id);
    },
    [notes, lanes, offsetX, beatScale]
  );

  // 이벤트 핸들러
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

      if (onNoteHover && pointerActuallyMoved) {
        const hoveredNote = findNoteAtPosition(world.x, world.y);
        onNoteHover(hoveredNote?.keysound && hoveredNote.keysound !== '00' ? hoveredNote.keysound : null);
      }

      if (rubberBand) {
        // Clamp Y to [0, totalHeight] so rubber band stays within the chart (doesn't bleed into status bar)
        const clampedY = Math.max(0, Math.min(totalHeight, world.y));
        setRubberBand((prev) => prev ? { ...prev, endX: world.x, endY: clampedY } : null);
      }

      if (resizing && dragStart) {
        const rawBeat = world.y / beatScale;
        const snappedBeat = snapBeatToGrid(rawBeat, gridSnap);
        const note = notes.find((n) => n.id === resizing.noteId);
        if (note) {
          const minEnd = note.beat + Math.max(4 / gridSnap, 0.25);
          setDragDelta({ beatDelta: Math.max(snappedBeat, minEnd) - resizing.startEndBeat, columnDelta: 0 });
        }
      }

      if (isDragging && dragStart && activeTool === 'move') {
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
      if (column && (activeTool === 'addNote' || activeTool === 'move')) {
        const rawBeat = world.y / beatScale;
        const tolerance = 16 / beatScale; // 16px snap range
        let nearest: number | null = null;
        let nearestDist = tolerance;
        for (const n of notes) {
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
    [screenToWorld, worldToLaneBeat, isDragging, dragStart, rubberBand, activeTool, lanes, offsetX, resizing, notes, beatScale, gridSnap, totalHeight, onNoteHover, findNoteAtPosition, lnDragCreate]
  );

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      pointerUpProcessedRef.current = false;
      const world = screenToWorld(e.nativeEvent.clientX, e.nativeEvent.clientY);
      const { column, beat } = worldToLaneBeat(world.x, world.y);
      if (!column || beat < 0 || beat > totalBeats) return;
      if (e.nativeEvent.button === 2) return;

      switch (activeTool) {
        case 'select': {
          const longNoteEnd = findLongNoteEndAtPosition(world.x, world.y);
          if (longNoteEnd && longNoteEnd.endBeat !== undefined) {
            setResizing({ noteId: longNoteEnd.id, startEndBeat: longNoteEnd.endBeat });
            setDragStart({ x: world.x, y: world.y });
            onNoteSelect([longNoteEnd.id]);
            break;
          }
          const clickedNote = findNoteAtPosition(world.x, world.y);
          if (clickedNote) {
            onNoteSelect([clickedNote.id], e.nativeEvent.ctrlKey || e.nativeEvent.metaKey);
          } else {
            if (!e.nativeEvent.ctrlKey && !e.nativeEvent.metaKey) onNoteSelect([]);
            setRubberBand({ startX: world.x, startY: world.y, endX: world.x, endY: world.y });
          }
          break;
        }
        case 'addNote': {
          const isBgm = isBgmLaneId(column) || selectedNoteType === 'bgm';
          const isLN = !isBgm && selectedNoteType === 'longNote';
          if (isLN) {
            // Start LN drag creation — finalized on pointerUp
            setLnDragCreate({ startBeat: beat, column, currentEndBeat: beat + Math.max(4 / gridSnap, 0.25) });
            setDragStart({ x: world.x, y: world.y });
          } else {
            // measure/fraction은 store.addNote에서 tick 기반으로 재계산됨
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
            if (!selectedNotes.has(clickedNote.id)) onNoteSelect([clickedNote.id]);
            setIsDragging(true);
            setDragStart({ x: world.x, y: world.y });
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
    [activeTool, screenToWorld, worldToLaneBeat, findNoteAtPosition, findLongNoteEndAtPosition, selectedNotes, selectedNoteType, currentKeysound, baseBpm, beatScale, totalBeats, onNoteAdd, onNoteDelete, onNoteSelect, onBpmChange, onBpmRequest, onBpmEditRequest, onStopRequest, onStopEditRequest, onStopDelete, stopEvents, onKeysoundAssign]
  );

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

      if (resizing && onNoteUpdate) {
        const world = screenToWorld(e.nativeEvent.clientX, e.nativeEvent.clientY);
        const dragPixelDist = dragStart ? Math.abs(world.y - dragStart.y) : 0;
        if (dragPixelDist > 3) {
          const rawBeat = world.y / beatScale;
          const snappedBeat = snapBeatToGrid(rawBeat, gridSnap);
          const note = notes.find((n) => n.id === resizing.noteId);
          if (note) {
            const minEnd = note.beat + Math.max(4 / gridSnap, 0.25);
            const newEndBeat = Math.max(snappedBeat, minEnd);
            if (Math.abs(newEndBeat - resizing.startEndBeat) > 0.001) onNoteUpdate(resizing.noteId, { endBeat: newEndBeat });
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

      if (isDragging && dragStart && selectedNotes.size > 0) {
        const world = screenToWorld(e.nativeEvent.clientX, e.nativeEvent.clientY);
        const { column: newColumn, beat: newBeat } = worldToLaneBeat(world.x, world.y);
        const { column: startColumn, beat: startBeat } = worldToLaneBeat(dragStart.x, dragStart.y);
        if (newColumn && startColumn) {
          const startIsBgm = isBgmLaneId(startColumn);
          const endIsBgm = isBgmLaneId(newColumn);

          if (!startIsBgm && endIsBgm) {
            // Playable → BGM: convert note type (beat shift only, no column delta)
            const beatDelta = newBeat - startBeat;
            if (Math.abs(beatDelta) > 0.01) {
              onNoteMove(Array.from(selectedNotes), { beat: beatDelta }, gridSnap);
            }
            // Change type to BGM with target channel
            const targetChannel = bgmLaneIdToChannel(newColumn);
            for (const noteId of selectedNotes) {
              onNoteUpdate?.(noteId, { noteType: 'bgm', column: undefined, bgmChannel: targetChannel });
            }
          } else if (startIsBgm && !endIsBgm) {
            // BGM → Playable: convert note type
            const beatDelta = newBeat - startBeat;
            if (Math.abs(beatDelta) > 0.01) {
              onNoteMove(Array.from(selectedNotes), { beat: beatDelta }, gridSnap);
            }
            for (const noteId of selectedNotes) {
              onNoteUpdate?.(noteId, { noteType: 'playable', column: newColumn, bgmChannel: undefined });
            }
          } else {
            // Normal move within same type
            const beatDelta = newBeat - startBeat;
            const startLaneIdx = lanes.findIndex((l) => l.id === startColumn);
            const endLaneIdx = lanes.findIndex((l) => l.id === newColumn);
            const colDelta = endLaneIdx - startLaneIdx;
            if (Math.abs(beatDelta) > 0.01 || colDelta !== 0) {
              onNoteMove(Array.from(selectedNotes), { beat: beatDelta, columnDelta: colDelta !== 0 ? colDelta : undefined }, gridSnap);
            }
          }
        }
      }

      setIsDragging(false); setDragStart(null); setDragDelta(null);
    },
    [isDragging, dragStart, selectedNotes, screenToWorld, worldToLaneBeat, onNoteMove, onNoteUpdate, rubberBand, resizing, notes, beatScale, gridSnap, findNotesInRect, onNoteSelect, lanes, lnDragCreate, currentKeysound, onNoteAdd]
  );

  return (
    <group onPointerMove={handlePointerMove} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
      <mesh position={[0, totalHeight / 2, -10]}>
        <planeGeometry args={[totalWidth + 100, totalHeight + 100]} />
        <meshBasicMaterial color="#0a0a1a" transparent opacity={0.01} />
      </mesh>
      <LanesRenderer lanes={lanes} totalHeight={totalHeight} keyMode={keyMode} />
      <MeasureLinesRenderer totalBeats={totalBeats} beatScale={beatScale} totalWidth={totalWidth} gridSnap={gridSnap} scrollBeat={scrollBeat} viewportBeats={size.height / beatScale} timeSignatures={timeSignatures} gridSnapOverrides={gridSnapOverrides} />
      <NotesRenderer notes={notes} lanes={lanes} beatScale={beatScale} selectedNotes={selectedNotes} offsetX={offsetX} scrollBeat={scrollBeat} viewportBeats={size.height / beatScale} scrollBeatImperativeRef={scrollBeatImperativeRef} layerConfig={layerConfig} highlightKeysound={highlightKeysound} customColors={customColors} />
      {activeTool === 'addNote' && !lnDragCreate && hoverPosition && (
        <HoverPreview beat={hoverPosition.beat} column={hoverPosition.column} lanes={lanes} beatScale={beatScale} offsetX={offsetX} isSilent={currentKeysound === '00'} isLongNote={selectedNoteType === 'longNote'} />
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
        const x = offsetX + lane.x + lane.width / 2;
        const w = lane.width - 2;
        const y1 = lnDragCreate.startBeat * beatScale + 1;
        const y2 = lnDragCreate.currentEndBeat * beatScale + 1;
        const bodyY = (y1 + y2) / 2;
        return (
          <group>
            <mesh position={[x, y1, 3]}><planeGeometry args={[w, 2]} /><meshBasicMaterial color={lane.color} transparent opacity={0.6} /></mesh>
            <mesh position={[x, bodyY, 2]}><planeGeometry args={[w, Math.abs(y2 - y1)]} /><meshBasicMaterial color={lane.color} transparent opacity={0.25} /></mesh>
            <mesh position={[x, y2, 3]}><planeGeometry args={[w, 2]} /><meshBasicMaterial color={lane.color} transparent opacity={0.6} /></mesh>
          </group>
        );
      })()}
      {isDragging && dragDelta && selectedNotes.size > 0 && (
        <DragGhostNotes notes={notes} selectedNotes={selectedNotes} lanes={lanes} beatScale={beatScale} offsetX={offsetX} beatDelta={dragDelta.beatDelta} columnDelta={dragDelta.columnDelta} />
      )}
      {bpmChanges && <BpmMarkersRenderer bpmChanges={bpmChanges} beatScale={beatScale} totalWidth={totalWidth} scrollBeat={scrollBeat} viewportBeats={size.height / beatScale} />}
      {stopEvents && stopEvents.length > 0 && <StopMarkersRenderer stopEvents={stopEvents} beatScale={beatScale} totalWidth={totalWidth} scrollBeat={scrollBeat} viewportBeats={size.height / beatScale} />}
      {scrollBeatImperativeRef && (
        <>
          <EditorJudgmentLine scrollBeatImperativeRef={scrollBeatImperativeRef} beatScale={beatScale} totalWidth={totalWidth} />
          <NotePassEffect scrollBeatImperativeRef={scrollBeatImperativeRef} notes={notes} lanes={lanes} beatScale={beatScale} offsetX={offsetX} />
        </>
      )}
    </group>
  );
}

/** 메인 NoteChartEditor 컴포넌트 */
export const NoteChartEditor = React.memo(function NoteChartEditor({
  notes, keyMode, totalBeats, height = 600, beatScale = 20, className,
  activeTool, gridSnap, snapEnabled, gridSnapOverrides, layerConfig, selectedNotes, selectedNoteType, currentKeysound,
  bpmChanges, stopEvents, baseBpm = 120, timeSignatures,
  bgmChannelCount,
  onNoteAdd, onNoteDelete, onNoteMove, onNoteSelect, onNoteUpdate,
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
          onNoteSelect={onNoteSelect} onNoteUpdate={onNoteUpdate}
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
