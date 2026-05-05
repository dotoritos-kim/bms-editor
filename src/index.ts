/**
 * @rhythm-archive/bms-editor
 *
 * BMS chart editor and visualization library.
 * Provides NoteChartViewer, NoteChartEditor with undo/redo, chart diff visualization.
 * Supports all key modes from 4K to 48K+4SC.
 */

// Chart Visualization
export { NoteChartViewer, KEY_MODE_DISPLAY } from './chart';
export type { NoteChartViewerProps, KeyMode, NoteTypeFilter, ViewMode, BpmChange, StopEvent, ScrollSpeedChange } from './chart';

// Chart Editor
export {
  NoteChartEditor,
  EditorToolbar,
  GRID_SNAP_OPTIONS,
  DEFAULT_LAYER_SETTINGS,
  DEFAULT_LAYER_CONFIG,
  isLayerInteractable,
  isLayerVisible,
  getLayerOpacity,
} from './chart';
export type {
  NoteChartEditorProps,
  EditorTool,
  SelectedNoteType,
  GridSnap,
  CustomNoteColors,
  ZoomControl,
  LayerKey,
  LayerSettings,
  LayerConfig,
} from './chart';

// Chart Diff
export { BmsChartDiff } from './chart';
export type { BmsChartDiffProps, BmsChartDiffInfo } from './chart';

// Keysound Player (chart-level)
export { KeysoundPlayer, createKeysoundPlayer } from './chart';
export type { KeysoundPlayerOptions } from './chart';

// useBmsChart hook
export { useBmsChart, detectKeyMode } from './chart';
export type { BmsChartInfo, UseBmsChartOptions, UseBmsChartState, UseBmsChartControls, UseBmsChartReturn } from './chart';

// Lane Config
export { generateLaneConfig, getLaneIds, getDpSplitIndex } from './chart';
export type { LaneConfig } from './chart';

// Editor Playback
export { EditorPlayback, buildBeatToTimeMap, beatToTime } from './chart';
export type { EditorPlaybackOptions, BpmEvent } from './chart';

// Editor Context Menu
export { EditorContextMenu } from './chart/EditorContextMenu';

// Editor Panels
export { HeaderEditorPanel } from './chart/panels/HeaderEditorPanel';
export { KeysoundPanel } from './chart/panels/KeysoundPanel';
export { KeysoundUploadDialog } from './chart/panels/KeysoundUploadDialog';
export { Minimap } from './chart/panels/Minimap';
export type { MinimapDensityEntry, MinimapBookmark } from './chart/panels/Minimap';
export { NoteInfoPanel } from './chart/panels/NoteInfoPanel';
export { NoteSearchDialog } from './chart/panels/NoteSearchDialog';
export { StatusBar } from './chart/panels/StatusBar';
export { FilePickerCombobox } from './chart/panels/FilePickerCombobox';

// Utility
export { cn, getErrorMessage } from './utils';
