/**
 * NoteChartViewer Component (WebGL Version)
 *
 * BMS 노트 차트를 시각적으로 표시하는 컴포넌트
 * React Three Fiber를 사용하여 WebGL로 2D 렌더링합니다.
 *
 * 노트 타입별 시각화:
 * - playable: 일반 노트 (밝은 색상)
 * - invisible: 고스트 노트 (점선 테두리, 반투명)
 * - landmine: 지뢰 노트 (빨간색 X 마크)
 * - bgm: BGM 자동 재생 노트 (회색 점선)
 */

import React, { useRef, useEffect, useMemo, useState, useCallback, Suspense } from 'react';
// flushSync 제거됨 - 성능 최적화 (메인 스레드 블로킹 방지)
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
// EqualizerBand/EqualizerSettings/EffectorSettings 는 useKeysoundLifecycle 에서 export 됨
import type { EqualizerBand, EqualizerSettings, EffectorSettings } from './viewer/hooks/useKeysoundLifecycle';
import { useKeysoundTrigger } from './viewer/hooks/useKeysoundTrigger';
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

// 뷰 모드 타입
export type ViewMode = 'scroll' | 'playback' | 'columns';

// 키 모드 타입
export type KeyMode = '4K' | '5K' | '6K' | '7K' | '8K' | '9K' | '10K' | '12K' | '14K' | '18K' | '24K' | '48K';

// 키 모드 표시 포맷 (스크래치 포함 여부)
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

// 노트 타입별 필터 옵션
export interface NoteTypeFilter {
  playable: boolean;
  invisible: boolean;
  landmine: boolean;
  bgm: boolean;
}

/** BPM 변경 이벤트 */
export interface BpmChange {
  beat: number;
  bpm: number;
}

/** STOP 이벤트 */
export interface StopEvent {
  beat: number;
  duration: number;
}

/** 스크롤 속도 변경 이벤트 */
export interface ScrollSpeedChange {
  beat: number;
  speed: number;
}

/** 개별 마커 타입 설정 */
export interface MarkerTypeSettings {
  visible: boolean;
  color: string;
  fontSize: number;
  opacity: number;
  showLine: boolean;
  showBackground: boolean;
}

/** 타이밍 마커 전체 설정 */
export interface TimingMarkerSettings {
  bpm: MarkerTypeSettings;
  stop: MarkerTypeSettings;
  scroll: MarkerTypeSettings;
}

/** 기본 타이밍 마커 설정 */
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

/** 레인 옵션 */
export type LaneOption = 'normal' | 'mirror' | 'random' | 'r-random' | 's-random';

/** 숫자 입력 컴포넌트 (프리셋 버튼 + 직접 입력) */
interface NumberInputWithPresetsProps {
  value: number;
  onChange: (value: number) => void;
  presets: readonly number[];
  min: number;
  max: number;
  step?: number;
  label?: string;
  suffix?: string;
  prefix?: string;
  activeColor?: string;
  allowDecimal?: boolean;
  inputWidth?: string;
}

const NumberInputWithPresets = React.memo(function NumberInputWithPresets({
  value,
  onChange,
  presets,
  min,
  max,
  step = 0.01,
  suffix = '',
  prefix = '',
  activeColor = 'bg-cyan-500/20 text-cyan-400',
  allowDecimal = true,
  inputWidth = 'w-16',
}: NumberInputWithPresetsProps) {
  const { t } = useI18n();
  const [inputValue, setInputValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  // 외부 value가 변경되면 input 값 동기화
  useEffect(() => {
    if (!isFocused) {
      setInputValue(String(value));
    }
  }, [value, isFocused]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // 숫자, 소수점, 마이너스만 허용
    if (allowDecimal) {
      if (/^-?\d*\.?\d*$/.test(newValue)) {
        setInputValue(newValue);
      }
    } else {
      if (/^-?\d*$/.test(newValue)) {
        setInputValue(newValue);
      }
    }
  }, [allowDecimal]);

  const handleInputBlur = useCallback(() => {
    setIsFocused(false);
    let parsed = parseFloat(inputValue);
    if (isNaN(parsed)) {
      parsed = value;
    }
    // 범위 제한
    const clamped = Math.max(min, Math.min(max, parsed));
    // step에 맞게 반올림
    const stepped = Math.round(clamped / step) * step;
    // 소수점 정리
    const final = allowDecimal ? parseFloat(stepped.toFixed(10)) : Math.round(stepped);
    setInputValue(String(final));
    if (final !== value) {
      onChange(final);
    }
  }, [inputValue, value, min, max, step, allowDecimal, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setInputValue(String(value));
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newVal = Math.min(max, value + step);
      const final = allowDecimal ? parseFloat(newVal.toFixed(10)) : Math.round(newVal);
      onChange(final);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newVal = Math.max(min, value - step);
      const final = allowDecimal ? parseFloat(newVal.toFixed(10)) : Math.round(newVal);
      onChange(final);
    }
  }, [value, min, max, step, allowDecimal, onChange]);

  const isPresetValue = presets.includes(value as typeof presets[number]);

  return (
    <div className="flex items-center gap-1">
      {presets.map(preset => (
        <button
          key={preset}
          onClick={() => onChange(preset)}
          className={cn(
            "px-2 py-1 rounded text-xs transition-colors",
            value === preset ? activeColor : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
        >
          {prefix}{preset}{suffix}
        </button>
      ))}
      <input
        type="text"
        value={isFocused ? inputValue : `${value}`}
        onChange={handleInputChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          inputWidth,
          "px-2 py-1 rounded text-xs text-center transition-colors border",
          !isPresetValue && !isFocused
            ? activeColor + " border-current"
            : "bg-muted/50 text-muted-foreground border-transparent hover:border-muted-foreground/30",
          isFocused && "border-cyan-500 bg-background"
        )}
        title={t('viewer.numberInput.manualEntryTitle', { min, max })}
      />
    </div>
  );
});

/** 재생 속도 옵션 */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** 스크롤 속도 옵션 (음원 재생 속도와 분리) */
export const SCROLL_SPEEDS = [0.5, 1, 2, 4, 8, 16] as const;

/** 그리드 간격 옵션 (비트당 라인 수) */
export const GRID_DIVISIONS = [1, 2, 4, 8, 16, 32, 48, 64, 96] as const;

/** 컬럼 뷰 레이아웃 타입 */
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
  /** 키사운드 매핑 (ID -> 파일명) */
  keysounds?: Record<string, string>;
  /** 키사운드 파일 기본 URL */
  keysoundBaseUrl?: string;
  /** 컬럼 뷰에서 한 컬럼당 마디 수 (기본: 4) */
  measuresPerColumn?: number;
  /** 컬럼 간 간격 (기본: 20) */
  columnGap?: number;
  /** Positioning 객체 (스크롤 기믹 지원) */
  positioning?: Positioning | null;
  /** Timing 객체 (BPM 변화에 따른 시간-비트 변환) */
  timing?: Timing | null;
  /** 타이밍 마커 설정 (BPM/STOP/SCROLL 표시 옵션) */
  timingMarkerSettings?: TimingMarkerSettings;
  /** 노트 높이 배율 (기본 1.0) */
  noteScale?: number;
  /** 레인 너비 배율 (기본 1.0) */
  laneWidthScale?: number;
  /** 초기 스크롤 위치 (beat 단위) */
  initialScrollBeat?: number;
  /** 외부에서 스크롤 위치를 변경할 때 사용 (변경 시 해당 beat로 이동) */
  scrollToBeat?: number;
  /** unchanged 노트 불투명도 (0-1, diff 모드에서 변경되지 않은 노트 희미하게) */
  unchangedOpacity?: number;
}

const DEFAULT_NOTE_TYPE_FILTER: NoteTypeFilter = {
  playable: true,
  invisible: true,  // Ghost notes enabled by default
  landmine: true,
  bgm: true,        // BGM enabled by default
};

/** 레인 옵션 적용 */
function applyLaneOption(lanes: LaneConfig[], option: LaneOption, seed?: number): LaneConfig[] {
  if (option === 'normal') return lanes;

  // 스크래치/FZ 레인 분리 (playableLanes만 셔플)
  const playableLanes = lanes.filter(l => !l.isScratch && !l.isBgm && l.id !== 'FZ' && l.id !== 'FZ2');

  let arrangedLanes: LaneConfig[];

  switch (option) {
    case 'mirror':
      arrangedLanes = [...playableLanes].reverse();
      break;
    case 'random':
    case 'r-random':
    case 's-random': {
      // Fisher-Yates shuffle
      const shuffled = [...playableLanes];
      const rng = seed ? mulberry32(seed) : Math.random;
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      arrangedLanes = shuffled;
      break;
    }
    default:
      arrangedLanes = playableLanes;
  }

  // 원래 위치에 스크래치 레인 복원
  const result: LaneConfig[] = [];
  let playableIndex = 0;

  for (const original of lanes) {
    if (original.isScratch || original.isBgm || original.id === 'FZ' || original.id === 'FZ2') {
      result.push(original);
    } else {
      const arranged = arrangedLanes[playableIndex++];
      result.push({ ...arranged, x: original.x });
    }
  }

  // x 좌표 재계산
  let x = 0;
  return result.map(lane => {
    const updated = { ...lane, x };
    x += lane.width;
    return updated;
  });
}

// Renderer implementations → viewer/renderers/ (Stage E extraction)

/** 메인 컴포넌트 */
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
  // audioRef, keysoundPlayerRef는 훅(useBgmAudio / useKeysoundLifecycle)에서 반환됨
  // animationRef, playbackBeatRef, lastPlayedBeatRef, playedNotesRef는 useViewerPlayback에서 반환됨
  const notesRef = useRef(notes);
  // 성능 최적화: 비트 순으로 정렬된 노트 배열 (이진 검색용)
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
  // 스크롤/드래그/줌/모멘텀/터치/휠 — useViewerScroll 훅으로 위임
  // maxBeat/effectiveBeatScale/scrollSpeed 는 아래에서 useMemo로 계산되지만,
  // 훅 내부 ref 패턴 덕분에 초기 렌더 이후 자동 sync됨 (초기값은 임시값)
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
  // 는 useViewerPlayback 훅에서 반환됨 (아래 keysound 이후에 호출됨)
  // BGM/Fullscreen state는 maxBeat 선언 이후 훅 호출로 처리 (아래 참조)

  // BMS 표시 설정 — useViewerSettings 훅으로 위임
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

  // 오디오 설정 — useViewerAudioSettings 훅으로 위임
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

  // 키사운드 라이프사이클 — useKeysoundLifecycle 훅으로 위임
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
    // 성능 최적화: 노트를 비트 순으로 정렬 (이진 검색용)
    sortedNotesRef.current = [...notes].sort((a, b) => a.beat - b.beat);
  }, [notes]);
  useEffect(() => { keysoundEnabledRef.current = keysoundEnabled; }, [keysoundEnabled]);
  useEffect(() => { keysoundReadyRef.current = keysoundReady; }, [keysoundReady]);
  // isPlayingRef は useViewerPlayback 훅 내부에서 관리됨 — 여기서는 불필요

  // Fullscreen: isFullscreen + toggleFullscreen 은 useFullscreen 훅에서 제공됨 (위에서 선언)

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
      // setIsPlaying(false) 은 no-op when already false, so safe to call unconditionally
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
  // progressPercent는 playbackBeat (useViewerPlayback) 이후로 이동됨
  // effectiveHeight: chartHeightOverride가 설정되면 사용, 아니면 props height
  const effectiveHeight = useMemo(() => chartHeightOverride ?? height, [chartHeightOverride, height]);

  // 비율 고정 핸들러: 가로 변경 시 세로도 비율에 맞춰 조정
  const handleChartWidthChange = useCallback((newWidth: number) => {
    const currentWidth = chartWidthOverride ?? baseChartWidth;
    const currentHeight = chartHeightOverride ?? height;
    setChartWidthOverride(newWidth === baseChartWidth ? null : newWidth);
    if (aspectRatioLocked && currentWidth > 0) {
      const ratio = currentHeight / currentWidth;
      const newHeight = Math.round(newWidth * ratio / 10) * 10; // 10단위로 스냅
      setChartHeightOverride(Math.max(200, Math.min(1200, newHeight)));
    }
  }, [chartWidthOverride, chartHeightOverride, baseChartWidth, height, aspectRatioLocked]);

  // 비율 고정 핸들러: 세로 변경 시 가로도 비율에 맞춰 조정
  const handleChartHeightChange = useCallback((newHeight: number) => {
    const currentWidth = chartWidthOverride ?? baseChartWidth;
    const currentHeight = chartHeightOverride ?? height;
    setChartHeightOverride(newHeight === height ? null : newHeight);
    if (aspectRatioLocked && currentHeight > 0) {
      const ratio = currentWidth / currentHeight;
      const newWidth = Math.round(newHeight * ratio / 10) * 10; // 10단위로 스냅
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
  // は useViewerPlayback 이후로 이동됨 (아래 훅 호출 다음에 선언)

  // 컬럼 뷰 계산
  const totalMeasures = useMemo(() => Math.ceil(maxBeat / 4), [maxBeat]);
  const columnBeatScale = beatScale * hiSpeed; // 컬럼 뷰에서는 zoomLevel 적용하지 않음

  // columnsLayout에 따른 계산
  const effectiveMeasuresPerColumn = columnsLayout === 'vertical' ? totalMeasures : localMeasuresPerColumn;
  const numColumns = columnsLayout === 'vertical' ? 1 : Math.ceil(totalMeasures / localMeasuresPerColumn);
  const singleColumnHeight = effectiveMeasuresPerColumn * 4 * columnBeatScale;

  // BGM ended 콜백을 ref 로 보관 — useViewerPlayback 선언 전에 useBgmAudio를 호출해야 하므로
  // 실제 핸들러는 아래 useViewerPlayback 이후에 ref 에 주입됨
  const onBgmEndedRef = useRef<() => void>(() => {});

  // BGM 오디오 — useBgmAudio 훅 (maxBeat 이후에 위치해야 함)
  const {
    audioRef,
    audioLoaded,
    audioLoading,
    audioError,
    audioProgress,
    keysoundOnlyMode,
  } = useBgmAudio(audioUrl, maxBeat, () => onBgmEndedRef.current());

  // Fullscreen — useFullscreen 훅
  const { isFullscreen, toggleFullscreen: _toggleFullscreen } = useFullscreen();
  const toggleFullscreen = useCallback(
    () => _toggleFullscreen(outerContainerRef as React.RefObject<HTMLElement>),
    [_toggleFullscreen],
  );

  // 키사운드 상태 디버깅 (임시)
  useEffect(() => {
    if (keysoundReady && keysoundPlayerRef.current) {
      console.log('[NoteChartViewer] Keysound ready. Sample note keysounds:',
        notes.slice(0, 10).map(n => n.keysound).filter(Boolean));
      console.log('[NoteChartViewer] Keysounds prop keys:',
        keysounds ? Object.keys(keysounds).slice(0, 10) : 'none');
    }
  }, [keysoundReady, notes, keysounds]);

  // 재생 엔진 — useViewerPlayback 훅으로 위임
  // (애니메이션 루프, togglePlayback, calculateTimeAtBeat, 재생 상태/refs 포함)
  // playedNotesRef는 useKeysoundTrigger가 소유 → 주입
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

  // BGM ended 핸들러를 useViewerPlayback 이후에 ref 에 주입
  // (useBgmAudio 는 위에서 먼저 호출되어야 audioRef 를 제공함)
  onBgmEndedRef.current = () => {
    if (keysoundReadyRef.current) return;
    setIsPlaying(false);
    playbackBeatRef.current = maxBeat;
    setPlaybackBeat(maxBeat);
  };

  // 시간 표시용 계산 (useViewerPlayback 이후에 위치)
  const totalDuration = useMemo(() => calculateTimeAtBeat(maxBeat), [calculateTimeAtBeat, maxBeat]);
  const currentTime = useMemo(() => calculateTimeAtBeat(playbackBeat), [calculateTimeAtBeat, playbackBeat]);
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 현재 재생 위치의 BPM (status bar 표시용)
  const currentBpm = useMemo(() => {
    if (!bpmChanges || bpmChanges.length === 0) return bpm;
    let cur = bpm;
    for (const c of bpmChanges) {
      if (c.beat <= playbackBeat) cur = c.bpm; else break;
    }
    return cur;
  }, [bpm, bpmChanges, playbackBeat]);

  // 진행률 (프로그레스 바용)
  const progressPercent = viewMode === 'playback' ? (playbackBeat / maxBeat) * 100 : (scrollBeat / maxBeat) * 100;

  // viewMode 변경 시 위치 동기화 (리셋하지 않음)
  useEffect(() => {
    // 재생 중이면 정지
    setIsPlaying(false);
    // 현재 위치를 다른 모드와 동기화
    if (viewMode === 'playback') {
      // scroll → playback: scrollBeat를 playbackBeat에 동기화
      playbackBeatRef.current = scrollBeat;
      setPlaybackBeat(scrollBeat);
    } else if (viewMode === 'scroll') {
      // playback → scroll: playbackBeat를 scrollBeat에 동기화
      setScrollBeat(playbackBeatRef.current);
    }
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 스크롤/모멘텀/터치/휠/키보드 핸들러는 useViewerScroll + useViewerKeyboard 훅에서 제공됨.
  // scrollConfigRef 는 위 2768번 라인에서 매 렌더마다 maxBeat/effectiveBeatScale/scrollSpeed 로 갱신됨.

  // 키보드 단축키 — useViewerKeyboard 훅으로 위임
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

    // 모든 상태를 동기화
    playbackBeatRef.current = targetBeat;
    setPlaybackBeat(targetBeat);
    setScrollBeat(targetBeat);

    // 오디오 동기화
    if (audioRef.current && audioLoaded) {
      audioRef.current.currentTime = targetBeat * 60 / bpm;
    }

    // 키사운드 상태 초기화
    playedNotesRef.current.clear();
    lastPlayedBeatRef.current = targetBeat;

    // 재생 중일 때만 해당 위치에서 아직 재생 중인 키음들을 offset과 함께 재생
    if (keysoundReady && keysoundPlayerRef.current) {
      keysoundPlayerRef.current.stopAll();
      if (isPlaying) {
        playActiveKeysoundsAtBeat(targetBeat, calculateTimeAtBeat);
      }
    }
  }, [maxBeat, audioLoaded, bpm, keysoundReady, playActiveKeysoundsAtBeat, calculateTimeAtBeat, isPlaying]);

  // 미니맵 클릭 핸들러 - 해당 위치로 이동 및 키음 동기화
  const handleMinimapClick = useCallback((beat: number) => {
    const targetBeat = Math.max(0, Math.min(maxBeat, beat));

    // 재생 중이면 일시정지
    const wasPlaying = isPlaying;
    if (wasPlaying) {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
      if (keysoundPlayerRef.current) keysoundPlayerRef.current.stopAll();
    }

    // 모든 상태를 동기화
    playbackBeatRef.current = targetBeat;
    setPlaybackBeat(targetBeat);
    setScrollBeat(targetBeat);

    // 오디오 동기화
    if (audioRef.current && audioLoaded) {
      audioRef.current.currentTime = targetBeat * 60 / bpm;
    }

    // 키사운드 played notes 초기화 및 새 위치부터 시작
    playedNotesRef.current.clear();
    lastPlayedBeatRef.current = targetBeat;

    // 재생 중이었으면 해당 위치에서 아직 재생 중인 키음들을 offset과 함께 재생하고 다시 재생
    if (wasPlaying) {
      if (keysoundReady && keysoundPlayerRef.current) {
        playActiveKeysoundsAtBeat(targetBeat, calculateTimeAtBeat);
      }
      setTimeout(() => setIsPlaying(true), 50);
    }
  }, [maxBeat, isPlaying, audioLoaded, bpm, keysoundReady, playActiveKeysoundsAtBeat, calculateTimeAtBeat]);

  // 뷰포트에 보이는 비트 수 계산 (미니맵용)
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
  // BPM 텍스트를 위한 왼쪽 여백
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
  // 캔버스 너비에 BPM 텍스트 영역 포함
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
      {/* 헤더 */}
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

      {/* 컨트롤 */}
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
            {/* 시간 및 마디 표시 */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-mono text-orange-400">{formatTime(currentTime)}</span>
              <span className="text-muted-foreground">/</span>
              <span className="font-mono text-muted-foreground">{formatTime(totalDuration)}</span>
              <span className="text-muted-foreground ml-1">|</span>
              <span className="text-muted-foreground ml-1">{Math.floor(playbackBeat / 4) + 1}/{Math.floor(maxBeat / 4)} 마디</span>
            </div>
            {audioUrl && (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs px-2 py-1 rounded",
                  audioLoading ? "bg-yellow-500/20 text-yellow-400" :
                    audioLoaded ? "bg-green-500/20 text-green-500" :
                      keysoundOnlyMode ? "bg-blue-500/20 text-blue-400" : // keysound-only mode는 파란색 (정상)
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
            <span className="text-xs text-muted-foreground w-16">표시:</span>
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
            <span className="text-xs text-muted-foreground w-16">레인:</span>
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
            <span className="text-xs text-muted-foreground w-16">가로 크기:</span>
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
                (리셋)
              </button>
            )}
            {/* 비율 고정 토글 */}
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
            <span className="text-xs text-muted-foreground w-16">세로 크기:</span>
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
                (리셋)
              </button>
            )}
          </div>

          {/* Measures per Column (컬럼 뷰 전용) */}
          {viewMode === 'columns' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-16">마디/컬럼:</span>
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

          {/* Columns Layout (컬럼 뷰 전용) */}
          {viewMode === 'columns' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-16">레이아웃:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setColumnsLayout('horizontal'); setVerticalScrollY(0); }}
                className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", columnsLayout === 'horizontal' ? "bg-indigo-500/20 text-indigo-400" : "bg-muted/50 text-muted-foreground")}
              >
                <LayoutGrid className="h-3 w-3" /> 가로 컬럼
              </button>
              <button
                onClick={() => { setColumnsLayout('vertical'); setVerticalScrollY(0); }}
                className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", columnsLayout === 'vertical' ? "bg-indigo-500/20 text-indigo-400" : "bg-muted/50 text-muted-foreground")}
              >
                <Rows3 className="h-3 w-3" /> 세로 1줄
              </button>
            </div>
          </div>
          )}

          {/* Grid Division (그리드 간격) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-16">그리드:</span>
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
            <span className="text-xs text-muted-foreground ml-2">(비트당 라인)</span>
          </div>

          {/* Scroll Speed - scroll 뷰 전용 */}
          {viewMode === 'scroll' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16">스크롤:</span>
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
              <span className="text-xs text-muted-foreground ml-2">(드래그 민감도)</span>
            </div>
          )}

          {/* Minimap Toggle - scroll/playback 뷰 전용 */}
          {(viewMode === 'scroll' || viewMode === 'playback') && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16">미니맵:</span>
              <button
                onClick={() => setShowMinimap(!showMinimap)}
                className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", showMinimap ? "bg-green-500/20 text-green-400" : "bg-muted/50 text-muted-foreground")}
              >
                <MapIcon className="h-3 w-3" />
                {showMinimap ? "ON" : "OFF"}
              </button>
              <span className="text-xs text-muted-foreground ml-2">(클릭하여 해당 위치로 이동)</span>
            </div>
          )}

          {/* 스크롤 너비 스케일링 - scroll/playback 뷰 전용 */}
          {(viewMode === 'scroll' || viewMode === 'playback') && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16">너비변화:</span>
              <button
                onClick={() => setScaleWidthByScroll(!scaleWidthByScroll)}
                className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors", scaleWidthByScroll ? "bg-purple-500/20 text-purple-400" : "bg-muted/50 text-muted-foreground")}
              >
                <ZoomIn className="h-3 w-3" />
                {scaleWidthByScroll ? "ON" : "OFF"}
              </button>
              <span className="text-xs text-muted-foreground ml-2">(스크롤 속도에 따른 노트 너비)</span>
            </div>
          )}

          {/* Playback Speed - playback 모드 전용 */}
          {viewMode === 'playback' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16">속도:</span>
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

          {/* Keysound Volume & Audio Settings - playback 모드 전용 */}
          {viewMode === 'playback' && keysounds && Object.keys(keysounds).length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16">키음량:</span>
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

          {/* 타이밍 마커 설정 (BPM/STOP/SCROLL) */}
          <div className="border-t border-muted/30 pt-3 mt-1">
            <div className="text-xs text-muted-foreground mb-2 font-medium">타이밍 마커</div>

            {/* BPM 마커 설정 */}
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

            {/* STOP 마커 설정 */}
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

            {/* SCROLL 마커 설정 */}
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

      {/* WebGL Canvas - 일반 뷰 모드 (scroll, playback) */}
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
          {/* Lane Labels (HTML overlay) - BPM 텍스트 영역 제외한 노트 영역에 정렬 */}
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

          {/* 미니맵 (scroll, playback 모드에서만 표시) */}
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
              {/* 설정 변경 시 강제 렌더링 */}
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

      {/* WebGL Canvas - 컬럼 뷰 모드 */}
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
              {/* 설정 변경 시 강제 렌더링 */}
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

      {/* WebGL 컨텍스트 손실 경고 */}
      {webglContextLost && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="text-center text-white">
            <div className="text-lg font-bold mb-2">WebGL 컨텍스트 손실</div>
            <div className="text-sm text-gray-300">그래픽 리소스 복구 중입니다...</div>
          </div>
        </div>
      )}

      {/* 힌트 및 상태 표시 */}
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
