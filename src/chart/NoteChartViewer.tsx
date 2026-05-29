/**
 * NoteChartViewer Component (WebGL Version)
 *
 * Component that visually displays a BMS note chart.
 * Uses React Three Fiber for WebGL 2D rendering.
 *
 * Note type visualization:
 * - playable: normal note (bright color)
 * - invisible: ghost note (dashed border, semi-transparent)
 * - landmine: landmine note (red X mark)
 * - bgm: BGM auto-play note (gray dashed)
 */

import React, { useRef, useEffect, useMemo, useState, useCallback, Suspense } from 'react';
// flushSync removed - performance optimization (prevent main thread blocking)
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Play, Pause, Maximize2, Minimize2, GripVertical, Volume2, VolumeX, ZoomIn, ZoomOut, RotateCcw, Settings, Eye, Bomb, Music, Ghost, FlipHorizontal, SkipBack, SkipForward, Loader2, LayoutGrid, Rows3, Map as MapIcon, Link2, Link2Off } from 'lucide-react';
import { cn } from '../utils';
import { useI18n } from '../i18n';
import type { BMSNote } from '@rhythm-archive/bms-core';
import { Positioning, Timing } from '@rhythm-archive/bms-core';
import { generateLaneConfig, type LaneConfig } from './laneConfig';
import { useBgmAudio } from './viewer/hooks/useBgmAudio';
import { useKeysoundLifecycle } from './viewer/hooks/useKeysoundLifecycle';
import { useFullscreen } from './viewer/hooks/useFullscreen';
import { useViewerScroll } from './viewer/hooks/useViewerScroll';
import { useViewerKeyboard } from './viewer/hooks/useViewerKeyboard';
import { useViewerSettings } from './viewer/hooks/useViewerSettings';
import { useViewerAudioSettings } from './viewer/hooks/useViewerAudioSettings';
import { useViewerPlayback } from './viewer/hooks/useViewerPlayback';
// EqualizerBand/EqualizerSettings/EffectorSettings are exported from useKeysoundLifecycle
import type { EqualizerBand, EqualizerSettings, EffectorSettings } from './viewer/hooks/useKeysoundLifecycle';
import { useKeysoundTrigger } from './viewer/hooks/useKeysoundTrigger';
import { NumberInputWithPresets } from './viewer/NumberInputWithPresets';
import { applyLaneOption } from './viewer/laneUtils';
// ── Renderer sub-modules (Stage E extraction) ─────────────────────────────────
import {
  NOTE_HEIGHT,
  NOTE_PADDING,
  mulberry32,
  LanesRenderer,
  MeasureLinesRenderer,
  NotesRenderer,
  TimingMarkersRenderer,
  ColumnsViewRenderer,
  SceneInvalidator,
  CameraController,
  ColumnsCameraController,
  JudgmentLine,
  HitEffectsRenderer,
  Minimap,
  type HitEffect,
} from './viewer/renderers';

// View mode type
export type ViewMode = 'scroll' | 'playback' | 'columns';

// Key mode type
export type KeyMode = '4K' | '5K' | '6K' | '7K' | '8K' | '9K' | '10K' | '12K' | '14K' | '18K' | '24K' | '48K';

// Key mode display format (with/without scratch)
export const KEY_MODE_DISPLAY: { [key in KeyMode]: string } = {
  '4K': '4K+SC',
  '5K': '5K+SC',
  '6K': '6K+SC',
  '7K': '7K+SC',
  '8K': '8K',
  '9K': '9K',
  '10K': '10K (5K+SC DP)',
  '12K': '12K (6K DP)',
  '14K': '14K (7K+SC DP)',
  '18K': '18K (9K DP)',
  '24K': '24K',
  '48K': '48K (24K DP)',
};

// Filter options per note type
export interface NoteTypeFilter {
  playable: boolean;
  invisible: boolean;
  landmine: boolean;
  bgm: boolean;
}

/** BPM change event */
export interface BpmChange {
  beat: number;
  bpm: number;
}

/** STOP event */
export interface StopEvent {
  beat: number;
  duration: number;
}

/** Scroll speed change event */
export interface ScrollSpeedChange {
  beat: number;
  speed: number;
}

/** Per-marker type settings */
export interface MarkerTypeSettings {
  visible: boolean;
  color: string;
  fontSize: number;
  opacity: number;
  showLine: boolean;
  showBackground: boolean;
}

/** Full timing marker settings */
export interface TimingMarkerSettings {
  bpm: MarkerTypeSettings;
  stop: MarkerTypeSettings;
  scroll: MarkerTypeSettings;
}

/** Default timing marker settings */
export const DEFAULT_TIMING_MARKER_SETTINGS: TimingMarkerSettings = {
  bpm: {
    visible: true,
    color: '#00ff88',
    fontSize: 14,
    opacity: 1.0,
    showLine: true,
    showBackground: true,
  },
  stop: {
    visible: true,
    color: '#ff4444',
    fontSize: 14,
    opacity: 1.0,
    showLine: true,
    showBackground: true,
  },
  scroll: {
    visible: true,
    color: '#00ffff',
    fontSize: 14,
    opacity: 1.0,
    showLine: true,
    showBackground: true,
  },
};

// LaneOption type re-exported for back-compat (extracted to viewer/laneUtils.ts in Stage G)
export type { LaneOption } from './viewer/laneUtils';

/** Playback speed options */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Scroll speed options (independent of audio playback speed) */
export const SCROLL_SPEEDS = [0.5, 1, 2, 4, 8, 16] as const;

/** Grid division options (lines per beat) */
export const GRID_DIVISIONS = [1, 2, 4, 8, 16, 32, 48, 64, 96] as const;

/** Columns view layout type */
export type ColumnsLayout = 'horizontal' | 'vertical';

export interface NoteChartViewerProps {
  notes: BMSNote[];
  keyMode?: KeyMode;
  totalBeats?: number;
  height?: number;
  beatScale?: number;
  className?: string;
  isLoading?: boolean;
  noteTypeFilter?: NoteTypeFilter;
  showKeysounds?: boolean;
  diffMode?: boolean;
  addedNotes?: BMSNote[];
  removedNotes?: BMSNote[];
  modifiedNotes?: BMSNote[];
  bpm?: number;
  bpmChanges?: BpmChange[];
  stops?: StopEvent[];
  scrollChanges?: ScrollSpeedChange[];
  initialViewMode?: ViewMode;
  staticMaxHeight?: number;
  audioUrl?: string;
  judgmentLinePosition?: number;
  showTimingMarkers?: boolean;
  /** Keysound mapping (ID -> filename) */
  keysounds?: Record<string, string>;
  /** Base URL for keysound files */
  keysoundBaseUrl?: string;
  /** Measures per column in columns view (default: 4) */
  measuresPerColumn?: number;
  /** Gap between columns (default: 20) */
  columnGap?: number;
  /** Positioning object (scroll gimmick support) */
  positioning?: Positioning | null;
  /** Timing object (time-to-beat conversion with BPM changes) */
  timing?: Timing | null;
  /** Timing marker settings (BPM/STOP/SCROLL display options) */
  timingMarkerSettings?: TimingMarkerSettings;
  /** Note height scale (default 1.0) */
  noteScale?: number;
  /** Lane width scale (default 1.0) */
  laneWidthScale?: number;
  /** Initial scroll position (in beats) */
  initialScrollBeat?: number;
  /** Used to change scroll position from outside (scrolls to this beat when changed) */
  scrollToBeat?: number;
  /** Opacity for unchanged notes (0-1, dims unmodified notes in diff mode) */
  unchangedOpacity?: number;
}

const DEFAULT_NOTE_TYPE_FILTER: NoteTypeFilter = {
  playable: true,
  invisible: true,  // Ghost notes enabled by default
  landmine: true,
  bgm: true,        // BGM enabled by default
};


// Renderer implementations → viewer/renderers/ (Stage E extraction)

/** Main component */
export function NoteChartViewer({
  notes,
  keyMode = '7K',
  totalBeats,
  height = 400,
  beatScale = 20,
  className,
  isLoading = false,
  noteTypeFilter = DEFAULT_NOTE_TYPE_FILTER,
  showKeysounds = true,
  diffMode = false,
  addedNotes = [],
  removedNotes = [],
  modifiedNotes = [],
  bpm = 150,
  bpmChanges = [],
  stops = [],
  scrollChanges = [],
  initialViewMode = 'scroll',
  staticMaxHeight = 2000,
  audioUrl,
  judgmentLinePosition = 0.12, // Position from bottom (12% = near lane labels like IIDX)
  showTimingMarkers = true,
  keysounds,
  keysoundBaseUrl,
  measuresPerColumn = 4,
  columnGap = 20,
  positioning,
  timing,
  timingMarkerSettings: initialTimingMarkerSettings,
  noteScale = 1.0,
  laneWidthScale = 1.0,
  initialScrollBeat,
  scrollToBeat,
  unchangedOpacity,
}: NoteChartViewerProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);
  // audioRef, keysoundPlayerRef are returned from hooks (useBgmAudio / useKeysoundLifecycle)
  // animationRef, playbackBeatRef, lastPlayedBeatRef, playedNotesRef are returned from useViewerPlayback
  const notesRef = useRef(notes);
  // Performance optimization: notes array sorted by beat (for binary search)
  const sortedNotesRef = useRef<BMSNote[]>([]);
  const keysoundEnabledRef = useRef(showKeysounds);
  const keysoundReadyRef = useRef(false);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const webglCleanupRef = useRef<(() => void) | null>(null); // Cleanup function for WebGL event listeners
  const [webglContextLost, setWebglContextLost] = useState(false);

  // Hit effects + keysound trigger → useKeysoundTrigger (Stage F)
  const lanesRef = useRef<LaneConfig[]>([]);
  const laneMapRef = useRef<Map<string, LaneConfig>>(new Map()); // Cached for animation loop
  const beatScaleRef = useRef(beatScale);
  const positioningRef = useRef(positioning);
  const timingRef = useRef(timing);

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  // Scroll/drag/zoom/momentum/touch/wheel — delegated to useViewerScroll hook
  // maxBeat/effectiveBeatScale/scrollSpeed are computed with useMemo below,
  // but auto-sync after initial render via the hook's internal ref pattern (initial values are placeholders)
  const {
    scrollBeat,
    setScrollBeat,
    zoomLevel,
    setZoomLevel,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    scrollConfigRef,
  } = useViewerScroll({
    containerRef,
    viewMode,
    initialScrollBeat,
    scrollToBeat,
  });

  // isPlaying/playbackBeat/animationRef/playbackBeatRef/lastPlayedBeatRef/playedNotesRef
  // are returned from useViewerPlayback hook (called after keysound below)
  // BGM/Fullscreen state is handled by hook calls after maxBeat declaration (see below)

  // BMS display settings — delegated to useViewerSettings hook
  const {
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
  } = useViewerSettings({
    initialNoteTypeFilter: noteTypeFilter,
    initialMeasuresPerColumn: measuresPerColumn,
    initialTimingMarkerSettings,
  });

  // Audio settings — delegated to useViewerAudioSettings hook
  const {
    keysoundEnabled, setKeysoundEnabled,
    keysoundVolume, setKeysoundVolume,
    keysoundMuted, setKeysoundMuted,
    audioDialogOpen, setAudioDialogOpen,
    localEqualizer, setLocalEqualizer,
    localEffector, setLocalEffector,
    pipelineLatency, setPipelineLatency,
    schedulingOverhead, setSchedulingOverhead,
  } = useViewerAudioSettings({ initialKeysoundEnabled: showKeysounds });

  // Keysound lifecycle — delegated to useKeysoundLifecycle hook
  const {
    keysoundPlayerRef,
    keysoundLoading,
    keysoundReady,
    keysoundProgress,
  } = useKeysoundLifecycle({
    keysounds,
    keysoundBaseUrl,
    notes,
    keysoundVolume,
    keysoundMuted,
    playbackSpeed,
    localEqualizer,
    localEffector,
  });

  // Keep refs in sync with values for use in animation loop
  useEffect(() => {
    notesRef.current = notes;
    // Performance optimization: sort notes by beat (for binary search)
    sortedNotesRef.current = [...notes].sort((a, b) => a.beat - b.beat);
  }, [notes]);
  useEffect(() => { keysoundEnabledRef.current = keysoundEnabled; }, [keysoundEnabled]);
  useEffect(() => { keysoundReadyRef.current = keysoundReady; }, [keysoundReady]);
  // isPlayingRef is managed inside useViewerPlayback hook — not needed here

  // Fullscreen: isFullscreen + toggleFullscreen are provided by useFullscreen hook (declared above)

  // Cleanup WebGL event listeners on unmount
  useEffect(() => {
    return () => {
      if (webglCleanupRef.current) {
        webglCleanupRef.current();
        webglCleanupRef.current = null;
      }
    };
  }, []);

  // Stable callback for setting up WebGL context event listeners (no state updates)
  const setupWebglEventListeners = useCallback((gl: THREE.WebGLRenderer) => {
    // Clean up previous listeners if any
    if (webglCleanupRef.current) {
      webglCleanupRef.current();
      webglCleanupRef.current = null;
    }

    const canvas = gl.domElement;
    if (!canvas) return;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('[NoteChartViewer] WebGL context lost');
      setWebglContextLost(true);
      // setIsPlaying(false) is a no-op when already false, so safe to call unconditionally
      setIsPlaying(false);
    };

    const handleContextRestored = () => {
      console.log('[NoteChartViewer] WebGL context restored');
      setWebglContextLost(false);
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    // Store cleanup function
    webglCleanupRef.current = () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, []);

  // Stable onCreated callback for Canvas - must be memoized to prevent Canvas recreation
  const handleCanvasCreated = useCallback((state: { gl: THREE.WebGLRenderer }) => {
    try {
      if (!state.gl || !state.gl.domElement) {
        console.warn('[NoteChartViewer] onCreated called with invalid gl or missing domElement');
        return;
      }
      glRef.current = state.gl;
      setupWebglEventListeners(state.gl);
    } catch (error: unknown) {
      console.error('[NoteChartViewer] Error in onCreated:', error);
    }
  }, [setupWebglEventListeners]);

  // ── useKeysoundTrigger (Stage F) ──────────────────────────────────────────
  // Owns hitNotesRef, hitNotesVersion, playedNotesRef, and the two trigger fns.
  // playedNotesRef is forwarded into useViewerPlayback so seek/reset works.
  const {
    hitNotesRef,
    hitNotesVersion,
    playedNotesRef,
    playActiveKeysoundsAtBeat,
    triggerKeysoundsInRange,
  } = useKeysoundTrigger({
    notesRef,
    sortedNotesRef,
    keysoundEnabledRef,
    keysoundReadyRef,
    keysoundPlayerRef,
    lanesRef,
    laneMapRef,
    beatScaleRef,
    positioningRef,
  });

  const baseLanes = useMemo(() => generateLaneConfig(keyMode, 1), [keyMode]);
  const unscaledLanes = useMemo(() => applyLaneOption(baseLanes, laneOption, randomSeed), [baseLanes, laneOption, randomSeed]);
  // baseChartWidth calculated from unscaled lanes
  const baseChartWidth = useMemo(() => unscaledLanes.reduce((sum, lane) => sum + lane.width, 0), [unscaledLanes]);
  // Derive widthScale from chartWidthOverride (px) - if null, use 1.0 (no scaling)
  // Also apply laneWidthScale prop
  const widthScale = useMemo(() => {
    const baseScale = chartWidthOverride !== null && baseChartWidth > 0
      ? chartWidthOverride / baseChartWidth
      : 1;
    return baseScale * laneWidthScale;
  }, [chartWidthOverride, baseChartWidth, laneWidthScale]);
  // Scale lanes for rendering (widthScale affects lane widths and positions)
  const lanes = useMemo(() => unscaledLanes.map(lane => ({
    ...lane,
    width: lane.width * widthScale,
    x: lane.x * widthScale,
  })), [unscaledLanes, widthScale]);

  const maxBeat = useMemo(() => {
    if (totalBeats) return totalBeats;
    if (notes.length === 0) return 100;
    let max = 0;
    for (const note of notes) {
      const endBeat = note.endBeat ?? note.beat;
      if (endBeat > max) max = endBeat;
    }
    return Math.ceil(max) + 4;
  }, [notes, totalBeats]);

  // chartWidth: if override is set, use it directly; otherwise use scaled baseChartWidth
  const chartWidth = useMemo(() =>
    chartWidthOverride !== null ? chartWidthOverride : baseChartWidth * widthScale,
    [chartWidthOverride, baseChartWidth, widthScale]
  );
  const effectiveBeatScale = useMemo(() => beatScale * zoomLevel * hiSpeed, [beatScale, zoomLevel, hiSpeed]);

  // Sync scrollConfigRef so useViewerScroll native handlers always see fresh values
  scrollConfigRef.current = { maxBeat, effectiveBeatScale, scrollSpeed };

  // Sync refs after variables are declared (for use in animation loop)
  useEffect(() => {
    lanesRef.current = lanes;
    laneMapRef.current = new Map(lanes.map(l => [l.id, l])); // Cache laneMap for animation loop
  }, [lanes]);
  useEffect(() => { beatScaleRef.current = effectiveBeatScale; }, [effectiveBeatScale]);
  useEffect(() => { positioningRef.current = positioning; }, [positioning]);
  useEffect(() => { timingRef.current = timing; }, [timing]);

  const totalHeight = useMemo(() => maxBeat * effectiveBeatScale, [maxBeat, effectiveBeatScale]);
  // progressPercent is moved after useViewerPlayback (playbackBeat)
  // effectiveHeight: use chartHeightOverride if set, otherwise use props height
  const effectiveHeight = useMemo(() => chartHeightOverride ?? height, [chartHeightOverride, height]);

  // Aspect ratio lock handler: when width changes, adjust height proportionally
  const handleChartWidthChange = useCallback((newWidth: number) => {
    const currentWidth = chartWidthOverride ?? baseChartWidth;
    const currentHeight = chartHeightOverride ?? height;
    setChartWidthOverride(newWidth === baseChartWidth ? null : newWidth);
    if (aspectRatioLocked && currentWidth > 0) {
      const ratio = currentHeight / currentWidth;
      const newHeight = Math.round(newWidth * ratio / 10) * 10; // snap to 10-unit steps
      setChartHeightOverride(Math.max(200, Math.min(1200, newHeight)));
    }
  }, [chartWidthOverride, chartHeightOverride, baseChartWidth, height, aspectRatioLocked]);

  // Aspect ratio lock handler: when height changes, adjust width proportionally
  const handleChartHeightChange = useCallback((newHeight: number) => {
    const currentWidth = chartWidthOverride ?? baseChartWidth;
    const currentHeight = chartHeightOverride ?? height;
    setChartHeightOverride(newHeight === height ? null : newHeight);
    if (aspectRatioLocked && currentHeight > 0) {
      const ratio = currentWidth / currentHeight;
      const newWidth = Math.round(newHeight * ratio / 10) * 10; // snap to 10-unit steps
      setChartWidthOverride(Math.max(100, Math.min(800, newWidth)) === baseChartWidth ? null : Math.max(100, Math.min(800, newWidth)));
    }
  }, [chartWidthOverride, chartHeightOverride, baseChartWidth, height, aspectRatioLocked]);

  // Memoize viewportHeight to prevent camera config recalculation
  const viewportHeight = useMemo(() => effectiveHeight, [effectiveHeight]);
  // Camera offset to place judgment line at judgmentLinePosition from bottom
  // screenY = (worldY - cameraY + viewportHeight/2) / viewportHeight
  // For judgment line at judgmentLinePosition: cameraOffset = (0.5 - judgmentLinePosition) * viewportHeight
  const cameraOffset = (0.5 - judgmentLinePosition) * viewportHeight;

  // calculateTimeAtBeat / totalDuration / currentTime / formatTime / progressPercent / currentBpm
  // are moved after useViewerPlayback (declared after the hook call below)

  // Columns view calculations
  const totalMeasures = useMemo(() => Math.ceil(maxBeat / 4), [maxBeat]);
  const columnBeatScale = beatScale * hiSpeed; // zoomLevel is not applied in columns view

  // Calculations based on columnsLayout
  const effectiveMeasuresPerColumn = columnsLayout === 'vertical' ? totalMeasures : localMeasuresPerColumn;
  const numColumns = columnsLayout === 'vertical' ? 1 : Math.ceil(totalMeasures / localMeasuresPerColumn);
  const singleColumnHeight = effectiveMeasuresPerColumn * 4 * columnBeatScale;

  // Store BGM ended callback in a ref — useBgmAudio must be called before useViewerPlayback,
  // so the actual handler is injected into the ref after useViewerPlayback below
  const onBgmEndedRef = useRef<() => void>(() => {});

  // BGM audio — useBgmAudio hook (must be placed after maxBeat)
  const {
    audioRef,
    audioLoaded,
    audioLoading,
    audioError,
    audioProgress,
    keysoundOnlyMode,
  } = useBgmAudio(audioUrl, maxBeat, () => onBgmEndedRef.current());

  // Fullscreen — useFullscreen hook
  const { isFullscreen, toggleFullscreen: _toggleFullscreen } = useFullscreen();
  const toggleFullscreen = useCallback(
    () => _toggleFullscreen(outerContainerRef as React.RefObject<HTMLElement>),
    [_toggleFullscreen],
  );

  // Keysound state debugging (temporary)
  useEffect(() => {
    if (keysoundReady && keysoundPlayerRef.current) {
      console.log('[NoteChartViewer] Keysound ready. Sample note keysounds:',
        notes.slice(0, 10).map(n => n.keysound).filter(Boolean));
      console.log('[NoteChartViewer] Keysounds prop keys:',
        keysounds ? Object.keys(keysounds).slice(0, 10) : 'none');
    }
  }, [keysoundReady, notes, keysounds]);

  // Playback engine — delegated to useViewerPlayback hook
  // (includes animation loop, togglePlayback, calculateTimeAtBeat, playback state/refs)
  // playedNotesRef is owned by useKeysoundTrigger → injected here
  const {
    isPlaying, setIsPlaying,
    playbackBeat, setPlaybackBeat,
    animationRef,
    playbackBeatRef,
    lastPlayedBeatRef,
    togglePlayback,
    calculateTimeAtBeat,
  } = useViewerPlayback({
    viewMode,
    bpm,
    bpmChanges,
    maxBeat,
    audioLoaded,
    keysoundReady,
    playbackSpeed,
    audioRef,
    keysoundPlayerRef,
    timingRef,
    keysoundEnabledRef,
    keysoundReadyRef,
    setScrollBeat,
    setPipelineLatency,
    setSchedulingOverhead,
    triggerKeysoundsInRange,
    playActiveKeysoundsAtBeat,
    playedNotesRef,
  });

  // Inject BGM ended handler into ref after useViewerPlayback
  // (useBgmAudio must be called first above to provide audioRef)
  onBgmEndedRef.current = () => {
    if (keysoundReadyRef.current) return;
    setIsPlaying(false);
    playbackBeatRef.current = maxBeat;
    setPlaybackBeat(maxBeat);
  };

  // Time display calculations (placed after useViewerPlayback)
  const totalDuration = useMemo(() => calculateTimeAtBeat(maxBeat), [calculateTimeAtBeat, maxBeat]);
  const currentTime = useMemo(() => calculateTimeAtBeat(playbackBeat), [calculateTimeAtBeat, playbackBeat]);
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Current playback position BPM (for status bar display)
  const currentBpm = useMemo(() => {
    if (!bpmChanges || bpmChanges.length === 0) return bpm;
    let cur = bpm;
    for (const c of bpmChanges) {
      if (c.beat <= playbackBeat) cur = c.bpm; else break;
    }
    return cur;
  }, [bpm, bpmChanges, playbackBeat]);

  // Progress percentage (for progress bar)
  const progressPercent = viewMode === 'playback' ? (playbackBeat / maxBeat) * 100 : (scrollBeat / maxBeat) * 100;

  // Sync position when viewMode changes (do not reset)
  useEffect(() => {
    // Stop playback if playing
    setIsPlaying(false);
    // Sync current position to the other mode
    if (viewMode === 'playback') {
      // scroll → playback: sync scrollBeat into playbackBeat
      playbackBeatRef.current = scrollBeat;
      setPlaybackBeat(scrollBeat);
    } else if (viewMode === 'scroll') {
      // playback → scroll: sync playbackBeat into scrollBeat
      setScrollBeat(playbackBeatRef.current);
    }
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll/momentum/touch/wheel/keyboard handlers are provided by useViewerScroll + useViewerKeyboard hooks.
  // scrollConfigRef is updated every render with maxBeat/effectiveBeatScale/scrollSpeed (line ~489 above).

  // Keyboard shortcuts — delegated to useViewerKeyboard hook
  const [isFocused, setIsFocused] = useState(false);

  useViewerKeyboard({
    isFocused,
    viewMode,
    maxBeat,
    isPlaying,
    scrollBeat,
    playbackBeat,
    playbackBeatRef,
    setScrollBeat,
    setPlaybackBeat,
    setZoomLevel,
    togglePlayback,
  });

  // Seek handler for progress bar
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetBeat = percent * maxBeat;

    // Sync all state
    playbackBeatRef.current = targetBeat;
    setPlaybackBeat(targetBeat);
    setScrollBeat(targetBeat);

    // Sync audio position
    if (audioRef.current && audioLoaded) {
      audioRef.current.currentTime = targetBeat * 60 / bpm;
    }

    // Reset keysound state
    playedNotesRef.current.clear();
    lastPlayedBeatRef.current = targetBeat;

    // Only when playing: resume keysounds still active at the seek position with correct offset
    if (keysoundReady && keysoundPlayerRef.current) {
      keysoundPlayerRef.current.stopAll();
      if (isPlaying) {
        playActiveKeysoundsAtBeat(targetBeat, calculateTimeAtBeat);
      }
    }
  }, [maxBeat, audioLoaded, bpm, keysoundReady, playActiveKeysoundsAtBeat, calculateTimeAtBeat, isPlaying]);

  // Minimap click handler — navigate to position and sync keysounds
  const handleMinimapClick = useCallback((beat: number) => {
    const targetBeat = Math.max(0, Math.min(maxBeat, beat));

    // Pause if currently playing
    const wasPlaying = isPlaying;
    if (wasPlaying) {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
      if (keysoundPlayerRef.current) keysoundPlayerRef.current.stopAll();
    }

    // Sync all state
    playbackBeatRef.current = targetBeat;
    setPlaybackBeat(targetBeat);
    setScrollBeat(targetBeat);

    // Sync audio position
    if (audioRef.current && audioLoaded) {
      audioRef.current.currentTime = targetBeat * 60 / bpm;
    }

    // Reset keysound played notes and start from new position
    playedNotesRef.current.clear();
    lastPlayedBeatRef.current = targetBeat;

    // If was playing: resume keysounds still active at seek position with correct offset, then resume playback
    if (wasPlaying) {
      if (keysoundReady && keysoundPlayerRef.current) {
        playActiveKeysoundsAtBeat(targetBeat, calculateTimeAtBeat);
      }
      setTimeout(() => setIsPlaying(true), 50);
    }
  }, [maxBeat, isPlaying, audioLoaded, bpm, keysoundReady, playActiveKeysoundsAtBeat, calculateTimeAtBeat]);

  // Calculate number of beats visible in viewport (for minimap)
  const viewportBeats = useMemo(() => {
    return height / effectiveBeatScale;
  }, [height, effectiveBeatScale]);

  const noteStats = useMemo(() => {
    let playable = 0, invisible = 0, landmine = 0, bgm = 0, longNotes = 0, scratch = 0;
    for (const note of notes) {
      const type = note.noteType || 'playable';
      if (type === 'playable') { playable++; if (note.column === 'SC' || note.column === 'SC2') scratch++; }
      else if (type === 'invisible') invisible++;
      else if (type === 'landmine') landmine++;
      else if (type === 'bgm') bgm++;
      if (note.endBeat !== undefined) longNotes++;
    }
    return { total: playable, playable, invisible, landmine, bgm, longNotes, scratch };
  }, [notes]);

  // Memoize camera config for main Canvas (scroll/playback modes)
  // Note: position is set to [0, 0, 100] as CameraController handles actual position via useFrame
  // This prevents R3F from recreating internal structures when scrollBeat changes
  // Left margin for BPM text
  const LEFT_MARGIN_FOR_TEXT = 90;
  const mainCameraConfig = useMemo(() => ({
    position: [0, 0, 100] as [number, number, number],
    left: -chartWidth / 2 - LEFT_MARGIN_FOR_TEXT,
    right: chartWidth / 2,
    top: viewportHeight / 2,
    bottom: -viewportHeight / 2,
    near: 0.1,
    far: 1000,
  }), [chartWidth, viewportHeight]);

  // Shared columns view dimensions (used by both camera and canvas style)
  // Limit canvas size to prevent browser rendering issues (most browsers limit to ~16384px)
  const MAX_CANVAS_SIZE = 8192;
  const columnsViewDimensions = useMemo(() => {
    const columnWidth = chartWidth + columnGap;
    const totalColumnsWidth = columnsLayout === 'vertical'
      ? chartWidth
      : (numColumns - 1) * columnWidth + chartWidth;

    const marginX = 50;
    const marginY = 30;

    const rawWidth = totalColumnsWidth + marginX * 2;
    const rawHeight = singleColumnHeight + marginY * 2;

    if (columnsLayout === 'vertical') {
      // Vertical mode: fixed viewport with camera-based scrolling
      // Canvas shows a fixed-height viewport, camera scrolls through content
      const viewportHeight = Math.min(staticMaxHeight, rawHeight);
      return {
        totalColumnsWidth,
        marginX,
        marginY,
        scale: 1, // No scaling for vertical mode
        canvasWidth: Math.round(rawWidth),
        canvasHeight: Math.round(viewportHeight),
        isScrollable: rawHeight > viewportHeight,
        contentHeight: rawHeight,
        viewportHeight,
      };
    }

    // Horizontal mode: scale uniformly to fit both dimensions
    const scale = Math.min(1, MAX_CANVAS_SIZE / Math.max(rawWidth, rawHeight));

    return {
      totalColumnsWidth,
      marginX,
      marginY,
      scale,
      canvasWidth: Math.round(rawWidth * scale),
      canvasHeight: Math.round(rawHeight * scale),
      isScrollable: false,
      contentHeight: rawHeight * scale,
      viewportHeight: rawHeight * scale,
    };
  }, [chartWidth, singleColumnHeight, columnsLayout, columnGap, numColumns, staticMaxHeight]);

  // Memoize camera config for columns view Canvas
  // Content is wrapped in a scale group, so world coords are scaled
  // Camera must be positioned at the center of the scaled content
  const columnsCameraConfig = useMemo(() => {
    const { totalColumnsWidth, marginX, marginY, scale, viewportHeight, contentHeight, isScrollable } = columnsViewDimensions;

    if (columnsLayout === 'vertical') {
      // Vertical mode: viewport-sized frustum with scroll-based camera position
      const viewWidth = chartWidth + marginX * 2;
      const viewHeight = viewportHeight;

      // Camera X is fixed at center, Y moves based on scroll
      const centerX = 0;
      // scrollY ranges from 0 to (contentHeight - viewportHeight)
      // Camera Y should show content from bottom (scrollY=0) to top (scrollY=max)
      const maxScrollY = Math.max(0, contentHeight - viewportHeight);
      const clampedScrollY = Math.min(Math.max(0, verticalScrollY), maxScrollY);
      const centerY = viewHeight / 2 + clampedScrollY;

      return {
        position: [centerX, centerY, 100] as [number, number, number],
        left: -viewWidth / 2,
        right: viewWidth / 2,
        top: viewHeight / 2,
        bottom: -viewHeight / 2,
        near: 0.1,
        far: 1000,
        centerX,
        centerY,
        isScrollable,
        maxScrollY,
      };
    }

    // Horizontal mode: show all content scaled
    const contentWidth = totalColumnsWidth;
    const scaledContentHeight = singleColumnHeight * scale;

    const viewWidth = contentWidth * scale + marginX * 2;
    const viewHeight = scaledContentHeight + marginY * 2;

    const centerX = ((totalColumnsWidth - chartWidth) / 2) * scale;
    const centerY = scaledContentHeight / 2;

    return {
      position: [centerX, centerY, 100] as [number, number, number],
      left: -viewWidth / 2,
      right: viewWidth / 2,
      top: viewHeight / 2,
      bottom: -viewHeight / 2,
      near: 0.1,
      far: 1000,
      centerX,
      centerY,
      isScrollable: false,
      maxScrollY: 0,
    };
  }, [columnsViewDimensions, chartWidth, singleColumnHeight, columnsLayout, verticalScrollY]);

  // Memoize GL config to prevent Canvas recreation
  const glConfig = useMemo(() => ({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance' as const,
  }), []);

  // DPR for sharp rendering on high-DPI displays (capped at 2 for performance)
  const canvasDpr = useMemo(() => Math.min(window.devicePixelRatio || 1, 2), []);

  // Create stable style objects that don't change based on viewMode (scroll vs playback)
  // This prevents R3F Canvas recreation when switching between scroll/playback modes
  // Canvas width includes the BPM text margin area
  const canvasWidth = chartWidth + LEFT_MARGIN_FOR_TEXT;
  const mainCanvasStyle = useMemo(() => ({
    background: '#1a1a2e',
    width: '100%' as const,
    minWidth: canvasWidth,
    height: '100%' as const,
  }), [canvasWidth]);

  // Memoize columns Canvas style to prevent recreation
  // Uses shared dimensions from columnsViewDimensions
  const columnsCanvasStyle = useMemo(() => ({
    background: '#1a1a2e',
    width: columnsViewDimensions.canvasWidth,
    height: columnsViewDimensions.canvasHeight,
  }), [columnsViewDimensions]);

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border bg-card p-4', className)}>
        <div className="flex items-center justify-center h-[400px]">
          <div className="animate-pulse text-muted-foreground">Loading chart...</div>
        </div>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className={cn('rounded-xl border bg-card p-4', className)}>
        <div className="flex items-center justify-center h-[200px] text-muted-foreground">No notes to display</div>
      </div>
    );
  }

  return (
    <div
      ref={outerContainerRef}
      className={cn(
        'rounded-xl border bg-card overflow-hidden flex flex-col h-full',
        isFullscreen && 'fixed inset-0 z-50 rounded-none border-none',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Note Chart</span>
          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">{KEY_MODE_DISPLAY[keyMode]}</span>
          {diffMode && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500">Diff</span>}
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-500">WebGL</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Total: <strong className="text-foreground">{noteStats.playable}</strong></span>
          {noteStats.scratch > 0 && <span>SC: <strong className="text-foreground">{noteStats.scratch}</strong></span>}
          {noteStats.longNotes > 0 && <span>LN: <strong className="text-foreground">{noteStats.longNotes}</strong></span>}
          {noteStats.invisible > 0 && <span className="text-purple-400">Ghost: <strong>{noteStats.invisible}</strong></span>}
          {noteStats.landmine > 0 && <span className="text-red-400">Mine: <strong>{noteStats.landmine}</strong></span>}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => setViewMode('playback')} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", viewMode === 'playback' ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}>
            {viewMode === 'playback' && isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Playback
          </button>
          <button onClick={() => setViewMode('scroll')} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", viewMode === 'scroll' ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}>
            <GripVertical className="h-3.5 w-3.5" /> Scroll
          </button>
          <button onClick={toggleFullscreen} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", isFullscreen ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}>
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />} Full
          </button>
          <button onClick={() => setViewMode('columns')} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", viewMode === 'columns' ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}>
            <LayoutGrid className="h-3.5 w-3.5" /> Columns
          </button>
        </div>

        <div className="flex items-center gap-1 border-l pl-2 ml-2">
          <button onClick={() => setZoomLevel(prev => Math.max(0.25, prev * 0.8))} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><ZoomOut className="h-3.5 w-3.5" /></button>
          <span className="text-xs text-muted-foreground min-w-[40px] text-center">{Math.round(zoomLevel * 100)}%</span>
          <button onClick={() => setZoomLevel(prev => Math.min(4, prev * 1.25))} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><ZoomIn className="h-3.5 w-3.5" /></button>
          <button onClick={() => setZoomLevel(1)} className={cn("p-1.5 rounded-md", zoomLevel === 1 ? "text-muted-foreground/50" : "hover:bg-muted text-muted-foreground")} disabled={zoomLevel === 1}><RotateCcw className="h-3.5 w-3.5" /></button>
        </div>

        <div className="flex items-center gap-1 border-l pl-2 ml-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors", showSettings ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>

        {viewMode === 'playback' && (
          <div className="flex items-center gap-2">
            <button onClick={() => { playbackBeatRef.current = 0; setPlaybackBeat(0); setScrollBeat(0); playedNotesRef.current.clear(); lastPlayedBeatRef.current = -1; if (audioRef.current) audioRef.current.currentTime = 0; }} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><SkipBack className="h-3.5 w-3.5" /></button>
            <button onClick={togglePlayback} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white">
              {isPlaying ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Play</>}
            </button>
            <button onClick={() => { playbackBeatRef.current = maxBeat; setPlaybackBeat(maxBeat); setScrollBeat(maxBeat); if (audioRef.current) audioRef.current.currentTime = maxBeat * 60 / bpm; }} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><SkipForward className="h-3.5 w-3.5" /></button>
            {/* Time and measure display */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-mono text-orange-400">{formatTime(currentTime)}</span>
              <span className="text-muted-foreground">/</span>
              <span className="font-mono text-muted-foreground">{formatTime(totalDuration)}</span>
              <span className="text-muted-foreground ml-1">|</span>
              <span className="text-muted-foreground ml-1">{t('noteChart.measureProgress', { current: Math.floor(playbackBeat / 4) + 1, total: Math.floor(maxBeat / 4) })}</span>
            </div>
            {audioUrl && (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs px-2 py-1 rounded",
                  audioLoading ? "bg-yellow-500/20 text-yellow-400" :
                    audioLoaded ? "bg-green-500/20 text-green-500" :
                      keysoundOnlyMode ? "bg-blue-500/20 text-blue-400" : // keysound-only mode shows blue (normal state)
                        audioError ? "bg-red-500/20 text-red-400" :
                          "bg-muted/50 text-muted-foreground"
                )}
                title={
                  audioLoading ? (audioProgress.total > 0 ? `Loading audio... ${Math.round((audioProgress.loaded / audioProgress.total) * 100)}%` : "Loading audio...") :
                    audioLoaded ? "Audio ready" :
                      keysoundOnlyMode ? "Complex BMS - using keysounds only" :
                        audioError || "Audio not loaded"
                }
              >
                {audioLoading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />{audioProgress.total > 0 && `${Math.round((audioProgress.loaded / audioProgress.total) * 100)}%`}</>
                ) : audioLoaded ? (
                  <><Volume2 className="h-3.5 w-3.5" /></>
                ) : keysoundOnlyMode ? (
                  <><Music className="h-3.5 w-3.5" /></>
                ) : (
                  <><VolumeX className="h-3.5 w-3.5" /></>
                )}
              </span>
            )}
            {/* Keysound Status */}
            {keysounds && Object.keys(keysounds).length > 0 && (
              <button
                onClick={() => setKeysoundEnabled(!keysoundEnabled)}
                className={cn(
                  "flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors",
                  keysoundLoading ? "bg-yellow-500/20 text-yellow-400" :
                    keysoundReady && keysoundEnabled ? "bg-green-500/20 text-green-400" :
                      "bg-muted/50 text-muted-foreground"
                )}
                title={keysoundLoading ? `Loading keysounds (${keysoundProgress.loaded}/${keysoundProgress.total})` : keysoundEnabled ? "Keysounds ON" : "Keysounds OFF"}
              >
                {keysoundLoading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />{Math.round((keysoundProgress.loaded / keysoundProgress.total) * 100)}%</>
                ) : keysoundEnabled ? (
                  <><Volume2 className="h-3.5 w-3.5" />KS</>
                ) : (
                  <><VolumeX className="h-3.5 w-3.5" />KS</>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-3 py-2 border-b bg-muted/20 space-y-3">
          {/* Note Type Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.display')}</span>
            <button
              onClick={() => setLocalNoteFilter(f => ({ ...f, playable: !f.playable }))}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", localNoteFilter.playable ? "bg-blue-500/20 text-blue-400" : "bg-muted/50 text-muted-foreground")}
            >
              <Eye className="h-3 w-3" /> Normal
            </button>
            <button
              onClick={() => setLocalNoteFilter(f => ({ ...f, invisible: !f.invisible }))}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", localNoteFilter.invisible ? "bg-purple-500/20 text-purple-400" : "bg-muted/50 text-muted-foreground")}
            >
              <Ghost className="h-3 w-3" /> Ghost
            </button>
            <button
              onClick={() => setLocalNoteFilter(f => ({ ...f, landmine: !f.landmine }))}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", localNoteFilter.landmine ? "bg-red-500/20 text-red-400" : "bg-muted/50 text-muted-foreground")}
            >
              <Bomb className="h-3 w-3" /> Mine
            </button>
            <button
              onClick={() => setLocalNoteFilter(f => ({ ...f, bgm: !f.bgm }))}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", localNoteFilter.bgm ? "bg-gray-500/20 text-gray-400" : "bg-muted/50 text-muted-foreground")}
            >
              <Music className="h-3 w-3" /> BGM
            </button>
          </div>

          {/* Lane Options */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.lane')}</span>
            {(['normal', 'mirror', 'random'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setLaneOption(opt)}
                className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors capitalize", laneOption === opt ? "bg-green-500/20 text-green-400" : "bg-muted/50 text-muted-foreground")}
              >
                {opt === 'mirror' && <FlipHorizontal className="h-3 w-3" />}
                {opt}
              </button>
            ))}
          </div>

          {/* Hi-Speed */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-16">Hi-Speed:</span>
            <NumberInputWithPresets
              value={hiSpeed}
              onChange={setHiSpeed}
              presets={[1, 1.5, 2, 3, 4, 5, 6] as const}
              min={0.1}
              max={10}
              step={0.1}
              prefix="×"
              activeColor="bg-cyan-500/20 text-cyan-400"
            />
          </div>

          {/* Width (px) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.width')}</span>
            <NumberInputWithPresets
              value={chartWidthOverride ?? baseChartWidth}
              onChange={handleChartWidthChange}
              presets={[200, 250, 300, 350, 400] as const}
              min={100}
              max={800}
              step={10}
              suffix="px"
              allowDecimal={false}
              activeColor="bg-orange-500/20 text-orange-400"
            />
            {chartWidthOverride !== null && (
              <button
                onClick={() => { setChartWidthOverride(null); if (aspectRatioLocked) setChartHeightOverride(null); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                title={t('viewer.timing.resetToDefault')}
              >
                {t('noteChart.settings.resetLabel')}
              </button>
            )}
            {/* Aspect ratio lock toggle */}
            <button
              onClick={() => setAspectRatioLocked(!aspectRatioLocked)}
              className={cn(
                "flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors",
                aspectRatioLocked ? "bg-blue-500/20 text-blue-400" : "bg-muted/50 text-muted-foreground"
              )}
              title={aspectRatioLocked ? t('viewer.aspect.unlockTooltip') : t('viewer.aspect.lockTooltip')}
            >
              {aspectRatioLocked ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
            </button>
          </div>

          {/* Height (px) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.height')}</span>
            <NumberInputWithPresets
              value={chartHeightOverride ?? height}
              onChange={handleChartHeightChange}
              presets={[300, 400, 500, 600, 700] as const}
              min={200}
              max={1200}
              step={10}
              suffix="px"
              allowDecimal={false}
              activeColor="bg-violet-500/20 text-violet-400"
            />
            {chartHeightOverride !== null && (
              <button
                onClick={() => { setChartHeightOverride(null); if (aspectRatioLocked) setChartWidthOverride(null); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                title={t('viewer.timing.resetToDefault')}
              >
                {t('noteChart.settings.resetLabel')}
              </button>
            )}
          </div>

          {/* Measures per Column (columns view only) */}
          {viewMode === 'columns' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.measuresPerColumn')}</span>
            <NumberInputWithPresets
              value={localMeasuresPerColumn}
              onChange={setLocalMeasuresPerColumn}
              presets={[2, 4, 8, 16] as const}
              min={1}
              max={64}
              step={1}
              allowDecimal={false}
              activeColor="bg-indigo-500/20 text-indigo-400"
            />
          </div>
          )}

          {/* Columns Layout (columns view only) */}
          {viewMode === 'columns' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.layout')}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setColumnsLayout('horizontal'); setVerticalScrollY(0); }}
                className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", columnsLayout === 'horizontal' ? "bg-indigo-500/20 text-indigo-400" : "bg-muted/50 text-muted-foreground")}
              >
                <LayoutGrid className="h-3 w-3" /> {t('noteChart.layout.horizontalColumns')}
              </button>
              <button
                onClick={() => { setColumnsLayout('vertical'); setVerticalScrollY(0); }}
                className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", columnsLayout === 'vertical' ? "bg-indigo-500/20 text-indigo-400" : "bg-muted/50 text-muted-foreground")}
              >
                <Rows3 className="h-3 w-3" /> {t('noteChart.layout.verticalSingle')}
              </button>
            </div>
          </div>
          )}

          {/* Grid Division (grid spacing) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.grid')}</span>
            <NumberInputWithPresets
              value={gridDivision}
              onChange={setGridDivision}
              presets={GRID_DIVISIONS}
              min={1}
              max={192}
              step={1}
              prefix="1/"
              allowDecimal={false}
              activeColor="bg-teal-500/20 text-teal-400"
            />
            <span className="text-xs text-muted-foreground ml-2">{t('noteChart.settings.lanePerBeatHint')}</span>
          </div>

          {/* Scroll Speed - scroll view only */}
          {viewMode === 'scroll' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.scroll')}</span>
              <NumberInputWithPresets
                value={scrollSpeed}
                onChange={setScrollSpeed}
                presets={SCROLL_SPEEDS}
                min={0.1}
                max={32}
                step={0.5}
                suffix="x"
                activeColor="bg-amber-500/20 text-amber-400"
              />
              <span className="text-xs text-muted-foreground ml-2">{t('noteChart.settings.dragSensitivityHint')}</span>
            </div>
          )}

          {/* Minimap Toggle - scroll/playback view only */}
          {(viewMode === 'scroll' || viewMode === 'playback') && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.minimap')}</span>
              <button
                onClick={() => setShowMinimap(!showMinimap)}
                className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", showMinimap ? "bg-green-500/20 text-green-400" : "bg-muted/50 text-muted-foreground")}
              >
                <MapIcon className="h-3 w-3" />
                {showMinimap ? "ON" : "OFF"}
              </button>
              <span className="text-xs text-muted-foreground ml-2">{t('noteChart.settings.clickToSeekHint')}</span>
            </div>
          )}

          {/* Scroll width scaling - scroll/playback view only */}
          {(viewMode === 'scroll' || viewMode === 'playback') && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.widthChange')}</span>
              <button
                onClick={() => setScaleWidthByScroll(!scaleWidthByScroll)}
                className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", scaleWidthByScroll ? "bg-purple-500/20 text-purple-400" : "bg-muted/50 text-muted-foreground")}
              >
                <ZoomIn className="h-3 w-3" />
                {scaleWidthByScroll ? "ON" : "OFF"}
              </button>
              <span className="text-xs text-muted-foreground ml-2">{t('noteChart.settings.noteWidthHint')}</span>
            </div>
          )}

          {/* Playback Speed - playback mode only */}
          {viewMode === 'playback' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.speed')}</span>
              <NumberInputWithPresets
                value={playbackSpeed}
                onChange={(speed) => {
                  setPlaybackSpeed(speed);
                  if (audioRef.current) audioRef.current.playbackRate = speed;
                }}
                presets={PLAYBACK_SPEEDS}
                min={0.1}
                max={4}
                step={0.05}
                suffix="x"
                activeColor="bg-orange-500/20 text-orange-400"
              />
            </div>
          )}

          {/* Keysound Volume & Audio Settings - playback mode only */}
          {viewMode === 'playback' && keysounds && Object.keys(keysounds).length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16">{t('viewer.settings.keysoundVolume')}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setKeysoundMuted(!keysoundMuted)}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title={keysoundMuted ? "Unmute" : "Mute"}
                >
                  {keysoundMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={keysoundVolume}
                  onChange={(e) => setKeysoundVolume(Number(e.target.value))}
                  className="w-20 h-1"
                  style={{ accentColor: '#3b82f6' }}
                />
              </div>
              <button
                onClick={() => setKeysoundEnabled(!keysoundEnabled)}
                className={cn("px-2 py-1 rounded text-xs transition-colors ml-2", keysoundEnabled ? "bg-green-500/20 text-green-400" : "bg-muted/50 text-muted-foreground")}
              >
                {keysoundEnabled ? "ON" : "OFF"}
              </button>
              {/* Audio Settings Button */}
              <button
                onClick={() => setAudioDialogOpen(!audioDialogOpen)}
                className="px-2 py-1 rounded text-xs bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                title="Audio Settings"
              >
                <Settings size={14} />
              </button>
            </div>
          )}

          {/* Timing marker settings (BPM/STOP/SCROLL) */}
          <div className="border-t border-muted/30 pt-3 mt-1">
            <div className="text-xs text-muted-foreground mb-2 font-medium">{t('viewer.settings.timingMarkerHeading')}</div>

            {/* BPM marker settings */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-xs text-muted-foreground w-16">BPM:</span>
              <button
                onClick={() => setTimingMarkerSettings(s => ({ ...s, bpm: { ...s.bpm, visible: !s.bpm.visible } }))}
                className={cn("px-2 py-1 rounded text-xs transition-colors", timingMarkerSettings.bpm.visible ? "bg-green-500/20 text-green-400" : "bg-muted/50 text-muted-foreground")}
              >
                {timingMarkerSettings.bpm.visible ? "ON" : "OFF"}
              </button>
              <input
                type="color"
                value={timingMarkerSettings.bpm.color}
                onChange={(e) => setTimingMarkerSettings(s => ({ ...s, bpm: { ...s.bpm, color: e.target.value } }))}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                title={t('viewer.timing.bpmColor')}
              />
              <NumberInputWithPresets
                value={timingMarkerSettings.bpm.fontSize}
                onChange={(v) => setTimingMarkerSettings(s => ({ ...s, bpm: { ...s.bpm, fontSize: v } }))}
                presets={[10, 12, 14, 16, 18, 20] as const}
                min={8}
                max={32}
                step={1}
                suffix="px"
                allowDecimal={false}
                activeColor="bg-emerald-500/20 text-emerald-400"
                inputWidth="w-12"
              />
              <input
                type="range"
                value={timingMarkerSettings.bpm.opacity * 100}
                onChange={(e) => setTimingMarkerSettings(s => ({ ...s, bpm: { ...s.bpm, opacity: Number(e.target.value) / 100 } }))}
                min={10}
                max={100}
                className="w-16 h-1 accent-emerald-500"
                title={t('viewer.timing.opacity', { percent: Math.round(timingMarkerSettings.bpm.opacity * 100) })}
              />
            </div>

            {/* STOP marker settings */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-xs text-muted-foreground w-16">STOP:</span>
              <button
                onClick={() => setTimingMarkerSettings(s => ({ ...s, stop: { ...s.stop, visible: !s.stop.visible } }))}
                className={cn("px-2 py-1 rounded text-xs transition-colors", timingMarkerSettings.stop.visible ? "bg-green-500/20 text-green-400" : "bg-muted/50 text-muted-foreground")}
              >
                {timingMarkerSettings.stop.visible ? "ON" : "OFF"}
              </button>
              <input
                type="color"
                value={timingMarkerSettings.stop.color}
                onChange={(e) => setTimingMarkerSettings(s => ({ ...s, stop: { ...s.stop, color: e.target.value } }))}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                title={t('viewer.timing.stopColor')}
              />
              <NumberInputWithPresets
                value={timingMarkerSettings.stop.fontSize}
                onChange={(v) => setTimingMarkerSettings(s => ({ ...s, stop: { ...s.stop, fontSize: v } }))}
                presets={[10, 12, 14, 16, 18, 20] as const}
                min={8}
                max={32}
                step={1}
                suffix="px"
                allowDecimal={false}
                activeColor="bg-red-500/20 text-red-400"
                inputWidth="w-12"
              />
              <input
                type="range"
                value={timingMarkerSettings.stop.opacity * 100}
                onChange={(e) => setTimingMarkerSettings(s => ({ ...s, stop: { ...s.stop, opacity: Number(e.target.value) / 100 } }))}
                min={10}
                max={100}
                className="w-16 h-1 accent-red-500"
                title={t('viewer.timing.opacity', { percent: Math.round(timingMarkerSettings.stop.opacity * 100) })}
              />
            </div>

            {/* SCROLL marker settings */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16">SCROLL:</span>
              <button
                onClick={() => setTimingMarkerSettings(s => ({ ...s, scroll: { ...s.scroll, visible: !s.scroll.visible } }))}
                className={cn("px-2 py-1 rounded text-xs transition-colors", timingMarkerSettings.scroll.visible ? "bg-green-500/20 text-green-400" : "bg-muted/50 text-muted-foreground")}
              >
                {timingMarkerSettings.scroll.visible ? "ON" : "OFF"}
              </button>
              <input
                type="color"
                value={timingMarkerSettings.scroll.color}
                onChange={(e) => setTimingMarkerSettings(s => ({ ...s, scroll: { ...s.scroll, color: e.target.value } }))}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                title={t('viewer.timing.scrollColor')}
              />
              <NumberInputWithPresets
                value={timingMarkerSettings.scroll.fontSize}
                onChange={(v) => setTimingMarkerSettings(s => ({ ...s, scroll: { ...s.scroll, fontSize: v } }))}
                presets={[10, 12, 14, 16, 18, 20] as const}
                min={8}
                max={32}
                step={1}
                suffix="px"
                allowDecimal={false}
                activeColor="bg-cyan-500/20 text-cyan-400"
                inputWidth="w-12"
              />
              <input
                type="range"
                value={timingMarkerSettings.scroll.opacity * 100}
                onChange={(e) => setTimingMarkerSettings(s => ({ ...s, scroll: { ...s.scroll, opacity: Number(e.target.value) / 100 } }))}
                min={10}
                max={100}
                className="w-16 h-1 accent-cyan-500"
                title={t('viewer.timing.opacity', { percent: Math.round(timingMarkerSettings.scroll.opacity * 100) })}
              />
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div
        className="h-2 bg-muted/50 cursor-pointer relative group"
        onClick={handleSeek}
      >
        <div
          className="h-full bg-primary/60 transition-all duration-75"
          style={{ width: `${progressPercent}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
          style={{ left: `calc(${progressPercent}% - 6px)` }}
        />
      </div>

      {/* WebGL Canvas - normal view modes (scroll, playback) */}
      {viewMode !== 'columns' && (
        <div
          ref={containerRef}
          tabIndex={0}
          className={cn("relative select-none outline-none focus:ring-2 focus:ring-primary/50 isolate z-0 overflow-x-auto pb-6", viewMode === 'scroll' && "cursor-grab active:cursor-grabbing", (isFullscreen) && "flex-1")}
          style={{ height: isFullscreen ? '100%' : effectiveHeight, minHeight: effectiveHeight, flex: '1 1 auto', touchAction: viewMode === 'scroll' ? 'none' : 'auto' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        >
          {/* Lane Labels (HTML overlay) - aligned to the note area, excluding the BPM text margin */}
          <div
            className="absolute bottom-1 z-10 pointer-events-none flex"
            style={{ width: chartWidth, left: '50%', transform: `translateX(calc(-50% + ${LEFT_MARGIN_FOR_TEXT / 2}px))` }}
          >
            {lanes.map((lane) => (
              <div
                key={lane.id}
                className="flex items-center justify-center text-xs font-medium h-5"
                style={{ width: lane.width, backgroundColor: lane.color + '99', color: '#fff', textShadow: '0 0 2px #000' }}
              >
                {lane.id}
              </div>
            ))}
          </div>

          {/* Minimap (shown only in scroll and playback modes) */}
          {showMinimap && (viewMode === 'scroll' || viewMode === 'playback') && (
            <Minimap
              notes={notes}
              lanes={lanes}
              maxBeat={maxBeat}
              currentBeat={viewMode === 'playback' ? playbackBeat : scrollBeat}
              viewportBeats={viewportBeats}
              onClick={handleMinimapClick}
              noteTypeFilter={localNoteFilter}
              isPlaying={viewMode === 'playback' && isPlaying}
              judgmentLinePosition={judgmentLinePosition}
              positioning={positioning}
            />
          )}

          <Canvas
            orthographic
            camera={mainCameraConfig}
            gl={glConfig}
            dpr={canvasDpr}
            style={mainCanvasStyle}
            onCreated={handleCanvasCreated}
          >
            <Suspense fallback={null}>
              {/* Force re-render on settings change */}
              <SceneInvalidator deps={[
                localNoteFilter.playable,
                localNoteFilter.invisible,
                localNoteFilter.landmine,
                localNoteFilter.bgm,
                gridDivision,
                effectiveBeatScale,
                lanes,
              ]} />
              <CameraController
                scrollBeat={scrollBeat}
                beatScale={effectiveBeatScale}
                isPlaying={viewMode === 'playback' && isPlaying}
                playbackBeatRef={playbackBeatRef}
                cameraOffset={cameraOffset}
                positioning={positioning}
                chartWidth={chartWidth}
                viewportHeight={viewportHeight}
              />
              <LanesRenderer lanes={lanes} totalHeight={totalHeight} totalWidth={chartWidth} />
              <MeasureLinesRenderer totalBeats={maxBeat} beatScale={effectiveBeatScale} totalWidth={chartWidth} gridDivision={gridDivision} bpmChanges={bpmChanges} baseBpm={bpm} positioning={positioning} />
              <TimingMarkersRenderer bpmChanges={bpmChanges} stops={stops} scrollChanges={scrollChanges} beatScale={effectiveBeatScale} baseBeatScale={beatScale} totalWidth={chartWidth} showMarkers={showTimingMarkers} positioning={positioning} settings={timingMarkerSettings} />
              <NotesRenderer notes={notes} lanes={lanes} beatScale={effectiveBeatScale} noteTypeFilter={localNoteFilter} diffMode={diffMode} addedNotes={addedNotes} removedNotes={removedNotes} modifiedNotes={modifiedNotes} positioning={positioning} scaleWidthByScroll={scaleWidthByScroll} noteScale={noteScale} unchangedOpacity={unchangedOpacity} />
              {/* Judgment line - only visible during playback */}
              {viewMode === 'playback' && isPlaying && (
                <>
                  <JudgmentLine
                    width={chartWidth}
                    playbackBeatRef={playbackBeatRef}
                    beatScale={effectiveBeatScale}
                    positioning={positioning}
                  />
                  {/* Hit effects - visual feedback for notes hitting judgment line */}
                  <HitEffectsRenderer
                    hitNotes={hitNotesRef.current}
                    version={hitNotesVersion}
                  />
                </>
              )}
            </Suspense>
          </Canvas>
        </div>
      )}

      {/* WebGL Canvas - columns view mode */}
      {viewMode === 'columns' && (
        <div
          tabIndex={0}
          className="relative outline-none focus:ring-2 focus:ring-primary/50"
          style={{ maxHeight: staticMaxHeight, overflow: columnsLayout === 'vertical' ? 'hidden' : 'auto' }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onWheel={columnsLayout === 'vertical' && columnsCameraConfig.isScrollable ? (e) => {
            e.preventDefault();
            const maxScroll = columnsCameraConfig.maxScrollY;
            setVerticalScrollY(prev => Math.max(0, Math.min(maxScroll, prev + e.deltaY)));
          } : undefined}
        >
          <Canvas
            orthographic
            camera={columnsCameraConfig}
            gl={glConfig}
            dpr={canvasDpr}
            style={columnsCanvasStyle}
            onCreated={handleCanvasCreated}
          >
            <Suspense fallback={null}>
              {/* Force re-render on settings change */}
              <SceneInvalidator deps={[
                localNoteFilter.playable,
                localNoteFilter.invisible,
                localNoteFilter.landmine,
                localNoteFilter.bgm,
                gridDivision,
                localMeasuresPerColumn,
                columnsLayout,
                columnsViewDimensions.scale,
                verticalScrollY,
                lanes,
                chartWidth,
              ]} />
              {/* Camera controller to ensure correct camera position and orientation */}
              <ColumnsCameraController
                centerX={columnsCameraConfig.centerX}
                centerY={columnsCameraConfig.centerY}
              />
              {/* Scale group to fit within canvas size limits */}
              <group scale={[columnsViewDimensions.scale, columnsViewDimensions.scale, 1]}>
                <ColumnsViewRenderer
                  notes={notes}
                  lanes={lanes}
                  beatScale={columnBeatScale}
                  totalMeasures={totalMeasures}
                  measuresPerColumn={localMeasuresPerColumn}
                  columnGap={columnGap}
                  noteTypeFilter={localNoteFilter}
                  diffMode={diffMode}
                  addedNotes={addedNotes}
                  removedNotes={removedNotes}
                  modifiedNotes={modifiedNotes}
                  layout={columnsLayout}
                  bpmChanges={bpmChanges}
                  baseBpm={bpm}
                  gridDivision={gridDivision}
                  positioning={positioning}
                />
              </group>
            </Suspense>
          </Canvas>
        </div>
      )}

      {/* WebGL context lost warning */}
      {webglContextLost && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="text-center text-white">
            <div className="text-lg font-bold mb-2">{t('noteChart.error.webglLost')}</div>
            <div className="text-sm text-gray-300">{t('viewer.settings.resourceRecovering')}</div>
          </div>
        </div>
      )}

      {/* Hint and status display */}
      <div className="p-2 text-xs text-muted-foreground border-t flex items-center justify-between">
        <span>
          {viewMode === 'playback' && (isPlaying
            ? (keysoundReady ? t('viewer.playback.playingNormal', { speed: playbackSpeed })
                : audioLoaded ? t('viewer.playback.playingBgm', { speed: playbackSpeed })
                : keysoundOnlyMode ? t('viewer.playback.playingKeysound', { speed: playbackSpeed })
                : t('viewer.playback.playingBpm', { speed: playbackSpeed }))
            : t('viewer.playback.idleHint'))}
          {viewMode === 'scroll' && t('viewer.playback.scrollHint')}
          {isFullscreen && t('viewer.playback.fullscreenHint')}
          {viewMode === 'columns' && (columnsLayout === 'vertical'
            ? t('viewer.playback.verticalView', { measures: totalMeasures })
            : t('viewer.playback.columnView', { measures: totalMeasures, columns: numColumns, measuresPerColumn: localMeasuresPerColumn }))}
        </span>
        <div className="flex items-center gap-2">
          {viewMode === 'playback' && isPlaying && keysoundReady && (pipelineLatency !== null || schedulingOverhead !== null) && (
            <span
              className="text-blue-400"
              title={t('viewer.playback.latencyTooltip')}
            >
              {pipelineLatency !== null ? pipelineLatency.toFixed(1) : '?'}
              {schedulingOverhead !== null ? ` + ${schedulingOverhead.toFixed(2)}` : ''}ms
            </span>
          )}
          {viewMode === 'playback' && (
            <span className="text-orange-400">BPM {Math.round(currentBpm)}</span>
          )}
          {laneOption !== 'normal' && <span className="text-green-400 capitalize">{laneOption}</span>}
          {hiSpeed !== 1 && <span className="text-cyan-400">HS ×{hiSpeed}</span>}
        </div>
      </div>
    </div>
  );
}
