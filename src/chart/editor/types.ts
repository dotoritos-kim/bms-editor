/**
 * NoteChartEditor Types & Constants
 */

import type { EditableBMSNote, BMSBpmChange, BMSStopEvent } from '@rhythm-archive/bms-core';
import type { KeyMode } from '../NoteChartViewer';
import type { LaneConfig } from '../laneConfig';
import type { LayerConfig } from './layers';

// Re-export shared layer types so callers using `from './editor/types'` still
// resolve `LayerConfig` / `LayerKey` / `LayerSettings` without a deeper import.
export type { LayerKey, LayerSettings, LayerConfig } from './layers';
export {
  DEFAULT_LAYER_SETTINGS,
  DEFAULT_LAYER_CONFIG,
  isLayerInteractable,
  isLayerVisible,
  getLayerOpacity,
} from './layers';

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
export type SelectedNoteType = 'playable' | 'invisible' | 'landmine' | 'longNote' | 'bgm';

// 그리드 스냅 옵션 (확장: 셋잇단 12/24 + 고정밀 128/256/384 추가)
export const GRID_SNAP_OPTIONS = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384] as const;
export type GridSnapPreset = (typeof GRID_SNAP_OPTIONS)[number];
export type GridSnap = GridSnapPreset | number;

/**
 * Type predicate for `GRID_SNAP_OPTIONS.includes(value)`.
 *
 * The `as const` tuple's `.includes()` is typed too narrowly to accept arbitrary
 * `number` values, which previously forced `gridSnap as any` casts at call sites.
 * This guard widens the comparison to `readonly number[]` while preserving the
 * preset literal narrowing on the `true` branch.
 */
export function isPresetGridSnap(value: number): value is GridSnapPreset {
  return (GRID_SNAP_OPTIONS as readonly number[]).includes(value);
}

// InstancedMesh 상수
export const MAX_VISIBLE_EDITOR_NOTES = 3000;
export const MAX_VISIBLE_SELECTIONS = 500;
export const MAX_VISIBLE_LONGNOTE_BODIES = 500;
export const MAX_VISIBLE_LAYER_MARKERS = 500;
export const MAX_ACTIVE_FLASH = 64;
export const DEFAULT_NOTE_HEIGHT = 2;
export const NOTE_PADDING = 1;

/** 좌표 변환 API (드래그 앤 드롭용) */
export interface CoordConverter {
  screenToWorldBeat: (clientX: number, clientY: number) => { beat: number; column: string | null } | null;
}

/** 줌 컨트롤 API (zoomControlRef용) */
export interface ZoomControl {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo: (scale: number) => void;
  fitToChart: () => void;
}

/** 커스텀 노트 색상 오버라이드 (노트 타입별 CSS color string) */
export interface CustomNoteColors {
  /** 일반(플레이어블) 노트 색상 — 미지정 시 레인 색상 */
  playable?: string;
  /** 인비저블 노트 색상 */
  invisible?: string;
  /** 지뢰 노트 색상 */
  landmine?: string;
  /** BGM 노트 색상 */
  bgm?: string;
  /** 선택된 노트 하이라이트 색상 */
  selection?: string;
  /** 캔버스 배경 색상 */
  background?: string;
}

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
  /** Snap to grid 활성화 여부 (OFF면 free placement, Shift 드래그도 free) */
  snapEnabled?: boolean;
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
  /** 박자표 (마디별 크기, 그리드선 렌더링에 사용) */
  timeSignatures?: Map<number, number>;
  /** 마디별 gridSnap 오버라이드 */
  gridSnapOverrides?: Map<number, number>;
  /** 레이어별 가시성/잠금/불투명도 설정 */
  layerConfig?: LayerConfig;
  /** BGM 채널 수 (멀티 BGM 레인 생성용, 기본값 1) */
  bgmChannelCount?: number;

  // 이벤트 핸들러
  onNoteAdd: (note: Omit<EditableBMSNote, 'id'>) => void;
  onNoteDelete: (noteIds: string[]) => void;
  onNoteMove: (
    noteIds: string[],
    delta: { beat?: number; columnDelta?: number },
    gridSnap?: GridSnap
  ) => void;
  onNoteSelect: (noteIds: string[], additive?: boolean) => void;
  onNoteUpdate?: (noteId: string, updates: Partial<EditableBMSNote>) => void;
  onBpmChange?: (beat: number, bpm: number) => void;
  onBpmRequest?: (beat: number) => void;
  onBpmEditRequest?: (bpmChange: BMSBpmChange) => void;
  onStopRequest?: (beat: number) => void;
  onStopEditRequest?: (stopEvent: BMSStopEvent) => void;
  onStopDelete?: (stopEvent: BMSStopEvent) => void;
  onKeysoundAssign?: (noteId: string, keysoundId: string) => void;
  onDropKeysound?: (keysoundId: string, beat: number, column: string) => void;
  onNoteHover?: (keysoundId: string | null) => void;

  // 네비게이션
  scrollToBeat?: number;
  onScrollChange?: (beat: number) => void;
  /** Imperative scroll ref for smooth playback (read every frame in useFrame, bypasses React re-renders) */
  scrollBeatImperativeRef?: React.RefObject<number>;
  /** 줌 컨트롤 imperative ref (zoomIn/zoomOut/zoomTo/fitToChart) */
  zoomControlRef?: React.MutableRefObject<ZoomControl | null>;
  /** 줌 배율 변경 콜백 (rAF 디바운스로 호출) */
  onBeatScaleChange?: (scale: number) => void;

  // 키음 하이라이트
  /** 하이라이트할 키음 ID (해당 키음을 사용하는 노트가 주황색으로 표시) */
  highlightKeysound?: string | null;

  // 상태 표시
  hasUnsavedChanges?: boolean;
  branchName?: string;
  /** 노트 높이 (두께, 기본값 2) */
  noteHeight?: number;
  /** 커스텀 노트 색상 오버라이드 */
  customColors?: CustomNoteColors;
}

export interface EditorToolbarProps {
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
  noteHeight?: number;
  onNoteHeightChange?: (height: number) => void;
  // Snap
  snapEnabled?: boolean;
  onSnapToggle?: () => void;
  // Layer
  layerConfig?: LayerConfig;
  onLayerVisibleToggle?: (layer: string) => void;
  onLayerLockToggle?: (layer: string) => void;
  // Zoom
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomPreset?: (scale: number) => void;
  onZoomFit?: () => void;
  currentBeatScale?: number;
}
