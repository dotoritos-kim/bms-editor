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

// Editor tool types
export type EditorTool =
  | 'select'
  | 'addNote'
  | 'delete'
  | 'move'
  | 'bpm'
  | 'stop'
  | 'keysound';

// Selected note type
export type SelectedNoteType = 'playable' | 'invisible' | 'landmine' | 'longNote' | 'bgm';

// Grid snap options (extended: triplet 12/24 + high-precision 128/256/384 added)
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

// InstancedMesh constants
export const MAX_VISIBLE_EDITOR_NOTES = 3000;
export const MAX_VISIBLE_SELECTIONS = 500;
export const MAX_VISIBLE_LONGNOTE_BODIES = 500;
export const MAX_VISIBLE_LAYER_MARKERS = 500;
export const MAX_ACTIVE_FLASH = 64;
export const DEFAULT_NOTE_HEIGHT = 2;
export const NOTE_PADDING = 1;

/** Coordinate conversion API (for drag-and-drop) */
export interface CoordConverter {
  screenToWorldBeat: (clientX: number, clientY: number) => { beat: number; column: string | null } | null;
}

/** Zoom control API (for zoomControlRef) */
export interface ZoomControl {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo: (scale: number) => void;
  fitToChart: () => void;
}

/** Custom note color overrides (CSS color string per note type) */
export interface CustomNoteColors {
  /** Playable note color — falls back to lane color if unset */
  playable?: string;
  /** Invisible note color */
  invisible?: string;
  /** Landmine note color */
  landmine?: string;
  /** BGM note color */
  bgm?: string;
  /** Selected note highlight color */
  selection?: string;
  /** Canvas background color */
  background?: string;
}

export interface NoteChartEditorProps {
  /** Array of notes to edit */
  notes: EditableBMSNote[];
  /** Key mode */
  keyMode: KeyMode;
  /** Total number of beats */
  totalBeats: number;
  /** Component height */
  height?: number | string;
  /** Pixels-per-beat scale */
  beatScale?: number;
  /** Additional CSS class name */
  className?: string;
  /** Currently active tool */
  activeTool: EditorTool;
  /** Grid snap value */
  gridSnap: GridSnap;
  /** Whether snap-to-grid is enabled (OFF = free placement; Shift drag also free) */
  snapEnabled?: boolean;
  /** Set of selected note IDs */
  selectedNotes: Set<string>;
  /** Note type to use when adding notes */
  selectedNoteType: SelectedNoteType;
  /** Current keysound ID (used when adding notes) */
  currentKeysound: string;
  /** BPM change events */
  bpmChanges?: BMSBpmChange[];
  /** STOP events */
  stopEvents?: BMSStopEvent[];
  /** Base BPM */
  baseBpm?: number;
  /** Time signatures (per-measure size, used for grid line rendering) */
  timeSignatures?: Map<number, number>;
  /** Per-measure gridSnap overrides */
  gridSnapOverrides?: Map<number, number>;
  /** Per-layer visibility / lock / opacity settings */
  layerConfig?: LayerConfig;
  /** BGM channel count (for multi-BGM lane creation; default 1) */
  bgmChannelCount?: number;

  // Event handlers
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

  // Navigation
  scrollToBeat?: number;
  onScrollChange?: (beat: number) => void;
  /** Imperative scroll ref for smooth playback (read every frame in useFrame, bypasses React re-renders) */
  scrollBeatImperativeRef?: React.RefObject<number>;
  /** Zoom control imperative ref (zoomIn/zoomOut/zoomTo/fitToChart) */
  zoomControlRef?: React.MutableRefObject<ZoomControl | null>;
  /** Beat scale change callback (called with rAF debounce) */
  onBeatScaleChange?: (scale: number) => void;

  // Keysound highlight
  /** Keysound ID to highlight (notes using this keysound are shown in orange) */
  highlightKeysound?: string | null;

  // Status display
  hasUnsavedChanges?: boolean;
  branchName?: string;
  /** Note height (thickness, default 2) */
  noteHeight?: number;
  /** Custom note color overrides */
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
