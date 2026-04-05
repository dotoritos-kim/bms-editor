/**
 * NoteChartEditor Component
 *
 * BMS 노트 차트를 편집 가능하게 표시하는 컴포넌트
 * NoteChartViewer를 기반으로 편집 기능을 추가합니다.
 *
 * 기능:
 * - 노트 추가: 클릭으로 노트 배치
 * - 노트 선택: 클릭/드래그로 노트 선택
 * - 노트 이동: 선택 후 드래그
 * - 노트 삭제: 선택 후 Delete 키
 * - BPM 변경: BPM 마커 편집
 * - 키음 할당: 노트에 키음 지정
 * - InstancedMesh 기반 렌더링 (최대 3000개 노트)
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import {
  MousePointer2,
  Plus,
  Trash2,
  Move,
  Music,
  Gauge,
  Timer,
  Undo2,
  Redo2,
  Copy,
  Clipboard,
  Save,
  GitBranch,
} from 'lucide-react';
import { cn } from '../utils';
import type { NoteType, EditableBMSNote, BMSBpmChange, BMSStopEvent } from '@rhythm-archive/bms-core';
import type { KeyMode } from './NoteChartViewer';
import { generateLaneConfig, getLaneBackground, type LaneConfig } from './laneConfig';

// 에디터 도구 타입
export type EditorTool =
  | 'select'
  | 'addNote'
  | 'delete'
  | 'move'
  | 'bpm'
  | 'stop'
  | 'keysound';

// 노트 타입 선택
export type SelectedNoteType = 'playable' | 'invisible' | 'landmine' | 'longNote';

// 그리드 스냅 옵션
export const GRID_SNAP_OPTIONS = [4, 8, 16, 32, 48, 64, 96, 192] as const;
export type GridSnap = (typeof GRID_SNAP_OPTIONS)[number];

// InstancedMesh 상수
const MAX_VISIBLE_EDITOR_NOTES = 3000;
const MAX_VISIBLE_SELECTIONS = 500;
const MAX_VISIBLE_LONGNOTE_BODIES = 500;
const MAX_VISIBLE_LAYER_MARKERS = 500;
const NOTE_HEIGHT = 4;
const NOTE_PADDING = 1;

// 재사용 가능한 오브젝트 (GC 압력 감소)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export interface NoteChartEditorProps {
  /** 편집할 노트 배열 */
  notes: EditableBMSNote[];
  /** 키 모드 */
  keyMode: KeyMode;
  /** 총 비트 수 */
  totalBeats: number;
  /** 컴포넌트 높이 */
  height?: number | string;
  /** 비트당 픽셀 스케일 */
  beatScale?: number;
  /** 추가 클래스명 */
  className?: string;
  /** 현재 선택된 도구 */
  activeTool: EditorTool;
  /** 그리드 스냅 값 */
  gridSnap: GridSnap;
  /** 선택된 노트 ID 집합 */
  selectedNotes: Set<string>;
  /** 선택할 노트 타입 (노트 추가 시) */
  selectedNoteType: SelectedNoteType;
  /** 현재 키음 ID (노트 추가 시) */
  currentKeysound: string;
  /** BPM 변경 이벤트 */
  bpmChanges?: BMSBpmChange[];
  /** STOP 이벤트 */
  stopEvents?: BMSStopEvent[];
  /** 기본 BPM */
  baseBpm?: number;

  // 이벤트 핸들러
  /** 노트 추가 */
  onNoteAdd: (note: Omit<EditableBMSNote, 'id'>) => void;
  /** 노트 삭제 */
  onNoteDelete: (noteIds: string[]) => void;
  /** 노트 이동 */
  onNoteMove: (
    noteIds: string[],
    delta: { beat?: number; columnDelta?: number },
    gridSnap?: GridSnap
  ) => void;
  /** 노트 선택 */
  onNoteSelect: (noteIds: string[], additive?: boolean) => void;
  /** 노트 업데이트 (endBeat 리사이즈 등) */
  onNoteUpdate?: (noteId: string, updates: Partial<EditableBMSNote>) => void;
  /** BPM 변경 */
  onBpmChange?: (beat: number, bpm: number) => void;
  /** BPM 입력 요청 (다이얼로그 표시용) */
  onBpmRequest?: (beat: number) => void;
  /** BPM 편집 요청 (기존 마커 클릭 시) */
  onBpmEditRequest?: (bpmChange: BMSBpmChange) => void;
  /** STOP 입력 요청 (다이얼로그 표시용) */
  onStopRequest?: (beat: number) => void;
  /** STOP 편집 요청 (기존 마커 클릭 시) */
  onStopEditRequest?: (stopEvent: BMSStopEvent) => void;
  /** 키음 할당 */
  onKeysoundAssign?: (noteId: string, keysoundId: string) => void;
  /** 키음 드래그 앤 드롭으로 노트 추가 (beat, column이 자동 계산됨) */
  onDropKeysound?: (keysoundId: string, beat: number, column: string) => void;
  /** 노트 위에 호버 시 콜백 (keysound ID, null이면 호버 해제) */
  onNoteHover?: (keysoundId: string | null) => void;

  // 네비게이션
  /** 외부에서 스크롤 위치 설정 (미니맵 등) */
  scrollToBeat?: number;
  /** 스크롤 위치 변경 콜백 */
  onScrollChange?: (beat: number) => void;
  /** Imperative scroll ref for smooth playback (read every frame in useFrame, bypasses React re-renders) */
  scrollBeatImperativeRef?: React.RefObject<number>;

  // 상태 표시
  /** 저장되지 않은 변경 있음 */
  hasUnsavedChanges?: boolean;
  /** 현재 브랜치 이름 */
  branchName?: string;
}

// 비트를 마디와 분수로 변환
function beatToMeasureFraction(
  beat: number,
  beatsPerMeasure: number = 4
): { measure: number; fraction: number } {
  const measure = Math.floor(beat / beatsPerMeasure);
  const fraction = (beat % beatsPerMeasure) / beatsPerMeasure;
  return { measure, fraction };
}

// 비트를 그리드에 스냅
function snapBeatToGrid(beat: number, gridSnap: GridSnap): number {
  const gridStep = 4 / gridSnap; // 4 beats per measure / grid divisions
  return Math.round(beat / gridStep) * gridStep;
}

// 레인 색상 캐시 (new THREE.Color() 호출을 useFrame 밖으로 이동)
const _laneColorCache = new Map<string, { normal: number; invisible: number }>();
function getLaneColorHex(laneColor: string): { normal: number; invisible: number } {
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
function getNoteColorHex(
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

/** 좌표 변환 API (드래그 앤 드롭용) */
interface CoordConverter {
  screenToWorldBeat: (clientX: number, clientY: number) => { beat: number; column: string | null } | null;
}

/** 에디터 캔버스 내부 컴포넌트 */
function EditorCanvas({
  notes,
  keyMode,
  totalBeats,
  beatScale: initialBeatScale = 20,
  activeTool,
  gridSnap,
  selectedNotes,
  selectedNoteType,
  currentKeysound,
  bpmChanges,
  stopEvents,
  baseBpm,
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
  onKeysoundAssign,
  onDropKeysound: _onDropKeysound,
  onNoteHover,
  scrollToBeat: externalScrollBeat,
  onScrollChange,
  coordConverterRef,
  scrollBeatImperativeRef,
}: Omit<NoteChartEditorProps, 'height' | 'className' | 'hasUnsavedChanges' | 'branchName'> & {
  coordConverterRef?: React.MutableRefObject<CoordConverter | null>;
  scrollBeatImperativeRef?: React.RefObject<number>;
}) {
  const { camera, gl, size } = useThree();
  const [scrollBeat, setScrollBeat] = useState(0);
  const [beatScale, setBeatScale] = useState(initialBeatScale);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{
    beat: number;
    column: string;
  } | null>(null);

  // 롱노트 리사이즈 상태
  const [resizing, setResizing] = useState<{ noteId: string; startEndBeat: number } | null>(null);

  // Rubber band selection state
  const [rubberBand, setRubberBand] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  // Drag preview state (ghost notes during move)
  const [dragDelta, setDragDelta] = useState<{ beatDelta: number; columnDelta: number } | null>(null);

  // Ref guard: R3F dispatches pointer events to ALL intersected meshes (notes, selections, lane backgrounds).
  // Each dispatch bubbles to the parent group, causing handlers to fire multiple times per single DOM event.
  // React state updates (setIsDragging) are batched and don't take effect until re-render,
  // so subsequent firings still see stale isDragging=true and call onNoteMove repeatedly.
  // This ref is set synchronously to prevent duplicate move/resize executions.
  const pointerUpProcessedRef = useRef(false);

  // Refs for stable access in useFrame
  const scrollBeatRef = useRef(scrollBeat);
  const beatScaleRef = useRef(beatScale);
  const viewportBeatsRef = useRef(16);
  scrollBeatRef.current = scrollBeat;
  beatScaleRef.current = beatScale;

  const lanes = useMemo(() => generateLaneConfig(keyMode), [keyMode]);
  const totalWidth = useMemo(
    () => lanes.reduce((sum, lane) => sum + lane.width, 0),
    [lanes]
  );
  const totalHeight = totalBeats * beatScale;
  const offsetX = -totalWidth / 2;

  // Auto-zoom: 레인 콘텐츠가 캔버스 너비를 채우도록 (measure labels + BPM labels 여백 포함)
  const CONTENT_PADDING = 85;
  const contentWidth = totalWidth + CONTENT_PADDING;

  // 외부 스크롤 동기화 (미니맵 클릭 등)
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

  // 스크롤 변경 보고 (skip reporting back external scroll changes to prevent oscillation)
  useEffect(() => {
    if (isExternalUpdateRef.current) {
      isExternalUpdateRef.current = false;
      return;
    }
    onScrollChange?.(scrollBeat);
  }, [scrollBeat, onScrollChange]);

  // 마우스 휠로 스크롤 + Ctrl+Wheel 줌
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // 줌
        const zoomDelta = e.deltaY > 0 ? -2 : 2;
        setBeatScale((prev) => Math.max(5, Math.min(80, prev + zoomDelta)));
      } else {
        // 스크롤 (차트 끝 + 4비트 여유까지만)
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
          setScrollBeat((prev) => Math.min(maxScroll, prev + 16)); // 4마디 위로
          break;
        }
        case 'PageDown':
          e.preventDefault();
          setScrollBeat((prev) => Math.max(0, prev - 16)); // 4마디 아래로
          break;
        case 'Home':
          e.preventDefault();
          setScrollBeat(0);
          break;
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

  // 카메라 업데이트 (스크롤 + 자동 줌)
  const contentWidthRef = useRef(contentWidth);
  contentWidthRef.current = contentWidth;

  useFrame(() => {
    const orthoCamera = camera as THREE.OrthographicCamera;

    // Step 1: Auto-zoom (레인이 캔버스 너비를 채우도록)
    if (size.width > 0 && contentWidthRef.current > 0) {
      const targetZoom = Math.min(size.width / contentWidthRef.current, 4);
      const diff = Math.abs(orthoCamera.zoom - targetZoom);
      if (diff > 0.001) {
        orthoCamera.zoom = diff < 0.01 ? targetZoom : THREE.MathUtils.lerp(orthoCamera.zoom, targetZoom, 0.15);
        orthoCamera.updateProjectionMatrix();
      }
    }

    // Step 2: 줌 반영한 뷰포트 높이로 카메라 Y 계산 (beat 0이 뷰포트 하단에 위치)
    const zoom = orthoCamera.zoom || 1;
    const viewportHeight = size.height / zoom;
    viewportBeatsRef.current = viewportHeight / beatScaleRef.current;

    // Use imperative ref for smooth camera tracking (updated every frame during playback)
    const effectiveScrollBeat = scrollBeatImperativeRef?.current ?? scrollBeatRef.current;

    const targetY = effectiveScrollBeat * beatScaleRef.current + viewportHeight / 2;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.15);
  });

  // 스크린 좌표를 월드 좌표로 변환 (reuse vector to avoid GC)
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

  // 월드 좌표에서 레인과 비트 찾기
  const worldToLaneBeat = useCallback(
    (worldX: number, worldY: number) => {
      // 레인 찾기
      const relativeX = worldX - offsetX;
      let column: string | null = null;
      for (const lane of lanes) {
        if (relativeX >= lane.x && relativeX < lane.x + lane.width) {
          column = lane.id;
          break;
        }
      }

      // 비트 찾기 (그리드 스냅 적용)
      const beat = snapBeatToGrid(worldY / beatScale, gridSnap);

      return { column, beat };
    },
    [lanes, offsetX, beatScale, gridSnap]
  );

  // 좌표 변환 API 노출 (드래그 앤 드롭용)
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
    return () => {
      if (coordConverterRef) {
        coordConverterRef.current = null;
      }
    };
  }, [coordConverterRef, screenToWorld, worldToLaneBeat]);

  // 월드 좌표에서 레인만 찾기 (그리드 스냅 없이 raw beat 반환)
  const worldToLaneRawBeat = useCallback(
    (worldX: number, worldY: number) => {
      const relativeX = worldX - offsetX;
      let column: string | null = null;
      for (const lane of lanes) {
        if (relativeX >= lane.x && relativeX < lane.x + lane.width) {
          column = lane.id;
          break;
        }
      }
      const rawBeat = worldY / beatScale;
      return { column, rawBeat };
    },
    [lanes, offsetX, beatScale]
  );

  // 클릭된 노트 찾기 (raw beat로 검색 — 오프 그리드 노트도 정확히 감지)
  const findNoteAtPosition = useCallback(
    (worldX: number, worldY: number): EditableBMSNote | null => {
      const { column, rawBeat } = worldToLaneRawBeat(worldX, worldY);
      if (!column) return null;

      // 클릭 위치 근처의 노트 찾기 (raw beat 기반)
      const clickTolerance = 4 / beatScale; // 4 픽셀 허용 오차
      return (
        notes.find(
          (note) =>
            note.column === column &&
            Math.abs(note.beat - rawBeat) < clickTolerance
        ) || null
      );
    },
    [notes, worldToLaneRawBeat, beatScale]
  );

  // 롱노트 endBeat 위치 클릭 감지
  const findLongNoteEndAtPosition = useCallback(
    (worldX: number, worldY: number): EditableBMSNote | null => {
      const { column } = worldToLaneBeat(worldX, worldY);
      if (!column) return null;

      const rawBeat = worldY / beatScale; // 그리드 스냅 없이 raw beat
      const tolerance = 3 / beatScale; // 3px tolerance

      return (
        notes.find(
          (note) =>
            note.column === column &&
            note.endBeat !== undefined &&
            Math.abs(note.endBeat - rawBeat) < tolerance
        ) || null
      );
    },
    [notes, worldToLaneBeat, beatScale]
  );

  // 마우스 이동 핸들러
  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const world = screenToWorld(e.nativeEvent.clientX, e.nativeEvent.clientY);
      const { column, beat } = worldToLaneBeat(world.x, world.y);

      if (column && beat >= 0) {
        setHoverPosition({ beat, column });
      } else {
        setHoverPosition(null);
      }

      // Note hover preview
      if (onNoteHover) {
        const hoveredNote = findNoteAtPosition(world.x, world.y);
        onNoteHover(hoveredNote?.keysound && hoveredNote.keysound !== '00' ? hoveredNote.keysound : null);
      }

      // Rubber band selection (drag in select mode on empty space)
      if (rubberBand) {
        setRubberBand((prev) => prev ? { ...prev, endX: world.x, endY: world.y } : null);
      }

      // 롱노트 리사이즈 드래그
      if (resizing && dragStart) {
        const rawBeat = world.y / beatScale;
        const snappedBeat = snapBeatToGrid(rawBeat, gridSnap);
        // endBeat는 노트 시작보다 최소 1/gridSnap만큼 뒤에 있어야 함
        const note = notes.find((n) => n.id === resizing.noteId);
        if (note) {
          const minEnd = note.beat + (1 / gridSnap);
          setDragDelta({ beatDelta: Math.max(snappedBeat, minEnd) - resizing.startEndBeat, columnDelta: 0 });
        }
      }

      // Drag preview for move tool
      if (isDragging && dragStart && activeTool === 'move') {
        const { beat: startBeat } = worldToLaneBeat(dragStart.x, dragStart.y);
        const beatDelta = beat - startBeat;

        // Column index delta
        const startLaneIdx = lanes.findIndex((l) => {
          const relX = dragStart.x - offsetX;
          return relX >= l.x && relX < l.x + l.width;
        });
        const endLaneIdx = lanes.findIndex((l) => l.id === column);
        const columnDelta = endLaneIdx >= 0 && startLaneIdx >= 0 ? endLaneIdx - startLaneIdx : 0;

        setDragDelta({ beatDelta, columnDelta });
      }
    },
    [screenToWorld, worldToLaneBeat, isDragging, dragStart, rubberBand, activeTool, lanes, offsetX, resizing, notes, beatScale, gridSnap, onNoteHover, findNoteAtPosition]
  );

  // 클릭 핸들러
  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      pointerUpProcessedRef.current = false;
      const world = screenToWorld(e.nativeEvent.clientX, e.nativeEvent.clientY);
      const { column, beat } = worldToLaneBeat(world.x, world.y);

      if (!column || beat < 0) return;

      // Skip editor actions on right-click (context menu will handle it)
      if (e.nativeEvent.button === 2) return;

      switch (activeTool) {
        case 'select': {
          // 롱노트 endBeat 리사이즈 감지 (우선 체크)
          const longNoteEnd = findLongNoteEndAtPosition(world.x, world.y);
          if (longNoteEnd && longNoteEnd.endBeat !== undefined) {
            setResizing({ noteId: longNoteEnd.id, startEndBeat: longNoteEnd.endBeat });
            setDragStart({ x: world.x, y: world.y });
            onNoteSelect([longNoteEnd.id]);
            break;
          }

          const clickedNote = findNoteAtPosition(world.x, world.y);
          if (clickedNote) {
            const additive = e.nativeEvent.ctrlKey || e.nativeEvent.metaKey;
            onNoteSelect([clickedNote.id], additive);
          } else {
            // 빈 공간: start rubber band selection
            if (!e.nativeEvent.ctrlKey && !e.nativeEvent.metaKey) {
              onNoteSelect([]); // 기존 선택 해제
            }
            setRubberBand({ startX: world.x, startY: world.y, endX: world.x, endY: world.y });
          }
          break;
        }

        case 'addNote': {
          // 노트 추가
          const { measure, fraction } = beatToMeasureFraction(beat);
          const noteType: NoteType =
            selectedNoteType === 'longNote' ? 'playable' : selectedNoteType;

          onNoteAdd({
            beat,
            measure,
            fraction,
            column,
            keysound: currentKeysound,
            noteType,
            channel: '', // Writer에서 자동 계산됨
            endBeat:
              selectedNoteType === 'longNote' ? beat + 0.5 : undefined,
          });
          break;
        }

        case 'delete': {
          const clickedNote = findNoteAtPosition(world.x, world.y);
          if (clickedNote) {
            onNoteDelete([clickedNote.id]);
          }
          break;
        }

        case 'move': {
          const clickedNote = findNoteAtPosition(world.x, world.y);
          if (clickedNote) {
            if (!selectedNotes.has(clickedNote.id)) {
              onNoteSelect([clickedNote.id]);
            }
            setIsDragging(true);
            setDragStart({ x: world.x, y: world.y });
          }
          break;
        }

        case 'keysound': {
          const clickedNote = findNoteAtPosition(world.x, world.y);
          if (clickedNote && onKeysoundAssign) {
            onKeysoundAssign(clickedNote.id, currentKeysound);
          }
          break;
        }

        case 'bpm': {
          // 기존 BPM 마커 근처 클릭 시 편집 모드 (raw beat로 검색하여 오프 그리드 마커도 감지)
          const rawBeat = world.y / beatScale;
          const clickTolerance = 4 / beatScale; // 4px tolerance in beats
          const existingBpm = bpmChanges?.find((c) => {
            const markerBeat = c.measure * 4 + c.fraction * 4;
            return Math.abs(markerBeat - rawBeat) < clickTolerance;
          });

          if (existingBpm && onBpmEditRequest) {
            onBpmEditRequest(existingBpm);
          } else if (onBpmRequest) {
            onBpmRequest(beat); // Use grid-snapped beat for new markers
          } else if (onBpmChange) {
            onBpmChange(beat, baseBpm || 120);
          }
          break;
        }

        case 'stop': {
          // 기존 STOP 마커 근처 클릭 시 편집 모드 (raw beat)
          const rawBeat = world.y / beatScale;
          const stopClickTolerance = 4 / beatScale;
          const existingStop = stopEvents?.find((s) => {
            const markerBeat = s.measure * 4 + s.fraction * 4;
            return Math.abs(markerBeat - rawBeat) < stopClickTolerance;
          });

          if (existingStop && onStopEditRequest) {
            onStopEditRequest(existingStop);
          } else if (onStopRequest) {
            onStopRequest(beat);
          }
          break;
        }
      }
    },
    [
      activeTool,
      screenToWorld,
      worldToLaneBeat,
      findNoteAtPosition,
      findLongNoteEndAtPosition,
      selectedNotes,
      selectedNoteType,
      currentKeysound,
      baseBpm,
      beatScale,
      onNoteAdd,
      onNoteDelete,
      onNoteSelect,
      onBpmChange,
      onBpmRequest,
      onBpmEditRequest,
      onStopRequest,
      onStopEditRequest,
      stopEvents,
      onKeysoundAssign,
    ]
  );

  // 범위 내 노트 찾기 (rubber band용)
  const findNotesInRect = useCallback(
    (x1: number, y1: number, x2: number, y2: number): string[] => {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      // Y 범위를 beat로 변환 (NOTE_HEIGHT/2 오프셋 보정)
      const minBeat = (minY - NOTE_HEIGHT / 2) / beatScale;
      const maxBeat = (maxY - NOTE_HEIGHT / 2) / beatScale;

      return notes
        .filter((note) => {
          const lane = lanes.find((l) => l.id === note.column);
          if (!lane) return false;
          const noteX = offsetX + lane.x + lane.width / 2;
          return noteX >= minX && noteX <= maxX && note.beat >= minBeat && note.beat <= maxBeat;
        })
        .map((n) => n.id);
    },
    [notes, lanes, offsetX, beatScale]
  );

  // 마우스 업 핸들러
  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();

      // Guard: R3F dispatches pointer events to all intersected meshes.
      // Without this guard, a single mouse-up over overlapping meshes (note + selection + lane bg)
      // would call onNoteMove multiple times, compounding the column delta.
      if (pointerUpProcessedRef.current) return;
      pointerUpProcessedRef.current = true;

      // 롱노트 리사이즈 완료
      if (resizing && onNoteUpdate) {
        const world = screenToWorld(e.nativeEvent.clientX, e.nativeEvent.clientY);
        // Only apply resize if actually dragged (minimum pixel threshold to avoid accidental snaps)
        const dragPixelDist = dragStart ? Math.abs(world.y - dragStart.y) : 0;
        if (dragPixelDist > 3) {
          const rawBeat = world.y / beatScale;
          const snappedBeat = snapBeatToGrid(rawBeat, gridSnap);
          const note = notes.find((n) => n.id === resizing.noteId);
          if (note) {
            const minEnd = note.beat + (1 / gridSnap);
            const newEndBeat = Math.max(snappedBeat, minEnd);
            if (Math.abs(newEndBeat - resizing.startEndBeat) > 0.001) {
              onNoteUpdate(resizing.noteId, { endBeat: newEndBeat });
            }
          }
        }
        setResizing(null);
        setDragStart(null);
        setDragDelta(null);
        return;
      }

      // Rubber band selection finalize
      if (rubberBand) {
        const { startX, startY, endX, endY } = rubberBand;
        const dx = Math.abs(endX - startX);
        const dy = Math.abs(endY - startY);
        // Only apply if dragged a meaningful distance
        if (dx > 3 || dy > 3) {
          const noteIds = findNotesInRect(startX, startY, endX, endY);
          const additive = e.nativeEvent.ctrlKey || e.nativeEvent.metaKey;
          onNoteSelect(noteIds, additive);
        }
        setRubberBand(null);
        return;
      }

      // Move tool drag finalize
      if (isDragging && dragStart && selectedNotes.size > 0) {
        const world = screenToWorld(
          e.nativeEvent.clientX,
          e.nativeEvent.clientY
        );
        const { column: newColumn, beat: newBeat } = worldToLaneBeat(
          world.x,
          world.y
        );
        const { column: startColumn, beat: startBeat } = worldToLaneBeat(
          dragStart.x,
          dragStart.y
        );

        if (newColumn && startColumn) {
          const beatDelta = newBeat - startBeat;
          const startLaneIdx = lanes.findIndex((l) => l.id === startColumn);
          const endLaneIdx = lanes.findIndex((l) => l.id === newColumn);
          const colDelta = endLaneIdx - startLaneIdx;
          if (Math.abs(beatDelta) > 0.01 || colDelta !== 0) {
            onNoteMove(Array.from(selectedNotes), {
              beat: beatDelta,
              columnDelta: colDelta !== 0 ? colDelta : undefined,
            }, gridSnap);
          }
        }
      }

      setIsDragging(false);
      setDragStart(null);
      setDragDelta(null);
    },
    [
      isDragging,
      dragStart,
      selectedNotes,
      screenToWorld,
      worldToLaneBeat,
      onNoteMove,
      onNoteUpdate,
      rubberBand,
      resizing,
      notes,
      beatScale,
      gridSnap,
      findNotesInRect,
      onNoteSelect,
      lanes,
    ]
  );

  return (
    <group
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* 배경 (클릭 가능 영역) */}
      <mesh position={[0, totalHeight / 2, -10]}>
        <planeGeometry args={[totalWidth + 100, totalHeight + 100]} />
        <meshBasicMaterial color="#0a0a1a" transparent opacity={0.01} />
      </mesh>

      {/* 레인 배경 */}
      <LanesRenderer lanes={lanes} totalHeight={totalHeight} />

      {/* 마디선 + 마디 번호 */}
      <MeasureLinesRenderer
        totalBeats={totalBeats}
        beatScale={beatScale}
        totalWidth={totalWidth}
        gridSnap={gridSnap}
        scrollBeat={scrollBeat}
        viewportBeats={size.height / beatScale}
      />

      {/* 노트 렌더링 (InstancedMesh) */}
      <NotesRenderer
        notes={notes}
        lanes={lanes}
        beatScale={beatScale}
        selectedNotes={selectedNotes}
        offsetX={offsetX}
        scrollBeat={scrollBeat}
        viewportBeats={size.height / beatScale}
      />

      {/* 호버 미리보기 */}
      {activeTool === 'addNote' && hoverPosition && (
        <HoverPreview
          beat={hoverPosition.beat}
          column={hoverPosition.column}
          lanes={lanes}
          beatScale={beatScale}
          offsetX={offsetX}
          isSilent={currentKeysound === '00'}
          isLongNote={selectedNoteType === 'longNote'}
        />
      )}

      {/* Rubber band selection rectangle */}
      {rubberBand && (
        <RubberBandRect
          startX={rubberBand.startX}
          startY={rubberBand.startY}
          endX={rubberBand.endX}
          endY={rubberBand.endY}
        />
      )}

      {/* Drag ghost notes (move preview) */}
      {isDragging && dragDelta && selectedNotes.size > 0 && (
        <DragGhostNotes
          notes={notes}
          selectedNotes={selectedNotes}
          lanes={lanes}
          beatScale={beatScale}
          offsetX={offsetX}
          beatDelta={dragDelta.beatDelta}
          columnDelta={dragDelta.columnDelta}
        />
      )}

      {/* BPM 마커 */}
      {bpmChanges && (
        <BpmMarkersRenderer
          bpmChanges={bpmChanges}
          beatScale={beatScale}
          totalWidth={totalWidth}
          scrollBeat={scrollBeat}
          viewportBeats={size.height / beatScale}
        />
      )}

      {/* STOP 마커 */}
      {stopEvents && stopEvents.length > 0 && (
        <StopMarkersRenderer
          stopEvents={stopEvents}
          beatScale={beatScale}
          totalWidth={totalWidth}
          scrollBeat={scrollBeat}
          viewportBeats={size.height / beatScale}
        />
      )}

      {/* 판정선 (재생 중일 때만 표시) */}
      {scrollBeatImperativeRef && (
        <EditorJudgmentLine
          scrollBeatImperativeRef={scrollBeatImperativeRef}
          beatScale={beatScale}
          totalWidth={totalWidth}
        />
      )}
    </group>
  );
}

/** 레인 배경 렌더러 (batched dividers → single LineSegments) */
const LanesRenderer = React.memo(function LanesRenderer({
  lanes,
  totalHeight,
}: {
  lanes: LaneConfig[];
  totalHeight: number;
}) {
  const totalWidth = lanes.reduce((sum, lane) => sum + lane.width, 0);
  const offsetX = -totalWidth / 2;
  const dividerGeomRef = useRef<THREE.BufferGeometry>(null);

  // 레인별 배경색 캐싱
  const laneBackgrounds = useMemo(
    () => lanes.map((lane) => getLaneBackground(lane)),
    [lanes]
  );

  // 레인 구분선을 단일 LineSegments geometry로 batch
  useEffect(() => {
    const geometry = dividerGeomRef.current;
    if (!geometry) return;
    const positions: number[] = [];
    for (const lane of lanes) {
      const x = offsetX + lane.x + lane.width;
      positions.push(x, 0, -4, x, totalHeight, -4);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.computeBoundingSphere();
  }, [lanes, totalHeight, offsetX]);

  return (
    <group>
      {lanes.map((lane, i) => (
        <mesh
          key={lane.id}
          position={[
            offsetX + lane.x + lane.width / 2,
            totalHeight / 2,
            -5,
          ]}
        >
          <planeGeometry args={[lane.width, totalHeight]} />
          <meshBasicMaterial color={laneBackgrounds[i]} />
        </mesh>
      ))}
      {/* 레인 구분선 (single draw call) */}
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={dividerGeomRef} />
        <lineBasicMaterial color="#333366" />
      </lineSegments>
    </group>
  );
});

// 마디선 색상 상수
const MEASURE_LINE_COLOR = new THREE.Color('#6666aa');
const BEAT_LINE_COLOR = new THREE.Color('#444466');
const GRID_LINE_COLOR = new THREE.Color('#2a2a44');

/** 마디선 렌더러 (batched LineSegments + viewport culling with large buffer to avoid frequent rebuilds) */
const MeasureLinesRenderer = React.memo(function MeasureLinesRenderer({
  totalBeats,
  beatScale,
  totalWidth,
  gridSnap,
  scrollBeat,
  viewportBeats,
}: {
  totalBeats: number;
  beatScale: number;
  totalWidth: number;
  gridSnap: GridSnap;
  scrollBeat: number;
  viewportBeats: number;
}) {
  const lineSegmentsRef = useRef<THREE.LineSegments>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  // Large buffer: rebuild only when scroll goes outside the pre-computed range
  // This avoids geometry rebuild on every scroll change during playback
  const BUFFER_MULTIPLIER = 2.0;
  const buffer = viewportBeats * BUFFER_MULTIPLIER;

  // Track the computed range so we only rebuild when scroll exits it
  const computedRangeRef = useRef<{ min: number; max: number; beatScale: number; gridSnap: number; halfWidth: number }>({
    min: -1, max: -1, beatScale: 0, gridSnap: 0, halfWidth: 0,
  });

  const halfWidth = totalWidth / 2;

  // Compute stable min/max: only change when scroll exits the inner "safe zone"
  const innerBuffer = viewportBeats * 0.3; // inner zone that triggers rebuild
  const prev = computedRangeRef.current;
  const needsRebuild =
    prev.beatScale !== beatScale ||
    prev.gridSnap !== gridSnap ||
    prev.halfWidth !== halfWidth ||
    scrollBeat < prev.min + innerBuffer ||
    scrollBeat + viewportBeats > prev.max - innerBuffer;

  const minBeat = needsRebuild ? Math.max(0, scrollBeat - buffer) : prev.min;
  const maxBeat = needsRebuild ? Math.min(totalBeats, scrollBeat + viewportBeats + buffer) : prev.max;

  // 라인 지오메트리 계산 (only when range changes)
  useEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;

    const positions: number[] = [];
    const colors: number[] = [];

    const addLine = (y: number, color: THREE.Color) => {
      positions.push(-halfWidth, y, -3, halfWidth, y, -3);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    };

    // 마디선 (4비트마다)
    const measureStart = Math.max(0, Math.floor(minBeat / 4) * 4);
    for (let beat = measureStart; beat <= maxBeat; beat += 4) {
      addLine(beat * beatScale, MEASURE_LINE_COLOR);
    }

    // 비트선 (1비트마다)
    const beatStart = Math.max(0, Math.floor(minBeat));
    for (let beat = beatStart; beat <= maxBeat; beat++) {
      if (beat % 4 !== 0) {
        addLine(beat * beatScale, BEAT_LINE_COLOR);
      }
    }

    // 그리드선 (gridSnap에 따라)
    const gridStep = 4 / gridSnap;
    const gridStart = Math.max(0, Math.floor(minBeat / gridStep) * gridStep);
    for (let beat = gridStart; beat <= maxBeat; beat += gridStep) {
      const isInteger = Math.abs(beat - Math.round(beat)) < 0.001;
      if (!isInteger) {
        addLine(beat * beatScale, GRID_LINE_COLOR);
      }
    }

    const posArray = new Float32Array(positions);
    const colorArray = new Float32Array(colors);

    geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    geometry.computeBoundingSphere();

    // Update tracked range
    computedRangeRef.current = { min: minBeat, max: maxBeat, beatScale, gridSnap, halfWidth };
  }, [totalBeats, beatScale, gridSnap, halfWidth, minBeat, maxBeat]);

  // 마디 번호 - viewport 내만
  const measureLabels = useMemo(() => {
    const labels: { y: number; label: string }[] = [];
    const measureStart = Math.max(0, Math.floor(minBeat / 4) * 4);
    for (let beat = measureStart; beat <= maxBeat; beat += 4) {
      const measure = Math.floor(beat / 4);
      labels.push({ y: beat * beatScale, label: `#${String(measure).padStart(3, '0')}` });
    }
    return labels;
  }, [beatScale, minBeat, maxBeat]);

  return (
    <group>
      <lineSegments ref={lineSegmentsRef} frustumCulled={false}>
        <bufferGeometry ref={geometryRef} />
        <lineBasicMaterial vertexColors />
      </lineSegments>
      {/* 마디 번호 */}
      {measureLabels.map(({ y, label }) => (
        <Text
          key={label}
          position={[-halfWidth - 30, y + 8, -3]}
          fontSize={10}
          color="#8888cc"
          anchorX="right"
          anchorY="middle"
          font={undefined}
        >
          {label}
        </Text>
      ))}
    </group>
  );
});

/** 노트 렌더러 (InstancedMesh 기반, viewport culling + dirty check) */
const NotesRenderer = React.memo(function NotesRenderer({
  notes,
  lanes,
  beatScale,
  selectedNotes,
  offsetX,
  scrollBeat,
  viewportBeats,
}: {
  notes: EditableBMSNote[];
  lanes: LaneConfig[];
  beatScale: number;
  selectedNotes: Set<string>;
  offsetX: number;
  scrollBeat: number;
  viewportBeats: number;
}) {
  const notesMeshRef = useRef<THREE.InstancedMesh>(null);
  const selectionMeshRef = useRef<THREE.InstancedMesh>(null);
  const longNoteMeshRef = useRef<THREE.InstancedMesh>(null);
  const layerMarkerMeshRef = useRef<THREE.InstancedMesh>(null);

  const laneMap = useMemo(
    () => new Map(lanes.map((lane) => [lane.id, lane])),
    [lanes]
  );

  // dirty check refs
  const prevDataRef = useRef<{
    notes: EditableBMSNote[];
    selectedNotes: Set<string>;
    beatScale: number;
    scrollBeat: number;
    viewportBeats: number;
  }>({ notes: [], selectedNotes: new Set(), beatScale: 0, scrollBeat: -1, viewportBeats: 0 });

  // 매 프레임 인스턴스 업데이트 (dirty check로 불필요한 업데이트 스킵)
  useFrame(() => {
    const notesMesh = notesMeshRef.current;
    const selectionMesh = selectionMeshRef.current;
    const longNoteMesh = longNoteMeshRef.current;
    const layerMarkerMesh = layerMarkerMeshRef.current;
    if (!notesMesh || !selectionMesh || !longNoteMesh || !layerMarkerMesh) return;

    const prev = prevDataRef.current;
    if (
      prev.notes === notes &&
      prev.selectedNotes === selectedNotes &&
      prev.beatScale === beatScale &&
      Math.abs(prev.scrollBeat - scrollBeat) < 0.01 &&
      prev.viewportBeats === viewportBeats
    ) {
      return; // 변경 없음 - 업데이트 스킵
    }
    prevDataRef.current = { notes, selectedNotes, beatScale, scrollBeat, viewportBeats };

    // viewport culling 범위
    const buffer = viewportBeats * 0.5;
    const minBeat = scrollBeat - buffer;
    const maxBeat = scrollBeat + viewportBeats + buffer;

    let noteCount = 0;
    let selectionCount = 0;
    let longNoteCount = 0;
    let layerMarkerCount = 0;

    for (const note of notes) {
      if (noteCount >= MAX_VISIBLE_EDITOR_NOTES) break;

      // viewport culling: 범위 밖 노트 스킵
      const noteMaxBeat = note.endBeat ?? note.beat;
      if (noteMaxBeat < minBeat || note.beat > maxBeat) continue;

      const lane = laneMap.get(note.column || '');
      if (!lane) continue;

      const x = offsetX + lane.x + lane.width / 2;
      const y = note.beat * beatScale + NOTE_HEIGHT / 2;
      const laneColorHex = getLaneColorHex(lane.color);
      const colorHex = getNoteColorHex(note, laneColorHex, false);

      // 노트 본체
      _dummy.position.set(x, y, 0);
      _dummy.scale.set(lane.width - NOTE_PADDING * 2, NOTE_HEIGHT, 1);
      _dummy.updateMatrix();
      notesMesh.setMatrixAt(noteCount, _dummy.matrix);
      _color.setHex(colorHex);
      notesMesh.setColorAt(noteCount, _color);
      noteCount++;

      // 선택 하이라이트 (same y as note)
      if (selectedNotes.has(note.id) && selectionCount < MAX_VISIBLE_SELECTIONS) {
        _dummy.position.set(x, y, 1);
        _dummy.scale.set(lane.width - NOTE_PADDING * 2 + 4, NOTE_HEIGHT + 4, 1);
        _dummy.updateMatrix();
        selectionMesh.setMatrixAt(selectionCount, _dummy.matrix);
        _color.setHex(0x00ffff);
        selectionMesh.setColorAt(selectionCount, _color);
        selectionCount++;
      }

      // 롱노트 바디 + 엔드캡
      if (note.endBeat !== undefined && longNoteCount < MAX_VISIBLE_LONGNOTE_BODIES) {
        const endY = note.endBeat * beatScale + NOTE_HEIGHT / 2;
        const bodyY = (y + endY) / 2;
        const bodyHeight = Math.abs(endY - y);
        // 바디 (반투명, 뷰어와 동일한 full width)
        _dummy.position.set(x, bodyY, -1);
        _dummy.scale.set(lane.width - NOTE_PADDING * 2, bodyHeight, 1);
        _dummy.updateMatrix();
        longNoteMesh.setMatrixAt(longNoteCount, _dummy.matrix);
        _color.setHex(colorHex);
        longNoteMesh.setColorAt(longNoteCount, _color);
        longNoteCount++;

        // 엔드캡 (notesMesh에 추가)
        if (noteCount < MAX_VISIBLE_EDITOR_NOTES) {
          _dummy.position.set(x, endY, 0);
          _dummy.scale.set(lane.width - NOTE_PADDING * 2, NOTE_HEIGHT, 1);
          _dummy.updateMatrix();
          notesMesh.setMatrixAt(noteCount, _dummy.matrix);
          _color.setHex(colorHex);
          notesMesh.setColorAt(noteCount, _color);
          noteCount++;
        }
      }

      // 멀티 키음 레이어 마커 (작은 다이아몬드)
      if (note.additionalKeysounds && note.additionalKeysounds.length > 0 && layerMarkerCount < MAX_VISIBLE_LAYER_MARKERS) {
        _dummy.position.set(x + (lane.width / 2) - 4, y + NOTE_HEIGHT / 2 + 2, 2);
        _dummy.scale.set(4, 4, 1);
        _dummy.rotation.set(0, 0, Math.PI / 4); // 45도 회전 → 다이아몬드
        _dummy.updateMatrix();
        layerMarkerMesh.setMatrixAt(layerMarkerCount, _dummy.matrix);
        _color.setHex(0xffcc00); // 노란색
        layerMarkerMesh.setColorAt(layerMarkerCount, _color);
        _dummy.rotation.set(0, 0, 0); // 회전 리셋
        layerMarkerCount++;
      }
    }

    // mesh.count를 직접 설정하여 숨기기 루프 제거
    notesMesh.count = Math.max(noteCount, 1);
    notesMesh.instanceMatrix.needsUpdate = true;
    if (notesMesh.instanceColor) notesMesh.instanceColor.needsUpdate = true;

    selectionMesh.count = Math.max(selectionCount, 1);
    selectionMesh.instanceMatrix.needsUpdate = true;
    if (selectionMesh.instanceColor) selectionMesh.instanceColor.needsUpdate = true;

    longNoteMesh.count = Math.max(longNoteCount, 1);
    longNoteMesh.instanceMatrix.needsUpdate = true;
    if (longNoteMesh.instanceColor) longNoteMesh.instanceColor.needsUpdate = true;

    layerMarkerMesh.count = Math.max(layerMarkerCount, 1);
    layerMarkerMesh.instanceMatrix.needsUpdate = true;
    if (layerMarkerMesh.instanceColor) layerMarkerMesh.instanceColor.needsUpdate = true;
  });

  // 초기 색상 버퍼 설정
  useEffect(() => {
    const meshConfigs: Array<[React.RefObject<THREE.InstancedMesh | null>, number]> = [
      [notesMeshRef, MAX_VISIBLE_EDITOR_NOTES],
      [selectionMeshRef, MAX_VISIBLE_SELECTIONS],
      [longNoteMeshRef, MAX_VISIBLE_LONGNOTE_BODIES],
      [layerMarkerMeshRef, MAX_VISIBLE_LAYER_MARKERS],
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
      {/* 노트 본체 (불투명) */}
      <instancedMesh
        ref={notesMeshRef}
        args={[undefined, undefined, MAX_VISIBLE_EDITOR_NOTES]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>

      {/* 선택 하이라이트 (반투명) */}
      <instancedMesh
        ref={selectionMeshRef}
        args={[undefined, undefined, MAX_VISIBLE_SELECTIONS]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0.5} />
      </instancedMesh>

      {/* 롱노트 바디 (반투명, 뷰어와 동일 0.4 opacity) */}
      <instancedMesh
        ref={longNoteMeshRef}
        args={[undefined, undefined, MAX_VISIBLE_LONGNOTE_BODIES]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0.4} />
      </instancedMesh>

      {/* 멀티 키음 레이어 마커 (다이아몬드) */}
      <instancedMesh
        ref={layerMarkerMeshRef}
        args={[undefined, undefined, MAX_VISIBLE_LAYER_MARKERS]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>
    </group>
  );
});

/** 호버 미리보기 */
const HoverPreview = React.memo(function HoverPreview({
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
  const lane = lanes.find((l) => l.id === column);
  if (!lane) return null;

  const x = offsetX + lane.x + lane.width / 2;
  const y = beat * beatScale + NOTE_HEIGHT / 2;
  const w = lane.width - NOTE_PADDING * 2;

  if (isSilent) {
    // 무음 노트: 점선 외곽선 스타일 (반투명 + 어두운 색상)
    return (
      <group position={[x, y, 2]}>
        <mesh>
          <planeGeometry args={[w, NOTE_HEIGHT]} />
          <meshBasicMaterial color="#888888" transparent opacity={0.25} />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.PlaneGeometry(w, NOTE_HEIGHT)]} />
          <lineBasicMaterial color="#aaaaaa" transparent opacity={0.6} />
        </lineSegments>
      </group>
    );
  }

  // 롱노트 미리보기: 스타트캡 + 바디 + 엔드캡
  if (isLongNote) {
    const lnLength = 0.5 * beatScale; // 기본 0.5비트 길이
    const endY = y + lnLength;
    const bodyY = (y + endY) / 2;
    return (
      <group>
        <mesh position={[x, y, 2]}>
          <planeGeometry args={[w, NOTE_HEIGHT]} />
          <meshBasicMaterial color={lane.color} transparent opacity={0.5} />
        </mesh>
        <mesh position={[x, bodyY, 1.5]}>
          <planeGeometry args={[w, lnLength]} />
          <meshBasicMaterial color={lane.color} transparent opacity={0.2} />
        </mesh>
        <mesh position={[x, endY, 2]}>
          <planeGeometry args={[w, NOTE_HEIGHT]} />
          <meshBasicMaterial color={lane.color} transparent opacity={0.5} />
        </mesh>
      </group>
    );
  }

  return (
    <mesh position={[x, y, 2]}>
      <planeGeometry args={[w, NOTE_HEIGHT]} />
      <meshBasicMaterial color={lane.color} transparent opacity={0.5} />
    </mesh>
  );
});

/** BPM 마커 렌더러 (batched LineSegments + viewport-culled Text) */
const BpmMarkersRenderer = React.memo(function BpmMarkersRenderer({
  bpmChanges,
  beatScale,
  totalWidth,
  scrollBeat,
  viewportBeats,
}: {
  bpmChanges: BMSBpmChange[];
  beatScale: number;
  totalWidth: number;
  scrollBeat: number;
  viewportBeats: number;
}) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const halfWidth = totalWidth / 2;

  // Batched line geometry
  useEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;
    const positions: number[] = [];
    for (const change of bpmChanges) {
      const y = (change.measure * 4 + change.fraction * 4) * beatScale;
      positions.push(-halfWidth, y, 5, halfWidth, y, 5);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.computeBoundingSphere();
  }, [bpmChanges, beatScale, halfWidth]);

  // Viewport-culled labels (only render visible ones)
  const buffer = viewportBeats * 0.5;
  const minBeat = scrollBeat - buffer;
  const maxBeat = scrollBeat + viewportBeats + buffer;
  const visibleLabels = useMemo(() => {
    return bpmChanges
      .map((change) => {
        const beat = change.measure * 4 + change.fraction * 4;
        return { beat, y: beat * beatScale, bpm: change.bpm };
      })
      .filter((l) => l.beat >= minBeat && l.beat <= maxBeat);
  }, [bpmChanges, beatScale, minBeat, maxBeat]);

  return (
    <group>
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={geometryRef} />
        <lineBasicMaterial color="#ff6600" />
      </lineSegments>
      {visibleLabels.map((l, i) => (
        <Text
          key={i}
          position={[halfWidth + 30, l.y, 5]}
          fontSize={10}
          color="#ff6600"
          anchorX="left"
          anchorY="middle"
          font={undefined}
        >
          BPM {l.bpm}
        </Text>
      ))}
    </group>
  );
});

/** STOP 마커 렌더러 (batched LineSegments + viewport-culled Text) */
const StopMarkersRenderer = React.memo(function StopMarkersRenderer({
  stopEvents,
  beatScale,
  totalWidth,
  scrollBeat,
  viewportBeats,
}: {
  stopEvents: BMSStopEvent[];
  beatScale: number;
  totalWidth: number;
  scrollBeat: number;
  viewportBeats: number;
}) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const halfWidth = totalWidth / 2;

  useEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;
    const positions: number[] = [];
    for (const stop of stopEvents) {
      const y = (stop.measure * 4 + stop.fraction * 4) * beatScale;
      positions.push(-halfWidth, y, 5, halfWidth, y, 5);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.computeBoundingSphere();
  }, [stopEvents, beatScale, halfWidth]);

  const buffer = viewportBeats * 0.5;
  const minBeat = scrollBeat - buffer;
  const maxBeat = scrollBeat + viewportBeats + buffer;
  const visibleLabels = useMemo(() => {
    return stopEvents
      .map((stop) => {
        const beat = stop.measure * 4 + stop.fraction * 4;
        const durationBeats = stop.duration / 192;
        return { beat, y: beat * beatScale, label: `STOP ${durationBeats.toFixed(2)}b` };
      })
      .filter((l) => l.beat >= minBeat && l.beat <= maxBeat);
  }, [stopEvents, beatScale, minBeat, maxBeat]);

  return (
    <group>
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={geometryRef} />
        <lineBasicMaterial color="#cc33ff" />
      </lineSegments>
      {visibleLabels.map((l, i) => (
        <Text
          key={i}
          position={[halfWidth + 30, l.y, 5]}
          fontSize={10}
          color="#cc33ff"
          anchorX="left"
          anchorY="middle"
          font={undefined}
        >
          {l.label}
        </Text>
      ))}
    </group>
  );
});

/** Rubber band 선택 사각형 */
const RubberBandRect = React.memo(function RubberBandRect({
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
const DragGhostNotes = React.memo(function DragGhostNotes({
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
        const y = (note.beat + beatDelta) * beatScale + NOTE_HEIGHT / 2;
        const laneWidth = targetLane.width - NOTE_PADDING * 2;

        return (
          <group key={note.id}>
            {/* 스타트 캡 */}
            <mesh position={[x, y, 3]}>
              <planeGeometry args={[laneWidth, NOTE_HEIGHT]} />
              <meshBasicMaterial color="#00ffff" transparent opacity={0.4} />
            </mesh>
            {/* 롱노트 바디 + 엔드캡 */}
            {note.endBeat !== undefined && (() => {
              const endY = (note.endBeat + beatDelta) * beatScale + NOTE_HEIGHT / 2;
              const bodyY = (y + endY) / 2;
              const bodyHeight = Math.abs(endY - y);
              return (
                <>
                  <mesh position={[x, bodyY, 2]}>
                    <planeGeometry args={[laneWidth, bodyHeight]} />
                    <meshBasicMaterial color="#00ffff" transparent opacity={0.2} />
                  </mesh>
                  <mesh position={[x, endY, 3]}>
                    <planeGeometry args={[laneWidth, NOTE_HEIGHT]} />
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

/** 에디터 툴바 */
interface EditorToolbarProps {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  gridSnap: GridSnap;
  onGridSnapChange: (snap: GridSnap) => void;
  selectedNoteType: SelectedNoteType;
  onNoteTypeChange: (type: SelectedNoteType) => void;
  keyMode?: KeyMode;
  onKeyModeChange?: (keyMode: KeyMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  hasUnsavedChanges?: boolean;
  onSave?: () => void;
  onCreatePR?: () => void;
  branchName?: string;
}

/** keyMode 셀렉터에 표시할 일반적인 키 모드 옵션 */
const KEY_MODE_OPTIONS: KeyMode[] = ['4K', '5K', '6K', '7K', '8K', '9K', '10K', '14K'];

const EditorToolbar = React.memo(function EditorToolbar({
  activeTool,
  onToolChange,
  gridSnap,
  onGridSnapChange,
  selectedNoteType,
  onNoteTypeChange,
  keyMode,
  onKeyModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  hasUnsavedChanges,
  onSave,
  onCreatePR,
  branchName,
}: EditorToolbarProps) {
  const tools: { id: EditorTool; icon: React.ReactNode; label: string; shortcut: string }[] = [
    { id: 'select', icon: <MousePointer2 size={16} />, label: 'Select', shortcut: 'V' },
    { id: 'addNote', icon: <Plus size={16} />, label: 'Add', shortcut: 'A' },
    { id: 'delete', icon: <Trash2 size={16} />, label: 'Delete', shortcut: 'D' },
    { id: 'move', icon: <Move size={16} />, label: 'Move', shortcut: 'M' },
    { id: 'keysound', icon: <Music size={16} />, label: 'Keysound', shortcut: 'K' },
    { id: 'bpm', icon: <Gauge size={16} />, label: 'BPM', shortcut: 'B' },
    { id: 'stop', icon: <Timer size={16} />, label: 'STOP', shortcut: 'T' },
  ];

  const noteTypes: { id: SelectedNoteType; label: string }[] = [
    { id: 'playable', label: 'Playable' },
    { id: 'invisible', label: 'Invisible' },
    { id: 'landmine', label: 'Landmine' },
    { id: 'longNote', label: 'Long Note' },
  ];

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 border-b">
      {/* 도구 선택 */}
      <div className="flex items-center gap-1 border-r pr-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-2 py-1 rounded hover:bg-muted transition-colors min-w-[40px]',
              activeTool === tool.id && 'bg-primary text-primary-foreground'
            )}
            title={`${tool.label} (${tool.shortcut})`}
          >
            {tool.icon}
            <span className="text-[9px] leading-none">{tool.shortcut}</span>
          </button>
        ))}
      </div>

      {/* 그리드 스냅 */}
      <div className="flex items-center gap-1 border-r pr-2">
        <span className="text-xs text-muted-foreground">Grid:</span>
        <select
          value={gridSnap}
          onChange={(e) =>
            onGridSnapChange(parseInt(e.target.value) as GridSnap)
          }
          className="px-2 py-1 text-xs bg-muted rounded"
        >
          {GRID_SNAP_OPTIONS.map((snap) => (
            <option key={snap} value={snap}>
              1/{snap}
            </option>
          ))}
        </select>
      </div>

      {/* 키 모드 */}
      {keyMode && onKeyModeChange && (
        <div className="flex items-center gap-1 border-r pr-2">
          <span className="text-xs text-muted-foreground">Keys:</span>
          <select
            value={keyMode}
            onChange={(e) => onKeyModeChange(e.target.value as KeyMode)}
            className="px-2 py-1 text-xs bg-muted rounded"
          >
            {KEY_MODE_OPTIONS.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 노트 타입 (addNote 도구일 때만) */}
      {activeTool === 'addNote' && (
        <div className="flex items-center gap-1 border-r pr-2">
          {noteTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => onNoteTypeChange(type.id)}
              className={cn(
                'px-2 py-1 text-xs rounded hover:bg-muted transition-colors',
                selectedNoteType === type.id &&
                  'bg-primary text-primary-foreground'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      )}

      {/* Undo/Redo */}
      <div className="flex items-center gap-1 border-r pr-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-2 rounded hover:bg-muted transition-colors disabled:opacity-30"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={18} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-2 rounded hover:bg-muted transition-colors disabled:opacity-30"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={18} />
        </button>
      </div>

      {/* Copy/Paste */}
      <div className="flex items-center gap-1 border-r pr-2">
        <button
          onClick={onCopy}
          className="p-2 rounded hover:bg-muted transition-colors"
          title="Copy (Ctrl+C)"
        >
          <Copy size={18} />
        </button>
        <button
          onClick={onPaste}
          className="p-2 rounded hover:bg-muted transition-colors"
          title="Paste (Ctrl+V)"
        >
          <Clipboard size={18} />
        </button>
      </div>

      {/* 저장/PR */}
      <div className="flex items-center gap-1 ml-auto">
        {branchName && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground px-2">
            <GitBranch size={14} />
            <span>{branchName}</span>
          </div>
        )}
        {onSave && (
          <button
            onClick={onSave}
            className={cn(
              'px-3 py-1.5 text-sm rounded flex items-center gap-1',
              hasUnsavedChanges
                ? 'bg-yellow-500 text-yellow-950 hover:bg-yellow-400'
                : 'bg-muted hover:bg-muted/80'
            )}
            title="Save (Ctrl+S)"
          >
            <Save size={16} />
            Save
          </button>
        )}
        {onCreatePR && (
          <button
            onClick={onCreatePR}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded flex items-center gap-1 hover:bg-primary/90"
          >
            <GitBranch size={16} />
            Create PR
          </button>
        )}
      </div>
    </div>
  );
});

/** 판정선 (재생 중 현재 위치를 표시하는 수평선) */
const EditorJudgmentLine = React.memo(function EditorJudgmentLine({
  scrollBeatImperativeRef,
  beatScale,
  totalWidth,
}: {
  scrollBeatImperativeRef: React.RefObject<number>;
  beatScale: number;
  totalWidth: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const beat = scrollBeatImperativeRef.current ?? 0;
    const y = beat * beatScale;
    if (meshRef.current) meshRef.current.position.y = y;
    if (glowRef.current) glowRef.current.position.y = y;
  });

  const halfWidth = totalWidth / 2 + 20;

  return (
    <group>
      {/* Glow behind */}
      <mesh ref={glowRef} position={[0, 0, 3]}>
        <planeGeometry args={[halfWidth * 2, 6]} />
        <meshBasicMaterial color="#ff6600" transparent opacity={0.15} />
      </mesh>
      {/* Main line */}
      <mesh ref={meshRef} position={[0, 0, 4]}>
        <planeGeometry args={[halfWidth * 2, 2]} />
        <meshBasicMaterial color="#ff6600" />
      </mesh>
    </group>
  );
});

/** 메인 NoteChartEditor 컴포넌트 */
export const NoteChartEditor = React.memo(function NoteChartEditor({
  notes,
  keyMode,
  totalBeats,
  height = 600,
  beatScale = 20,
  className,
  activeTool,
  gridSnap,
  selectedNotes,
  selectedNoteType,
  currentKeysound,
  bpmChanges,
  stopEvents,
  baseBpm = 120,
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
  onKeysoundAssign,
  onDropKeysound,
  onNoteHover,
  scrollToBeat,
  onScrollChange,
  scrollBeatImperativeRef,
}: NoteChartEditorProps) {
  // 좌표 변환 ref (드래그 앤 드롭용)
  const coordConverterRef = useRef<CoordConverter | null>(null);

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete: 선택된 노트 삭제
      if (e.key === 'Delete' && selectedNotes.size > 0) {
        e.preventDefault();
        onNoteDelete(Array.from(selectedNotes));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNotes, onNoteDelete]);

  // 드래그 앤 드롭: dragOver 허용
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-keysound-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  // 드래그 앤 드롭: 키음 드롭 → 노트 추가
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
    <div
      className={cn('flex flex-col bg-background h-full', className)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Canvas
        style={{ height, minHeight: 0 }}
        orthographic
        camera={{
          zoom: 1,
          position: [0, 0, 100],
          near: 0.1,
          far: 1000,
        }}
        gl={{ antialias: true }}
        resize={{ debounce: 16 }}
      >
        <color attach="background" args={['#0a0a1a']} />
        <EditorCanvas
          notes={notes}
          keyMode={keyMode}
          totalBeats={totalBeats}
          beatScale={beatScale}
          activeTool={activeTool}
          gridSnap={gridSnap}
          selectedNotes={selectedNotes}
          selectedNoteType={selectedNoteType}
          currentKeysound={currentKeysound}
          bpmChanges={bpmChanges}
          stopEvents={stopEvents}
          baseBpm={baseBpm}
          onNoteAdd={onNoteAdd}
          onNoteDelete={onNoteDelete}
          onNoteMove={onNoteMove}
          onNoteSelect={onNoteSelect}
          onNoteUpdate={onNoteUpdate}
          onBpmChange={onBpmChange}
          onBpmRequest={onBpmRequest}
          onBpmEditRequest={onBpmEditRequest}
          onStopRequest={onStopRequest}
          onStopEditRequest={onStopEditRequest}
          onKeysoundAssign={onKeysoundAssign}
          onDropKeysound={onDropKeysound}
          onNoteHover={onNoteHover}
          scrollToBeat={scrollToBeat}
          onScrollChange={onScrollChange}
          coordConverterRef={coordConverterRef}
          scrollBeatImperativeRef={scrollBeatImperativeRef}
        />
      </Canvas>
    </div>
  );
});

// 타입 및 컴포넌트 내보내기
export { EditorToolbar };
export default NoteChartEditor;
