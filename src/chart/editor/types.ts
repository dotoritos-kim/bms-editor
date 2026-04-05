/**
 * NoteChartEditor Types & Constants
 */

import type { EditableBMSNote, BMSBpmChange, BMSStopEvent } from '@rhythm-archive/bms-core';
import type { KeyMode } from '../NoteChartViewer';
import type { LaneConfig } from '../laneConfig';

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
export type GridSnap = (typeof GRID_SNAP_OPTIONS)[number] | number;

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
  layerConfig?: {
    playable: { visible: boolean; locked: boolean; opacity: number };
    invisible: { visible: boolean; locked: boolean; opacity: number };
    landmine: { visible: boolean; locked: boolean; opacity: number };
    bgm: { visible: boolean; locked: boolean; opacity: number };
  };

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
  onKeysoundAssign?: (noteId: string, keysoundId: string) => void;
  onDropKeysound?: (keysoundId: string, beat: number, column: string) => void;
  onNoteHover?: (keysoundId: string | null) => void;

  // 네비게이션
  scrollToBeat?: number;
  onScrollChange?: (beat: number) => void;
  /** Imperative scroll ref for smooth playback (read every frame in useFrame, bypasses React re-renders) */
  scrollBeatImperativeRef?: React.RefObject<number>;

  // 상태 표시
  hasUnsavedChanges?: boolean;
  branchName?: string;
  /** 노트 높이 (두께, 기본값 2) */
  noteHeight?: number;
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
  layerConfig?: {
    playable: { visible: boolean; locked: boolean; opacity: number };
    invisible: { visible: boolean; locked: boolean; opacity: number };
    landmine: { visible: boolean; locked: boolean; opacity: number };
    bgm: { visible: boolean; locked: boolean; opacity: number };
  };
  onLayerVisibleToggle?: (layer: string) => void;
  onLayerLockToggle?: (layer: string) => void;
}
