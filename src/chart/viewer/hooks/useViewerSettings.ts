/**
 * useViewerSettings — viewer display options state hook
 *
 * BMS display settings state bundle extracted from NoteChartViewer.tsx.
 * Manages UI-controllable parameters: lane options, hi-speed, playback speed,
 * grid, minimap, chart size, and timing marker settings.
 */
import { useState } from 'react';
import type {
  NoteTypeFilter,
  LaneOption,
  ColumnsLayout,
  TimingMarkerSettings,
} from '../../NoteChartViewer';
import { DEFAULT_TIMING_MARKER_SETTINGS } from '../../NoteChartViewer';

export interface UseViewerSettingsOptions {
  initialNoteTypeFilter: NoteTypeFilter;
  initialMeasuresPerColumn: number;
  initialTimingMarkerSettings?: TimingMarkerSettings;
}

export interface UseViewerSettingsReturn {
  // UI panel
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;

  // Note filter + lane
  localNoteFilter: NoteTypeFilter;
  setLocalNoteFilter: React.Dispatch<React.SetStateAction<NoteTypeFilter>>;
  laneOption: LaneOption;
  setLaneOption: React.Dispatch<React.SetStateAction<LaneOption>>;
  randomSeed: number;

  // Playback settings
  hiSpeed: number;
  setHiSpeed: React.Dispatch<React.SetStateAction<number>>;
  playbackSpeed: number;
  setPlaybackSpeed: React.Dispatch<React.SetStateAction<number>>;
  scrollSpeed: number;
  setScrollSpeed: React.Dispatch<React.SetStateAction<number>>;

  // Column mode
  localMeasuresPerColumn: number;
  setLocalMeasuresPerColumn: React.Dispatch<React.SetStateAction<number>>;
  columnsLayout: ColumnsLayout;
  setColumnsLayout: React.Dispatch<React.SetStateAction<ColumnsLayout>>;
  verticalScrollY: number;
  setVerticalScrollY: React.Dispatch<React.SetStateAction<number>>;

  // Grid + minimap
  gridDivision: number;
  setGridDivision: React.Dispatch<React.SetStateAction<number>>;
  showMinimap: boolean;
  setShowMinimap: React.Dispatch<React.SetStateAction<boolean>>;

  // Chart size overrides
  chartWidthOverride: number | null;
  setChartWidthOverride: React.Dispatch<React.SetStateAction<number | null>>;
  chartHeightOverride: number | null;
  setChartHeightOverride: React.Dispatch<React.SetStateAction<number | null>>;
  aspectRatioLocked: boolean;
  setAspectRatioLocked: React.Dispatch<React.SetStateAction<boolean>>;
  scaleWidthByScroll: boolean;
  setScaleWidthByScroll: React.Dispatch<React.SetStateAction<boolean>>;

  // Timing markers
  timingMarkerSettings: TimingMarkerSettings;
  setTimingMarkerSettings: React.Dispatch<React.SetStateAction<TimingMarkerSettings>>;
}

export function useViewerSettings({
  initialNoteTypeFilter,
  initialMeasuresPerColumn,
  initialTimingMarkerSettings,
}: UseViewerSettingsOptions): UseViewerSettingsReturn {
  const [showSettings, setShowSettings] = useState(false);

  const [localNoteFilter, setLocalNoteFilter] = useState<NoteTypeFilter>(initialNoteTypeFilter);
  const [laneOption, setLaneOption] = useState<LaneOption>('normal');
  const [randomSeed] = useState(() => Math.floor(Math.random() * 1000000));

  const [hiSpeed, setHiSpeed] = useState(3);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [scrollSpeed, setScrollSpeed] = useState(1);

  const [localMeasuresPerColumn, setLocalMeasuresPerColumn] = useState(initialMeasuresPerColumn);
  const [columnsLayout, setColumnsLayout] = useState<ColumnsLayout>('horizontal');
  const [verticalScrollY, setVerticalScrollY] = useState(0);

  const [gridDivision, setGridDivision] = useState(4);
  const [showMinimap, setShowMinimap] = useState(true);

  const [chartWidthOverride, setChartWidthOverride] = useState<number | null>(null);
  const [chartHeightOverride, setChartHeightOverride] = useState<number | null>(null);
  const [aspectRatioLocked, setAspectRatioLocked] = useState(false);
  const [scaleWidthByScroll, setScaleWidthByScroll] = useState(false);

  const [timingMarkerSettings, setTimingMarkerSettings] = useState<TimingMarkerSettings>(
    initialTimingMarkerSettings ?? DEFAULT_TIMING_MARKER_SETTINGS,
  );

  return {
    showSettings, setShowSettings,
    localNoteFilter, setLocalNoteFilter,
    laneOption, setLaneOption,
    randomSeed,
    hiSpeed, setHiSpeed,
    playbackSpeed, setPlaybackSpeed,
    scrollSpeed, setScrollSpeed,
    localMeasuresPerColumn, setLocalMeasuresPerColumn,
    columnsLayout, setColumnsLayout,
    verticalScrollY, setVerticalScrollY,
    gridDivision, setGridDivision,
    showMinimap, setShowMinimap,
    chartWidthOverride, setChartWidthOverride,
    chartHeightOverride, setChartHeightOverride,
    aspectRatioLocked, setAspectRatioLocked,
    scaleWidthByScroll, setScaleWidthByScroll,
    timingMarkerSettings, setTimingMarkerSettings,
  };
}
