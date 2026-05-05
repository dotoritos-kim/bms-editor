/**
 * BMS Chart Editor & Visualization Module
 *
 * @rhythm-archive/bms-editor
 */

// Chart Visualization
export { NoteChartViewer, KEY_MODE_DISPLAY } from './NoteChartViewer';
export type { NoteChartViewerProps, KeyMode, NoteTypeFilter, ViewMode, BpmChange, StopEvent, ScrollSpeedChange } from './NoteChartViewer';

// useBmsChart hook
export { useBmsChart, detectKeyMode } from './useBmsChart';
export type {
  BmsChartInfo,
  UseBmsChartOptions,
  UseBmsChartState,
  UseBmsChartControls,
  UseBmsChartReturn,
} from './useBmsChart';

// Chart Diff
export { BmsChartDiff } from './BmsChartDiff';
export type { BmsChartDiffProps, ChartInfo as BmsChartDiffInfo } from './BmsChartDiff';

// Keysound Player (re-exported from @rhythm-archive/bms-player)
export { KeysoundPlayer, createKeysoundPlayer } from '@rhythm-archive/bms-player';
export type { KeysoundPlayerOptions, KeysoundPlayerResolveConfig } from '@rhythm-archive/bms-player';

// Lane Config
export { generateLaneConfig, getLaneIds, getDpSplitIndex } from './laneConfig';
export type { LaneConfig } from './laneConfig';

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
} from './NoteChartEditor';
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
} from './NoteChartEditor';

// Editor Panels
export { EditorContextMenu } from './EditorContextMenu';
export { EditorPlayback, buildBeatToTimeMap, beatToTime } from './EditorPlayback';
export type { EditorPlaybackOptions, BpmEvent } from './EditorPlayback';

// Panels
export { HeaderEditorPanel } from './panels/HeaderEditorPanel';
export { KeysoundPanel } from './panels/KeysoundPanel';
export { KeysoundUploadDialog } from './panels/KeysoundUploadDialog';
export { Minimap } from './panels/Minimap';
export { NoteInfoPanel } from './panels/NoteInfoPanel';
export { NoteSearchDialog } from './panels/NoteSearchDialog';
export { StatusBar } from './panels/StatusBar';
export { FilePickerCombobox } from './panels/FilePickerCombobox';
