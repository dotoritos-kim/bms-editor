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
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Line2, LineSegments2 } from 'three-stdlib';
import { Play, Pause, Maximize2, Minimize2, GripVertical, Volume2, VolumeX, ZoomIn, ZoomOut, RotateCcw, Settings, Eye, Bomb, Music, Ghost, FlipHorizontal, SkipBack, SkipForward, Loader2, LayoutGrid, Rows3, Map as MapIcon, Link2, Link2Off } from 'lucide-react';
import { cn } from '../utils';
import type { BMSNote } from '@rhythm-archive/bms-core';
import { Positioning, Timing } from '@rhythm-archive/bms-core';
import { KeysoundPlayer } from './KeysoundPlayer';
import { generateLaneConfig, getLaneBackground, type LaneConfig } from './laneConfig';

/** Equalizer band setting */
interface EqualizerBand {
  frequency: number;
  gain: number;
}

/** Equalizer settings */
interface EqualizerSettings {
  enabled: boolean;
  preset: string;
  bands: EqualizerBand[];
}

/** Effector settings */
interface EffectorSettings {
  compressor: { enabled: boolean; threshold: number; ratio: number; attack: number; release: number };
  reverb: { enabled: boolean; mix: number; decay: number };
  stereo: { enabled: boolean; width: number };
}

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
        title={`직접 입력 (${min} ~ ${max})`}
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
  const playableLanes = lanes.filter(l => !l.isScratch && l.id !== 'FZ' && l.id !== 'FZ2');

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
    if (original.isScratch || original.id === 'FZ' || original.id === 'FZ2') {
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

/** Simple seeded random number generator */
function mulberry32(seed: number) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const NOTE_HEIGHT = 4;
const NOTE_PADDING = 1;

// Shared geometry instances (created once, reused)
const sharedNoteGeometry = new THREE.PlaneGeometry(1, NOTE_HEIGHT);
const sharedCircleGeometry = new THREE.CircleGeometry(1, 16);
const sharedBgmGeometry = new THREE.PlaneGeometry(1, 2);
// Note: LN body geometry height varies, use scaling instead
const sharedLnBodyGeometry = new THREE.PlaneGeometry(1, 1);

/**
 * Scene Invalidator - 설정 변경 시 Three.js 렌더링 강제 갱신
 * React Three Fiber는 기본적으로 props 변경을 감지하지만,
 * 일부 경우에 명시적 invalidation이 필요할 수 있음
 */
function SceneInvalidator({ deps }: { deps: unknown[] }) {
  const { invalidate } = useThree();
  const prevDepsRef = useRef<unknown[]>(deps);

  useEffect(() => {
    // deps 배열의 값이 변경되면 scene을 invalidate
    const hasChanged = deps.some((dep, i) => dep !== prevDepsRef.current[i]);
    if (hasChanged) {
      invalidate();
      prevDepsRef.current = deps;
    }
  }, [deps, invalidate]);

  return null;
}

/** 카메라 컨트롤러 - ref 기반으로 React 상태와 분리 */
function CameraController({
  scrollBeat,
  beatScale,
  isPlaying,
  playbackBeatRef,
  cameraOffset,
  positioning,
  chartWidth,
  viewportHeight,
}: {
  scrollBeat: number;
  beatScale: number;
  isPlaying: boolean;
  playbackBeatRef: React.MutableRefObject<number>;
  cameraOffset: number;
  positioning?: Positioning | null;
  chartWidth: number;
  viewportHeight: number;
}) {
  const { camera, invalidate } = useThree();

  // Update camera frustum when chartWidth or viewportHeight changes
  // BPM 텍스트를 위한 왼쪽 여백 포함
  const LEFT_MARGIN = 90; // BPM 텍스트 영역
  useEffect(() => {
    const orthoCam = camera as THREE.OrthographicCamera;
    orthoCam.left = -chartWidth / 2 - LEFT_MARGIN;
    orthoCam.right = chartWidth / 2;
    orthoCam.top = viewportHeight / 2;
    orthoCam.bottom = -viewportHeight / 2;
    orthoCam.updateProjectionMatrix();
    invalidate();
  }, [camera, chartWidth, viewportHeight, invalidate]);

  useFrame(() => {
    // Read playback beat from ref to avoid React state dependency
    const targetBeat = isPlaying ? playbackBeatRef.current : scrollBeat;
    // beatScale already includes zoomLevel and hiSpeed (effectiveBeatScale)
    // 스크롤 기믹 적용: positioning이 있으면 position() 사용
    const targetY = positioning
      ? positioning.position(targetBeat) * beatScale
      : targetBeat * beatScale;
    // Apply camera offset in scroll/playback modes to show content from bottom
    // This prevents empty black space below beat 0
    const offsetY = cameraOffset;

    camera.position.y = THREE.MathUtils.lerp(
      camera.position.y,
      targetY + offsetY,
      isPlaying ? 1 : 0.15
    );
  });

  return null;
}

/** Columns 뷰 카메라 컨트롤러 - 카메라를 콘텐츠 중앙에 위치시키고 정면을 바라보게 함 */
function ColumnsCameraController({
  centerX,
  centerY,
}: {
  centerX: number;
  centerY: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    // Position camera at center of content, looking down -Z axis
    camera.position.set(centerX, centerY, 100);
    // Reset rotation to look straight ahead (default for orthographic is looking at -Z)
    camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, centerX, centerY]);

  return null;
}

/** 레인 배경 렌더러 */
const LanesRenderer = React.memo(function LanesRenderer({
  lanes,
  totalHeight,
  totalWidth,
}: {
  lanes: LaneConfig[];
  totalHeight: number;
  totalWidth: number;
}) {
  const offsetX = -totalWidth / 2;

  // Memoize lane data to prevent re-renders
  const laneData = useMemo(() => lanes.map((lane) => ({
    id: lane.id,
    color: getLaneBackground(lane),
    position: [offsetX + lane.x + lane.width / 2, totalHeight / 2, -5] as [number, number, number],
    size: [lane.width, totalHeight] as [number, number],
    dividerX: offsetX + lane.x + lane.width,
  })), [lanes, offsetX, totalHeight]);

  return (
    <group>
      {laneData.map((lane) => (
        <mesh key={lane.id} position={lane.position}>
          <planeGeometry args={lane.size} />
          <meshBasicMaterial color={lane.color} />
        </mesh>
      ))}
      {/* 레인 구분선 */}
      {laneData.map((lane) => (
        <Line
          key={`divider-${lane.id}`}
          points={[[lane.dividerX, 0, -4], [lane.dividerX, totalHeight, -4]]}
          color="#333366"
        />
      ))}
    </group>
  );
});

/** 마디선 렌더러 */
const MeasureLinesRenderer = React.memo(function MeasureLinesRenderer({
  totalBeats,
  beatScale,
  totalWidth,
  gridDivision = 4,
  bpmChanges = [],
  baseBpm = 150,
  positioning,
}: {
  totalBeats: number;
  beatScale: number;
  totalWidth: number;
  gridDivision?: number;
  bpmChanges?: BpmChange[];
  baseBpm?: number;
  positioning?: Positioning | null;
}) {
  // 스크롤 기믹 적용 Y 좌표 계산
  const getLineY = useCallback((beat: number) => {
    return positioning ? positioning.position(beat) * beatScale : beat * beatScale;
  }, [positioning, beatScale]);
  // BPM에 따른 그리드 분할 계산 함수
  const getGridDivisionForBpm = useCallback((bpm: number) => {
    // 기준 BPM 대비 비율에 따라 그리드 분할 조정
    // 높은 BPM에서는 분할 줄이고, 낮은 BPM에서는 분할 늘림
    const ratio = bpm / baseBpm;
    if (ratio >= 2) return Math.max(1, Math.floor(gridDivision / 2)); // 2배 이상 BPM: 분할 절반
    if (ratio >= 1.5) return Math.max(2, Math.floor(gridDivision * 0.75)); // 1.5배 이상: 3/4
    if (ratio <= 0.5) return gridDivision * 2; // 절반 이하 BPM: 분할 2배
    if (ratio <= 0.75) return Math.floor(gridDivision * 1.5); // 3/4 이하: 1.5배
    return gridDivision; // 기본
  }, [gridDivision, baseBpm]);

  // 특정 비트의 BPM 가져오기
  const getBpmAtBeat = useCallback((beat: number) => {
    if (bpmChanges.length === 0) return baseBpm;
    let currentBpm = baseBpm;
    for (const change of bpmChanges) {
      if (change.beat <= beat) currentBpm = change.bpm;
      else break;
    }
    return currentBpm;
  }, [bpmChanges, baseBpm]);

  const lines = useMemo(() => {
    const result: { y: number; type: 'measure' | 'beat' | 'grid'; measureNum: number }[] = [];

    // 마디선과 비트선은 항상 그림
    for (let beat = 0; beat <= totalBeats; beat++) {
      const isMeasure = beat % 4 === 0;
      result.push({
        y: getLineY(beat),
        type: isMeasure ? 'measure' : 'beat',
        measureNum: Math.floor(beat / 4)
      });
    }

    // 그리드선은 BPM에 따라 동적으로 계산
    for (let measure = 0; measure < Math.ceil(totalBeats / 4); measure++) {
      const measureStartBeat = measure * 4;
      const bpm = getBpmAtBeat(measureStartBeat);
      const division = getGridDivisionForBpm(bpm);
      const gridStep = 1 / division;

      for (let beatInMeasure = 0; beatInMeasure < 4; beatInMeasure++) {
        for (let grid = 1; grid < division; grid++) {
          const beat = measureStartBeat + beatInMeasure + grid * gridStep;
          if (beat > totalBeats) break;
          const roundedBeat = Math.round(beat * 1000) / 1000;
          result.push({
            y: getLineY(roundedBeat),
            type: 'grid',
            measureNum: measure
          });
        }
      }
    }

    // y좌표로 정렬
    return result.sort((a, b) => a.y - b.y);
  }, [totalBeats, beatScale, getBpmAtBeat, getGridDivisionForBpm, getLineY]);

  const halfWidth = totalWidth / 2;
  const totalMeasures = Math.ceil(totalBeats / 4);

  // LineSegments용 버퍼 생성 (라인 타입별 그룹화)
  // 극단적인 Y값 (NaN, Infinity, 매우 큰 값) 필터링
  const MAX_VALID_Y = 1e7; // 합리적인 최대값
  const lineBuffers = useMemo(() => {
    const measure: number[] = [];
    const beat: number[] = [];
    const grid: number[] = [];
    const measureYPositions: { y: number; measureNum: number }[] = [];

    for (const { y, type, measureNum } of lines) {
      // 유효하지 않은 Y값 건너뛰기
      if (!Number.isFinite(y) || Math.abs(y) > MAX_VALID_Y) continue;

      const arr = type === 'measure' ? measure : type === 'beat' ? beat : grid;
      // LineSegments는 [x1,y1,z1, x2,y2,z2] 형태의 연속된 점 쌍
      arr.push(-halfWidth, y, -3, halfWidth, y, -3);

      // 마디선일 때 번호 표시용 위치 저장
      if (type === 'measure') {
        measureYPositions.push({ y, measureNum });
      }
    }

    return {
      measure: new Float32Array(measure),
      beat: new Float32Array(beat),
      grid: new Float32Array(grid),
      measureYPositions,
    };
  }, [lines, halfWidth]);

  return (
    <group>
      {/* 마디별 교대 배경색 */}
      {Array.from({ length: totalMeasures }, (_, i) => {
        const measureStartBeat = i * 4;
        const measureEndBeat = (i + 1) * 4;
        const measureY = getLineY(measureStartBeat);
        const measureEndY = getLineY(measureEndBeat);
        // 유효하지 않은 Y값 건너뛰기
        if (!Number.isFinite(measureY) || !Number.isFinite(measureEndY) ||
            Math.abs(measureY) > MAX_VALID_Y || Math.abs(measureEndY) > MAX_VALID_Y) {
          return null;
        }
        const measureHeight = Math.abs(measureEndY - measureY);
        const measureCenter = (measureY + measureEndY) / 2;
        return i % 2 === 1 ? (
          <mesh key={`bg-${i}`} position={[0, measureCenter, -6]}>
            <planeGeometry args={[totalWidth, measureHeight]} />
            <meshBasicMaterial color="#1a1a2e" opacity={0.3} transparent />
          </mesh>
        ) : null;
      })}

      {/* 그리드선 (가장 뒤) - 단일 draw call */}
      {lineBuffers.grid.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={lineBuffers.grid.length / 3}
              args={[lineBuffers.grid, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#2a2a44" linewidth={1} />
        </lineSegments>
      )}

      {/* 비트선 (중간) - 단일 draw call */}
      {lineBuffers.beat.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={lineBuffers.beat.length / 3}
              args={[lineBuffers.beat, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#444466" linewidth={1} />
        </lineSegments>
      )}

      {/* 마디선 (가장 앞) - 단일 draw call */}
      {lineBuffers.measure.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={lineBuffers.measure.length / 3}
              args={[lineBuffers.measure, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#6666aa" linewidth={1} />
        </lineSegments>
      )}

      {/* 마디 번호와 배경 - 성능을 위해 일부만 표시 (4마디마다 또는 총 30개 이하로 제한) */}
      {lineBuffers.measureYPositions
        .filter((_, i, arr) => {
          // 30개 이하면 전부 표시, 아니면 간격 조절
          const step = arr.length <= 30 ? 1 : Math.ceil(arr.length / 30);
          return i % step === 0;
        })
        .map(({ y, measureNum }) => (
        <group key={`measure-label-${measureNum}`}>
          {/* 마디 번호 배경 */}
          <mesh position={[-halfWidth - 16, y, -0.5]}>
            <planeGeometry args={[28, 18]} />
            <meshBasicMaterial color="#1a1a2e" opacity={0.85} transparent />
          </mesh>
          {/* 마디 번호 */}
          <Text
            position={[-halfWidth - 16, y, 0]}
            fontSize={13}
            color="#8888bb"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.3}
            outlineColor="#000000"
          >
            {measureNum}
          </Text>
        </group>
      ))}
    </group>
  );
});

/** 노트 색상 결정 */
function getNoteColor(note: BMSNote, laneColor: string, isAdded: boolean, isRemoved: boolean, isModified = false): string {
  if (isRemoved) return '#ff4444';
  if (isModified) return '#ffcc00';
  if (isAdded) return '#44ff44';

  const type = note.noteType || 'playable';
  switch (type) {
    case 'invisible':
      return laneColor + '44';
    case 'landmine': {
      const damage = note.damage ?? 50;
      if (damage >= 100) return '#ff00ff';
      if (damage >= 50) return '#ff0000';
      if (damage >= 25) return '#ff6600';
      return '#ffaa00';
    }
    case 'bgm':
      return '#666666';
    default:
      return laneColor;
  }
}

// Material cache to prevent creating new materials on every render
const materialCache = new Map<string, THREE.MeshBasicMaterial>();

function getMaterial(color: string, opacity: number): THREE.MeshBasicMaterial {
  const key = `${color}-${opacity}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
    }));
  }
  return materialCache.get(key)!;
}

/** Instanced Note renderer for a single color group */
const InstancedNotes = React.memo(function InstancedNotes({
  positions,
  scales,
  color,
  opacity = 1,
  zIndex = 0,
  geometry,
}: {
  positions: [number, number][];
  scales: [number, number][];
  color: string;
  opacity?: number;
  zIndex?: number;
  geometry: THREE.BufferGeometry;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = positions.length;

  // Use cached material to prevent creating new instances
  const material = getMaterial(color, opacity);

  // Update instance matrices using proper compose method
  useEffect(() => {
    if (!meshRef.current || count === 0) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion(); // identity rotation
    const scale = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      position.set(positions[i][0], positions[i][1], zIndex);
      scale.set(scales[i][0], scales[i][1], 1);
      matrix.compose(position, quaternion, scale);
      meshRef.current.setMatrixAt(i, matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, scales, count, zIndex]);

  if (count === 0) return null;

  // Key includes count to force recreation when size changes
  return (
    <instancedMesh
      key={`${color}-${count}`}
      ref={meshRef}
      args={[geometry, material, count]}
      frustumCulled={false}
    />
  );
});

/** Optimized Note renderer using instancing */
const NotesRenderer = React.memo(function NotesRenderer({
  notes,
  lanes,
  beatScale,
  noteTypeFilter,
  diffMode,
  addedNotes,
  removedNotes,
  modifiedNotes = [],
  positioning,
  scaleWidthByScroll = false,
  noteScale = 1.0,
}: {
  notes: BMSNote[];
  lanes: LaneConfig[];
  beatScale: number;
  noteTypeFilter: NoteTypeFilter;
  diffMode: boolean;
  addedNotes: BMSNote[];
  removedNotes: BMSNote[];
  modifiedNotes?: BMSNote[];
  positioning?: Positioning | null;
  /** 스크롤 속도에 따라 노트 너비 스케일링 (기믹 시각화용) */
  scaleWidthByScroll?: boolean;
  /** 노트 높이(두께) 배율 */
  noteScale?: number;
}) {
  const totalWidth = lanes.reduce((sum, l) => sum + l.width, 0);
  const offsetX = -totalWidth / 2;
  const laneMap = useMemo(() => new Map(lanes.map(l => [l.id, l])), [lanes]);
  const addedSet = useMemo(() => new Set(addedNotes.map(n => `${n.beat}-${n.column}`)), [addedNotes]);
  const removedSet = useMemo(() => new Set(removedNotes.map(n => `${n.beat}-${n.column}`)), [removedNotes]);
  const modifiedSet = useMemo(() => new Set(modifiedNotes.map(n => `${n.beat}-${n.column}`)), [modifiedNotes]);

  // 스크롤 기믹을 적용한 Y 좌표 계산 함수
  const getPositionY = useCallback((beat: number) => {
    if (positioning) {
      return positioning.position(beat) * beatScale + NOTE_HEIGHT / 2;
    }
    return beat * beatScale + NOTE_HEIGHT / 2;
  }, [positioning, beatScale]);

  // 스크롤 속도에 따른 노트 높이(두께) 스케일 계산 (0.3 ~ 2.0 범위로 클램프)
  // SCROLL 명령어와 BPM 변화 모두 고려 (effectiveSpeed 사용)
  // noteScale prop을 곱해서 사용자 설정된 노트 크기 적용
  const getHeightScale = useCallback((beat: number) => {
    let scrollScale = 1;
    if (scaleWidthByScroll && positioning) {
      const speed = Math.abs(positioning.effectiveSpeed(beat));
      scrollScale = Math.max(0.3, Math.min(2.0, speed));
    }
    return scrollScale * noteScale;
  }, [scaleWidthByScroll, positioning, noteScale]);

  // Group notes by type and color for instancing
  const noteGroups = useMemo(() => {
    const groups: Record<string, {
      positions: [number, number][],
      scales: [number, number][],
      color: string,
      opacity: number,
      zIndex: number,
      type: 'note' | 'circle' | 'bgm' | 'lnBody',
    }> = {};

    const addToGroup = (
      key: string,
      pos: [number, number],
      scale: [number, number],
      color: string,
      opacity: number,
      zIndex: number,
      type: 'note' | 'circle' | 'bgm' | 'lnBody'
    ) => {
      if (!groups[key]) {
        groups[key] = { positions: [], scales: [], color, opacity, zIndex, type };
      }
      groups[key].positions.push(pos);
      groups[key].scales.push(scale);
    };

    for (const note of notes) {
      if (!note.column) continue;
      const type = note.noteType || 'playable';
      if (!noteTypeFilter[type as keyof NoteTypeFilter]) continue;

      const lane = laneMap.get(note.column);
      if (!lane) continue;

      const x = offsetX + lane.x + NOTE_PADDING + (lane.width - NOTE_PADDING * 2) / 2;
      const y = getPositionY(note.beat);
      const baseWidth = lane.width - NOTE_PADDING * 2;
      const heightScale = getHeightScale(note.beat);
      const noteKey = `${note.beat}-${note.column}`;
      const isAdded = diffMode && addedSet.has(noteKey);
      const isRemoved = diffMode && removedSet.has(noteKey);
      const isModified = diffMode && modifiedSet.has(noteKey);
      const color = getNoteColor(note, lane.color, isAdded, isRemoved, isModified);

      // Long notes
      if (note.endBeat !== undefined) {
        const endY = getPositionY(note.endBeat);
        const endHeightScale = getHeightScale(note.endBeat);
        // 마이너스 스크롤 시 startY > endY가 될 수 있으므로 절대값 사용
        const bodyHeight = Math.abs(endY - y);
        const bodyCenter = (y + endY) / 2;
        const lnBodyKey = `lnBody-${color}`;
        const lnNoteKey = `lnNote-${color}`;

        // Body (transparent) - bodyCenter 사용으로 마이너스 스크롤 대응
        addToGroup(lnBodyKey, [x, bodyCenter], [baseWidth, bodyHeight], color, 0.4, -0.5, 'lnBody');
        // Start and end caps - 높이(두께)에 스케일 적용
        addToGroup(lnNoteKey, [x, y], [baseWidth, heightScale], color, 1, 0, 'note');
        addToGroup(lnNoteKey, [x, endY], [baseWidth, endHeightScale], color, 1, 0, 'note');
        continue;
      }

      // Landmine notes - 높이 스케일 적용
      if (type === 'landmine') {
        const radius = (Math.min(baseWidth / 2, NOTE_HEIGHT / 2) - 1) * heightScale;
        const mineKey = `mine-${color}`;
        addToGroup(mineKey, [x, y], [radius, radius], color, 1, 0, 'circle');
        continue;
      }

      // Invisible notes - 높이 스케일 적용
      if (type === 'invisible') {
        const invisKey = `invis-${lane.color}`;
        addToGroup(invisKey, [x, y], [baseWidth, heightScale], lane.color, 0.15, 0, 'note');
        continue;
      }

      // BGM notes - 높이 스케일 적용
      if (type === 'bgm') {
        addToGroup('bgm', [x, y], [baseWidth - 4, heightScale], '#666666', 1, -1, 'bgm');
        continue;
      }

      // Regular notes - 높이(두께) 스케일 적용
      const regKey = `reg-${color}`;
      addToGroup(regKey, [x, y], [baseWidth, heightScale], color, 1, 0, 'note');
    }

    return groups;
  }, [notes, lanes, beatScale, noteTypeFilter, diffMode, addedSet, removedSet, modifiedSet, laneMap, offsetX, getPositionY, getHeightScale]);

  return (
    <group>
      {Object.entries(noteGroups).map(([key, group]) => {
        const geometry = group.type === 'circle' ? sharedCircleGeometry
          : group.type === 'bgm' ? sharedBgmGeometry
            : group.type === 'lnBody' ? sharedLnBodyGeometry
              : sharedNoteGeometry;

        return (
          <InstancedNotes
            key={key}
            positions={group.positions}
            scales={group.scales}
            color={group.color}
            opacity={group.opacity}
            zIndex={group.zIndex}
            geometry={geometry}
          />
        );
      })}
    </group>
  );
});

/** 타이밍 마커 렌더러 */

/** Canvas로 텍스트 텍스처 생성 */
function createTextTexture(
  text: string,
  color: string,
  fontSize: number = 14,
  fontWeight: string = 'bold'
): { texture: THREE.CanvasTexture; width: number; height: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // 고해상도를 위해 2배 크기로 렌더링
  const scale = 2;
  const font = `${fontWeight} ${fontSize * scale}px "Segoe UI", Arial, sans-serif`;

  // 폰트 설정 후 측정
  ctx.font = font;
  const metrics = ctx.measureText(text);

  // 캔버스 크기 설정 (여유 공간 포함)
  const padding = 8;
  const canvasWidth = Math.ceil(metrics.width) + padding * 2;
  const canvasHeight = Math.ceil(fontSize * scale * 1.4) + padding * 2;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // 배경 (반투명 검정)
  ctx.fillStyle = 'rgba(10, 10, 20, 0.9)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 텍스트 그리기 (폰트 다시 설정 필요 - canvas 크기 변경 후 초기화됨)
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // 외곽선
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(text, padding, canvasHeight / 2);

  // 텍스트
  ctx.fillStyle = color;
  ctx.fillText(text, padding, canvasHeight / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  // 월드 좌표 크기 (캔버스의 1/2 크기로 렌더링)
  return {
    texture,
    width: canvasWidth / scale,
    height: canvasHeight / scale,
  };
}

/** 인스턴스드 BPM 텍스트 렌더러 */
const InstancedBpmTexts = React.memo(function InstancedBpmTexts({
  bpmChanges,
  getMarkerY,
  halfWidth,
  color,
  opacity,
  fontSize,
}: {
  bpmChanges: BpmChange[];
  getMarkerY: (beat: number) => number;
  halfWidth: number;
  color: string;
  opacity: number;
  fontSize: number;
}) {
  // 이전 텍스처 캐시를 추적하는 ref (언마운트 시 정리용)
  const textureCacheRef = useRef<Map<number, { texture: THREE.CanvasTexture; width: number; height: number }> | null>(null);

  // 고유 BPM 값별로 그룹화
  const bpmGroups = useMemo(() => {
    const groups = new Map<number, BpmChange[]>();
    for (const change of bpmChanges) {
      const bpm = change.bpm;
      if (!groups.has(bpm)) {
        groups.set(bpm, []);
      }
      groups.get(bpm)!.push(change);
    }
    return groups;
  }, [bpmChanges]);

  // 각 고유 BPM에 대한 텍스처 생성 (색상, 폰트 크기 변경 시 재생성)
  const textureCache = useMemo(() => {
    const cache = new Map<number, { texture: THREE.CanvasTexture; width: number; height: number }>();
    for (const bpm of bpmGroups.keys()) {
      const bpmText = Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
      const text = `BPM ${bpmText}`;
      const result = createTextTexture(text, color, fontSize);
      cache.set(bpm, result);
    }
    return cache;
  }, [bpmGroups, color, fontSize]);

  // 이전 텍스처 캐시 정리 (새 캐시가 생성된 후에 안전하게 정리)
  useEffect(() => {
    const prevCache = textureCacheRef.current;
    if (prevCache && prevCache !== textureCache) {
      // 이전 캐시의 텍스처들만 정리
      prevCache.forEach(({ texture }) => texture.dispose());
    }
    textureCacheRef.current = textureCache;
  }, [textureCache]);

  // 컴포넌트 언마운트 시에만 최종 정리
  useEffect(() => {
    return () => {
      textureCacheRef.current?.forEach(({ texture }) => texture.dispose());
    };
  }, []);

  return (
    <group>
      {Array.from(bpmGroups.entries()).map(([bpm, changes]) => {
        const cached = textureCache.get(bpm);
        if (!cached) return null;

        const { texture, width, height } = cached;
        const positions = changes.map(c => getMarkerY(c.beat));
        const validPositions = positions.filter(y => Number.isFinite(y) && Math.abs(y) < 1e7);

        if (validPositions.length === 0) return null;

        return (
          <InstancedBpmSprites
            key={`bpm-${bpm}`}
            texture={texture}
            positions={validPositions}
            width={width}
            height={height}
            xOffset={-halfWidth - 45}
            opacity={opacity}
          />
        );
      })}
    </group>
  );
});

/** 단일 BPM 값에 대한 인스턴스드 스프라이트 */
const InstancedBpmSprites = React.memo(function InstancedBpmSprites({
  texture,
  positions,
  width,
  height,
  xOffset,
  opacity,
}: {
  texture: THREE.CanvasTexture;
  positions: number[];
  width: number;
  height: number;
  xOffset: number;
  opacity: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // 이전 리소스를 추적하는 ref (언마운트 시 정리용)
  const resourcesRef = useRef<{
    geometry: THREE.PlaneGeometry | null;
    material: THREE.MeshBasicMaterial | null;
  }>({ geometry: null, material: null });

  // Geometry - width/height 변경 시 재생성
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(width, height);
  }, [width, height]);

  // Material - texture/opacity 변경 시 재생성
  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }, [texture, opacity]);

  // 이전 리소스 정리 (새 리소스가 생성된 후에 안전하게 정리)
  useEffect(() => {
    const prevGeometry = resourcesRef.current.geometry;
    const prevMaterial = resourcesRef.current.material;

    // 이전 geometry가 있고 현재와 다르면 정리
    if (prevGeometry && prevGeometry !== geometry) {
      prevGeometry.dispose();
    }
    // 이전 material이 있고 현재와 다르면 정리
    if (prevMaterial && prevMaterial !== material) {
      prevMaterial.dispose();
    }

    // 현재 리소스를 ref에 저장
    resourcesRef.current.geometry = geometry;
    resourcesRef.current.material = material;
  }, [geometry, material]);

  // 컴포넌트 언마운트 시에만 최종 정리
  useEffect(() => {
    return () => {
      resourcesRef.current.geometry?.dispose();
      resourcesRef.current.material?.dispose();
    };
  }, []);

  // positions 변경 시 인스턴스 매트릭스 업데이트
  useEffect(() => {
    if (!meshRef.current || positions.length === 0) return;

    const matrix = new THREE.Matrix4();
    for (let i = 0; i < positions.length; i++) {
      matrix.makeTranslation(xOffset, positions[i], 3);
      meshRef.current.setMatrixAt(i, matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, xOffset]);

  if (positions.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, positions.length]}
      frustumCulled={false}
    />
  );
});

/** 배치 렌더링을 위한 라인 포인트 수집 */
function collectLinePoints(
  items: { beat: number; color?: string }[],
  getY: (beat: number) => number,
  halfWidth: number,
  defaultColor: string
): { points: [number, number, number][]; color: string }[] {
  // 색상별로 그룹화
  const colorGroups = new Map<string, [number, number, number][]>();

  for (const item of items) {
    const y = getY(item.beat);
    const color = item.color || defaultColor;
    if (!colorGroups.has(color)) {
      colorGroups.set(color, []);
    }
    // segments 모드용: 각 라인의 시작점과 끝점을 연속으로 추가
    colorGroups.get(color)!.push([-halfWidth, y, 2], [halfWidth, y, 2]);
  }

  return Array.from(colorGroups.entries()).map(([color, points]) => ({ points, color }));
}

/** 텍스트 필터링 (STOP, SCROLL용) - 밀도 기반 */
const MAX_TEXT_ELEMENTS = 50; // 텍스트 최대 개수

function filterTextsByDensity<T extends { beat: number }>(
  items: T[],
  getY: (beat: number) => number,
  minPixelSpacing: number
): T[] {
  if (items.length === 0) return [];

  const effectiveSpacing = items.length > 100
    ? Math.max(minPixelSpacing, minPixelSpacing * (items.length / 100))
    : minPixelSpacing;

  const result: T[] = [items[0]];
  let lastY = getY(items[0].beat);

  for (let i = 1; i < items.length && result.length < MAX_TEXT_ELEMENTS; i++) {
    const currentY = getY(items[i].beat);
    if (Math.abs(currentY - lastY) >= effectiveSpacing) {
      result.push(items[i]);
      lastY = currentY;
    }
  }

  return result;
}

function TimingMarkersRenderer({
  bpmChanges,
  stops,
  scrollChanges,
  beatScale,
  baseBeatScale,
  totalWidth,
  showMarkers,
  positioning,
  settings,
}: {
  bpmChanges: BpmChange[];
  stops: StopEvent[];
  scrollChanges: ScrollSpeedChange[];
  beatScale: number;
  baseBeatScale: number;
  totalWidth: number;
  showMarkers: boolean;
  positioning?: Positioning | null;
  settings: TimingMarkerSettings;
}) {
  const halfWidth = totalWidth / 2;
  const rawScaleY = baseBeatScale / beatScale;
  const getTextBoxHeight = (fontSize: number) => fontSize * 1.5;
  const textBoxWidth = 85;
  const MIN_TEXT_SPACING = 50; // 텍스트 최소 간격 (px) - 성능을 위해 넉넉하게

  // 스크롤 기믹 적용 Y 좌표 계산
  const getMarkerY = useCallback((beat: number) => {
    return positioning ? positioning.position(beat) * beatScale : beat * beatScale;
  }, [positioning, beatScale]);

  // 배경색 생성
  const getBackgroundColor = useCallback((color: string) => {
    if (color.includes('ff') && color.includes('88')) return '#001a0a';
    if (color.includes('ff') && color.includes('44')) return '#1a0000';
    if (color.includes('ff') && color.includes('00ff')) return '#001a1a';
    if (color.includes('ff00ff')) return '#1a001a';
    return '#0a0a0a';
  }, []);

  // 오프셋 계산 (필터링된 마커들 사이에서만)
  const calculateYOffset = useCallback((currentBeat: number, items: { beat: number }[], index: number, boxHeight: number) => {
    let offset = 0;
    const minSpacing = boxHeight + 4;
    for (let j = 0; j < index; j++) {
      const prevY = getMarkerY(items[j].beat);
      const currentY = getMarkerY(currentBeat);
      const distance = Math.abs(currentY - prevY);
      if (distance < minSpacing) {
        offset += (minSpacing - distance);
      }
    }
    return offset;
  }, [getMarkerY]);

  // BPM 라인 배치 데이터
  const bpmLineData = useMemo(() => {
    if (!settings.bpm.visible || !settings.bpm.showLine) return [];
    return collectLinePoints(bpmChanges, getMarkerY, halfWidth, settings.bpm.color);
  }, [bpmChanges, getMarkerY, halfWidth, settings.bpm.visible, settings.bpm.showLine, settings.bpm.color]);

  // STOP 라인 배치 데이터
  const stopLineData = useMemo(() => {
    if (!settings.stop.visible || !settings.stop.showLine) return [];
    const points: [number, number, number][] = [];
    for (const stop of stops) {
      const y = getMarkerY(stop.beat);
      const stopHeight = Math.max(stop.duration * beatScale, 4);
      points.push([-halfWidth, y, 2], [halfWidth, y, 2]);
      points.push([-halfWidth, y + stopHeight, 2], [halfWidth, y + stopHeight, 2]);
    }
    return [{ points, color: settings.stop.color }];
  }, [stops, getMarkerY, halfWidth, beatScale, settings.stop.visible, settings.stop.showLine, settings.stop.color]);

  // 스크롤 라인 배치 데이터 (색상별 분리)
  const scrollLineData = useMemo(() => {
    if (!settings.scroll.visible || !settings.scroll.showLine) return [];
    const itemsWithColor = scrollChanges.map(s => ({
      ...s,
      color: s.speed < 0 ? '#ff00ff' : settings.scroll.color
    }));
    return collectLinePoints(itemsWithColor, getMarkerY, halfWidth, settings.scroll.color);
  }, [scrollChanges, getMarkerY, halfWidth, settings.scroll.visible, settings.scroll.showLine, settings.scroll.color]);

  // 텍스트 표시용 필터링된 데이터 (STOP, SCROLL용 - BPM은 인스턴스드 렌더링 사용)
  const filteredStops = useMemo(() =>
    filterTextsByDensity(stops, getMarkerY, MIN_TEXT_SPACING),
    [stops, getMarkerY]
  );
  const filteredScrollChanges = useMemo(() =>
    filterTextsByDensity(scrollChanges, getMarkerY, MIN_TEXT_SPACING),
    [scrollChanges, getMarkerY]
  );

  // Early return after all hooks
  if (!showMarkers) return null;

  return (
    <group>
      {/* 배치된 BPM 라인 */}
      {bpmLineData.map((data, i) => (
        <Line
          key={`bpm-lines-${i}`}
          points={data.points}
          color={data.color}
          lineWidth={2.5}
          transparent
          opacity={settings.bpm.opacity}
          segments
        />
      ))}

      {/* 배치된 STOP 라인 */}
      {stopLineData.map((data, i) => (
        <Line
          key={`stop-lines-${i}`}
          points={data.points}
          color={data.color}
          lineWidth={2}
          transparent
          opacity={settings.stop.opacity}
          segments
        />
      ))}

      {/* 배치된 스크롤 라인 */}
      {scrollLineData.map((data, i) => (
        <Line
          key={`scroll-lines-${i}`}
          points={data.points}
          color={data.color}
          lineWidth={2.5}
          transparent
          opacity={settings.scroll.opacity}
          segments
        />
      ))}

      {/* STOP 배경 영역 - 개수가 적으므로 개별 렌더링 유지 */}
      {settings.stop.visible && settings.stop.showBackground && stops.map((stop, i) => {
        const y = getMarkerY(stop.beat);
        const stopHeight = Math.max(stop.duration * beatScale, 4);
        return (
          <mesh key={`stop-bg-${i}`} position={[0, y + stopHeight / 2, 1]}>
            <planeGeometry args={[totalWidth, stopHeight]} />
            <meshBasicMaterial color={settings.stop.color} opacity={settings.stop.opacity * 0.15} transparent />
          </mesh>
        );
      })}

      {/* BPM 텍스트 - 인스턴스드 렌더링 (고유 BPM 값당 1 draw call) */}
      {settings.bpm.visible && (
        <InstancedBpmTexts
          bpmChanges={bpmChanges}
          getMarkerY={getMarkerY}
          halfWidth={halfWidth}
          color={settings.bpm.color}
          opacity={settings.bpm.opacity}
          fontSize={settings.bpm.fontSize}
        />
      )}

      {/* STOP 텍스트 (밀도 필터링 적용) */}
      {settings.stop.visible && filteredStops.map((stop, i) => {
        const y = getMarkerY(stop.beat);
        const fontSize = settings.stop.fontSize;
        const textBoxHeight = getTextBoxHeight(fontSize);
        const yOffset = calculateYOffset(stop.beat, filteredStops, i, textBoxHeight * rawScaleY);
        const bgColor = getBackgroundColor(settings.stop.color);

        return (
          <group key={`stop-text-${i}`}>
            {settings.stop.showBackground && (
              <mesh position={[-halfWidth - textBoxWidth / 2 - 4, y + yOffset + textBoxHeight / 2, 2.5]}>
                <planeGeometry args={[textBoxWidth, textBoxHeight + 6]} />
                <meshBasicMaterial color={bgColor} opacity={settings.stop.opacity * 0.9} transparent />
              </mesh>
            )}
            <Text
              position={[-halfWidth - 8, y + yOffset + textBoxHeight / 2, 3]}
              fontSize={fontSize}
              color={settings.stop.color}
              anchorX="left"
              anchorY="middle"
              outlineWidth={1}
              outlineColor="#000000"
              fontWeight="bold"
              fillOpacity={settings.stop.opacity}
            >
              STOP {Math.round(stop.duration * 48)}
            </Text>
          </group>
        );
      })}

      {/* 스크롤 텍스트 (밀도 필터링 적용) */}
      {settings.scroll.visible && filteredScrollChanges.map((scroll, i) => {
        const y = getMarkerY(scroll.beat);
        const isNegative = scroll.speed < 0;
        const markerColor = isNegative ? '#ff00ff' : settings.scroll.color;
        const fontSize = settings.scroll.fontSize;
        const textBoxHeight = getTextBoxHeight(fontSize);
        const yOffset = calculateYOffset(scroll.beat, filteredScrollChanges, i, textBoxHeight * rawScaleY);
        const bgColor = isNegative ? '#1a001a' : getBackgroundColor(settings.scroll.color);

        return (
          <group key={`scroll-text-${i}`}>
            {settings.scroll.showBackground && (
              <mesh position={[-halfWidth + textBoxWidth / 2 - 10, y + yOffset + textBoxHeight / 2, 2.5]}>
                <planeGeometry args={[textBoxWidth - 20, textBoxHeight + 6]} />
                <meshBasicMaterial color={bgColor} opacity={settings.scroll.opacity * 0.9} transparent />
              </mesh>
            )}
            <Text
              position={[-halfWidth + 8, y + yOffset + textBoxHeight / 2, 3]}
              fontSize={fontSize}
              color={markerColor}
              anchorX="left"
              anchorY="middle"
              outlineWidth={1}
              outlineColor="#000000"
              fontWeight="bold"
              fillOpacity={settings.scroll.opacity}
            >
              {isNegative ? '↓' : '×'}{Math.abs(scroll.speed).toFixed(2)}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

/** 판정선 - ref 기반으로 부드러운 애니메이션 */
function JudgmentLine({
  width,
  playbackBeatRef,
  beatScale,
  positioning,
}: {
  width: number;
  playbackBeatRef: React.MutableRefObject<number>;
  beatScale: number;
  positioning?: Positioning | null;
}) {
  const lineRef = useRef<Line2 | LineSegments2>(null);
  const halfWidth = width / 2;

  useFrame(() => {
    if (lineRef.current) {
      const beat = playbackBeatRef.current;
      // 스크롤 기믹 적용
      const y = positioning
        ? positioning.position(beat) * beatScale
        : beat * beatScale;
      lineRef.current.position.y = y;
    }
  });

  return (
    <Line
      ref={lineRef}
      points={[[-halfWidth, 0, 5], [halfWidth, 0, 5]]}
      color="#ff6600"
      lineWidth={3}
    />
  );
}

/** 히트 이펙트 데이터 */
interface HitEffect {
  x: number;
  y: number;
  width: number;
  color: string;
  time: number;
}

/** 단일 히트 이펙트 빔 - 직접 mesh ref를 통해 업데이트 */
function HitEffectBeam({ effect, effectKey: _effectKey }: { effect: HitEffect; effectKey: string }) {
  const EFFECT_DURATION = 150;
  const BEAM_HEIGHT = 40;
  // 레인 너비 기반으로 빔 너비 설정 (NOTE_PADDING * 2 만큼 줄임)
  const beamWidth = Math.max(effect.width - 4, 4);

  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Update mesh properties directly in useFrame without triggering React re-renders
  useFrame(() => {
    if (!meshRef.current || !materialRef.current || !groupRef.current) return;

    const now = performance.now();
    const elapsed = now - effect.time;

    if (elapsed >= EFFECT_DURATION) {
      // Hide when animation is complete
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;
    const progress = elapsed / EFFECT_DURATION;

    // Update position (beam moves slightly upward)
    const beamY = effect.y + (BEAM_HEIGHT / 2) * (1 - progress * 0.3);
    groupRef.current.position.set(effect.x, beamY, 8);

    // Update scale (beam shrinks)
    const scaleY = 1 - progress * 0.5;
    meshRef.current.scale.set(1, scaleY, 1);

    // Update opacity (fade out)
    materialRef.current.opacity = (1 - progress) * 0.6;
  });

  return (
    <group ref={groupRef} position={[effect.x, effect.y + BEAM_HEIGHT / 2, 8]}>
      <mesh ref={meshRef}>
        <planeGeometry args={[beamWidth, BEAM_HEIGHT]} />
        <meshBasicMaterial
          ref={materialRef}
          color={effect.color}
          transparent
          opacity={0.6}
        />
      </mesh>
    </group>
  );
}

/** 히트 이펙트 렌더러 - 노트가 판정선에 닿았을 때 키빔 애니메이션 */
const HitEffectsRenderer = React.memo(function HitEffectsRenderer({
  hitNotes,
  version,
}: {
  hitNotes: Map<string, HitEffect>;
  version: number; // Used to trigger re-render when hitNotes changes
}) {
  // Convert Map to array for rendering - this only happens when version changes (new hits)
  // No setState in useFrame anymore - each beam handles its own animation via refs
  const effects = useMemo(() => {
    const result: { key: string; effect: HitEffect }[] = [];
    const now = performance.now();
    hitNotes.forEach((effect, key) => {
      // Only include effects that haven't fully expired
      // (give a small buffer to allow cleanup)
      if (now - effect.time < 200) {
        result.push({ key, effect });
      }
    });
    return result;
  }, [hitNotes, version]);

  return (
    <group>
      {effects.map(({ key, effect }) => (
        <HitEffectBeam key={key} effect={effect} effectKey={key} />
      ))}
    </group>
  );
});

/** 미니맵 컴포넌트 - 전체 채보를 축소해서 보여주는 미리보기 */
function Minimap({
  notes,
  lanes,
  maxBeat,
  currentBeat,
  viewportBeats,
  onClick,
  noteTypeFilter,
  isPlaying,
  judgmentLinePosition,
  positioning,
}: {
  notes: BMSNote[];
  lanes: LaneConfig[];
  maxBeat: number;
  currentBeat: number;
  viewportBeats: number;
  onClick: (beat: number) => void;
  noteTypeFilter: NoteTypeFilter;
  isPlaying: boolean;
  judgmentLinePosition: number;
  positioning?: Positioning | null;
}) {
  // 스크롤 기믹 적용 위치 계산 (미니맵용)
  const getMinimapPosition = useCallback((beat: number) => {
    return positioning ? positioning.position(beat) : beat;
  }, [positioning]);

  // maxPosition 계산 (positioning이 있으면 position 기반)
  const maxPosition = positioning ? positioning.position(maxBeat) : maxBeat;
  const minimapRef = useRef<HTMLDivElement>(null);
  const laneWidth = lanes.reduce((sum, l) => sum + l.width, 0);
  const minimapWidth = Math.min(laneWidth * 0.4, 120);
  const minimapHeight = 300;
  // positioning이 있으면 position 기반 스케일 사용
  const scale = minimapHeight / maxPosition;

  // 노트를 캔버스에 그리기
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 캔버스 클리어
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, minimapWidth, minimapHeight);

    // 레인 구분선
    const laneMap = new Map(lanes.map(l => [l.id, l]));
    const laneScale = minimapWidth / laneWidth;

    lanes.forEach(lane => {
      const x = (lane.x + lane.width) * laneScale;
      ctx.strokeStyle = '#333366';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, minimapHeight);
      ctx.stroke();
    });

    // 마디선
    const totalMeasures = Math.ceil(maxBeat / 4);
    for (let m = 0; m <= totalMeasures; m++) {
      const measurePosition = getMinimapPosition(m * 4);
      const y = minimapHeight - (measurePosition * scale);
      ctx.strokeStyle = m % 4 === 0 ? '#555588' : '#333355';
      ctx.lineWidth = m % 4 === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(minimapWidth, y);
      ctx.stroke();
    }

    // 노트 렌더링
    notes.forEach(note => {
      if (!note.column) return;
      const type = note.noteType || 'playable';
      if (!noteTypeFilter[type as keyof NoteTypeFilter]) return;

      const lane = laneMap.get(note.column);
      if (!lane) return;

      const x = (lane.x + 1) * laneScale;
      const notePosition = getMinimapPosition(note.beat);
      const y = minimapHeight - (notePosition * scale);
      const width = (lane.width - 2) * laneScale;
      const height = note.endBeat !== undefined
        ? Math.abs(getMinimapPosition(note.endBeat) - notePosition) * scale
        : Math.max(2, scale * 0.5);

      // 색상 결정
      let color = lane.color;
      if (type === 'landmine') color = '#ff4444';
      else if (type === 'invisible') color = lane.color + '44';
      else if (type === 'bgm') color = '#666666';

      ctx.fillStyle = color;
      if (note.endBeat !== undefined) {
        // 롱노트
        ctx.fillRect(x, y - height, width, height);
      } else {
        ctx.fillRect(x, y - 1, width, 2);
      }
    });

    // 현재 뷰포트 영역 표시
    // 미니맵 좌표계: Y=0은 상단(maxPosition), Y=minimapHeight는 하단(position 0)
    const viewportHeightMini = viewportBeats * scale;
    const currentPosition = getMinimapPosition(currentBeat);
    const currentBeatY = minimapHeight - (currentPosition * scale);

    // 뷰포트 위치 계산
    // - 스크롤 모드: currentBeat가 뷰포트 중앙
    // - 재생 모드: currentBeat(판정선)이 뷰포트 하단에서 judgmentLinePosition 위치
    let topOffset: number, bottomOffset: number;
    if (isPlaying) {
      // 재생 모드: currentBeat는 뷰포트 상단에서 (1-judgmentLinePosition) 위치
      topOffset = viewportHeightMini * (1 - judgmentLinePosition);
      bottomOffset = viewportHeightMini * judgmentLinePosition;
    } else {
      // 스크롤 모드: currentBeat가 뷰포트 중앙
      topOffset = viewportHeightMini / 2;
      bottomOffset = viewportHeightMini / 2;
    }

    const viewportTopY = currentBeatY - topOffset;
    const viewportBottomY = currentBeatY + bottomOffset;

    // 뷰포트 사각형 그리기
    ctx.fillStyle = 'rgba(255, 102, 0, 0.2)';
    ctx.fillRect(0, viewportTopY, minimapWidth, viewportBottomY - viewportTopY);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, viewportTopY, minimapWidth, viewportBottomY - viewportTopY);

    // 현재 위치 라인 (재생 시 판정선, 스크롤 시 중앙)
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, currentBeatY);
    ctx.lineTo(minimapWidth, currentBeatY);
    ctx.stroke();
  }, [notes, lanes, maxBeat, currentBeat, viewportBeats, minimapWidth, minimapHeight, scale, laneWidth, noteTypeFilter, isPlaying, judgmentLinePosition, getMinimapPosition]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const beat = (minimapHeight - y) / scale;
    onClick(Math.max(0, Math.min(maxBeat, beat)));
  }, [scale, maxBeat, onClick, minimapHeight]);

  return (
    <div
      ref={minimapRef}
      className="absolute right-2 top-2 z-20 rounded-lg overflow-hidden border border-border/50 bg-background/80 backdrop-blur-sm shadow-lg"
    >
      <div className="text-xs text-center py-1 px-2 bg-muted/50 border-b text-muted-foreground flex items-center gap-1 justify-center">
        <MapIcon className="h-3 w-3" />
        Minimap
      </div>
      <canvas
        ref={canvasRef}
        width={minimapWidth}
        height={minimapHeight}
        onClick={handleClick}
        className="cursor-pointer"
        title="클릭하여 해당 위치로 이동"
      />
      <div className="text-xs text-center py-1 px-2 bg-muted/50 border-t text-muted-foreground">
        {Math.floor(currentBeat / 4)}/{Math.floor(maxBeat / 4)} 마디
      </div>
    </div>
  );
}

/** 컬럼 뷰 - 노트 렌더러 (Instanced Mesh 최적화) */
const ColumnNotesRenderer = React.memo(function ColumnNotesRenderer({
  notes,
  lanes,
  beatScale,
  startBeat,
  columnHeight,
  offsetX,
  columnX,
  noteTypeFilter,
  diffMode,
  addedNotes,
  removedNotes,
  modifiedNotes = [],
  positioning,
}: {
  notes: BMSNote[];
  lanes: LaneConfig[];
  beatScale: number;
  startBeat: number;
  columnHeight: number;
  offsetX: number;
  columnX: number;
  noteTypeFilter: NoteTypeFilter;
  diffMode: boolean;
  addedNotes: BMSNote[];
  removedNotes: BMSNote[];
  modifiedNotes?: BMSNote[];
  positioning?: Positioning | null;
}) {
  // 컬럼 내 상대 Y 좌표 계산 (positioning 적용)
  const getColumnY = useCallback((beat: number) => {
    if (positioning) {
      const pos = positioning.position(beat);
      const startPos = positioning.position(startBeat);
      return (pos - startPos) * beatScale + NOTE_HEIGHT / 2;
    }
    return (beat - startBeat) * beatScale + NOTE_HEIGHT / 2;
  }, [positioning, startBeat, beatScale]);
  const laneMap = useMemo(() => new Map(lanes.map(l => [l.id, l])), [lanes]);
  const addedSet = useMemo(() => new Set(addedNotes.map(n => `${n.beat}-${n.column}`)), [addedNotes]);
  const removedSet = useMemo(() => new Set(removedNotes.map(n => `${n.beat}-${n.column}`)), [removedNotes]);
  const modifiedSet = useMemo(() => new Set(modifiedNotes.map(n => `${n.beat}-${n.column}`)), [modifiedNotes]);

  // 노트를 타입/색상별로 그룹화하여 인스턴싱
  const noteGroups = useMemo(() => {
    const groups: Record<string, {
      positions: [number, number][],
      scales: [number, number][],
      color: string,
      opacity: number,
      zIndex: number,
      type: 'note' | 'circle' | 'bgm' | 'lnBody',
    }> = {};

    const addToGroup = (
      key: string,
      pos: [number, number],
      scale: [number, number],
      color: string,
      opacity: number,
      zIndex: number,
      type: 'note' | 'circle' | 'bgm' | 'lnBody'
    ) => {
      if (!groups[key]) {
        groups[key] = { positions: [], scales: [], color, opacity, zIndex, type };
      }
      groups[key].positions.push(pos);
      groups[key].scales.push(scale);
    };

    for (const note of notes) {
      if (!note.column) continue;
      const type = note.noteType || 'playable';
      if (!noteTypeFilter[type as keyof NoteTypeFilter]) continue;

      const lane = laneMap.get(note.column);
      if (!lane) continue;

      const laneX = offsetX + lane.x + NOTE_PADDING + (lane.width - NOTE_PADDING * 2) / 2 - columnX;
      const relativeY = getColumnY(note.beat);
      const width = lane.width - NOTE_PADDING * 2;
      const noteKey = `${note.beat}-${note.column}`;
      const isAdded = diffMode && addedSet.has(noteKey);
      const isRemoved = diffMode && removedSet.has(noteKey);
      const isModified = diffMode && modifiedSet.has(noteKey);
      const color = getNoteColor(note, lane.color, isAdded, isRemoved, isModified);

      // Long notes
      if (note.endBeat !== undefined) {
        const endRelativeY = getColumnY(note.endBeat);
        const endY = Math.min(endRelativeY, columnHeight);
        const startY = Math.max(relativeY, NOTE_HEIGHT / 2);
        const bodyHeight = Math.abs(endY - startY);
        const bodyCenter = (startY + endY) / 2;

        if (bodyHeight > 0) {
          const lnBodyKey = `col-lnBody-${color}`;
          const lnNoteKey = `col-lnNote-${color}`;
          // Body (transparent)
          addToGroup(lnBodyKey, [laneX, bodyCenter], [width, bodyHeight], color, 0.4, -0.5, 'lnBody');
          // Start cap (if in range)
          if (relativeY >= 0 && relativeY < columnHeight) {
            addToGroup(lnNoteKey, [laneX, relativeY], [width, 1], color, 1, 0, 'note');
          }
          // End cap (if in range)
          if (endRelativeY >= 0 && endRelativeY < columnHeight) {
            addToGroup(lnNoteKey, [laneX, endY], [width, 1], color, 1, 0, 'note');
          }
        }
        continue;
      }

      // Skip notes outside range
      if (relativeY < 0 || relativeY > columnHeight) continue;

      // Landmine notes
      if (type === 'landmine') {
        const radius = Math.min(width / 2, NOTE_HEIGHT / 2) - 1;
        const mineKey = `col-mine-${color}`;
        addToGroup(mineKey, [laneX, relativeY], [radius, radius], color, 1, 0, 'circle');
        continue;
      }

      // Invisible notes
      if (type === 'invisible') {
        const invisKey = `col-invis-${lane.color}`;
        addToGroup(invisKey, [laneX, relativeY], [width, 1], lane.color, 0.15, 0, 'note');
        continue;
      }

      // BGM notes
      if (type === 'bgm') {
        addToGroup('col-bgm', [laneX, relativeY], [width - 4, 1], '#666666', 1, -1, 'bgm');
        continue;
      }

      // Regular notes - group by color
      const regKey = `col-reg-${color}`;
      addToGroup(regKey, [laneX, relativeY], [width, 1], color, 1, 0, 'note');
    }

    return groups;
  }, [notes, lanes, beatScale, startBeat, columnHeight, offsetX, columnX, noteTypeFilter, diffMode, addedSet, removedSet, modifiedSet, laneMap, getColumnY]);

  return (
    <group>
      {Object.entries(noteGroups).map(([key, group]) => {
        const geometry = group.type === 'circle' ? sharedCircleGeometry
          : group.type === 'bgm' ? sharedBgmGeometry
            : group.type === 'lnBody' ? sharedLnBodyGeometry
              : sharedNoteGeometry;

        return (
          <InstancedNotes
            key={key}
            positions={group.positions}
            scales={group.scales}
            color={group.color}
            opacity={group.opacity}
            zIndex={group.zIndex}
            geometry={geometry}
          />
        );
      })}
    </group>
  );
});

/** 컬럼 뷰 - 단일 컬럼 렌더러 */
function ColumnRenderer({
  notes,
  lanes,
  beatScale,
  startMeasure,
  endMeasure,
  columnX,
  columnWidth: _columnWidth,
  columnHeight,
  noteTypeFilter,
  diffMode,
  addedNotes,
  removedNotes,
  modifiedNotes = [],
  bpmChanges = [],
  baseBpm = 150,
  gridDivision = 4,
  positioning,
}: {
  notes: BMSNote[];
  lanes: LaneConfig[];
  beatScale: number;
  startMeasure: number;
  endMeasure: number;
  columnX: number;
  columnWidth: number;
  columnHeight: number;
  noteTypeFilter: NoteTypeFilter;
  diffMode: boolean;
  addedNotes: BMSNote[];
  removedNotes: BMSNote[];
  modifiedNotes?: BMSNote[];
  bpmChanges?: BpmChange[];
  baseBpm?: number;
  positioning?: Positioning | null;
  gridDivision?: number;
}) {
  const startBeat = startMeasure * 4;
  const laneWidth = lanes.reduce((sum, l) => sum + l.width, 0);
  const offsetX = columnX - laneWidth / 2;

  // BPM에 따른 그리드 분할 계산
  const getGridDivisionForBpm = useCallback((bpm: number) => {
    const ratio = bpm / baseBpm;
    if (ratio >= 2) return Math.max(1, Math.floor(gridDivision / 2));
    if (ratio >= 1.5) return Math.max(2, Math.floor(gridDivision * 0.75));
    if (ratio <= 0.5) return gridDivision * 2;
    if (ratio <= 0.75) return Math.floor(gridDivision * 1.5);
    return gridDivision;
  }, [gridDivision, baseBpm]);

  // 특정 비트의 BPM 가져오기
  const getBpmAtBeat = useCallback((beat: number) => {
    if (bpmChanges.length === 0) return baseBpm;
    let currentBpm = baseBpm;
    for (const change of bpmChanges) {
      if (change.beat <= beat) currentBpm = change.bpm;
      else break;
    }
    return currentBpm;
  }, [bpmChanges, baseBpm]);

  // 마디별 그리드선 계산
  const measureGrids = useMemo(() => {
    const result: { measure: number; measureY: number; grids: number[] }[] = [];
    for (let i = 0; i <= endMeasure - startMeasure; i++) {
      const measure = startMeasure + i;
      const measureBeat = measure * 4;
      const measureY = i * 4 * beatScale;
      const bpm = getBpmAtBeat(measureBeat);
      const division = getGridDivisionForBpm(bpm);
      const gridStep = 1 / division;
      const grids: number[] = [];
      for (let beat = 0; beat < 4; beat++) {
        for (let g = 1; g < division; g++) {
          grids.push(beat + g * gridStep);
        }
      }
      result.push({ measure, measureY, grids });
    }
    return result;
  }, [startMeasure, endMeasure, beatScale, getBpmAtBeat, getGridDivisionForBpm]);

  return (
    <group position={[columnX, 0, 0]}>
      {/* 컬럼 배경 */}
      {lanes.map((lane) => {
        const color = getLaneBackground(lane);
        const laneX = offsetX + lane.x + lane.width / 2 - columnX;
        return (
          <mesh key={`bg-${lane.id}-${lane.width.toFixed(2)}-${columnHeight}`} position={[laneX, columnHeight / 2, -5]}>
            <planeGeometry args={[lane.width, columnHeight]} />
            <meshBasicMaterial color={color} />
          </mesh>
        );
      })}

      {/* 레인 구분선 */}
      {lanes.map((lane) => {
        const x = offsetX + lane.x + lane.width - columnX;
        return (
          <Line
            key={`divider-${lane.id}-${lane.width.toFixed(2)}-${columnHeight}`}
            points={[[x, 0, -4], [x, columnHeight, -4]]}
            color="#333366"
          />
        );
      })}

      {/* 마디별 교대 배경 */}
      {measureGrids.map(({ measure, measureY }) => {
        if ((measure - startMeasure) % 2 === 1) {
          const measureHeight = 4 * beatScale;
          return (
            <mesh key={`altbg-${measure}-${laneWidth.toFixed(2)}-${measureHeight.toFixed(2)}`} position={[0, measureY + measureHeight / 2, -5.5]}>
              <planeGeometry args={[laneWidth, measureHeight]} />
              <meshBasicMaterial color="#1a1a2e" opacity={0.25} transparent />
            </mesh>
          );
        }
        return null;
      })}

      {/* 마디선, 비트선, 그리드선 - 배치로 최적화 */}
      {useMemo(() => {
        const halfWidth = laneWidth / 2;
        const measureLines: [number, number, number][] = [];
        const beatLines: [number, number, number][] = [];
        const gridLines: [number, number, number][] = [];

        for (const { measureY, grids } of measureGrids) {
          // 마디선
          measureLines.push([-halfWidth, measureY, -3], [halfWidth, measureY, -3]);
          // 비트선
          for (const beat of [1, 2, 3]) {
            const beatY = measureY + beat * beatScale;
            if (beatY < columnHeight) {
              beatLines.push([-halfWidth, beatY, -3], [halfWidth, beatY, -3]);
            }
          }
          // 그리드선
          for (const gridBeat of grids) {
            const gridY = measureY + gridBeat * beatScale;
            if (gridY < columnHeight && gridY > 0) {
              gridLines.push([-halfWidth, gridY, -3], [halfWidth, gridY, -3]);
            }
          }
        }

        return (
          <>
            {measureLines.length > 0 && (
              <Line points={measureLines} color="#6666aa" lineWidth={2} segments />
            )}
            {beatLines.length > 0 && (
              <Line points={beatLines} color="#444466" segments />
            )}
            {gridLines.length > 0 && (
              <Line points={gridLines} color="#2a2a44" lineWidth={0.5} segments />
            )}
          </>
        );
      }, [measureGrids, laneWidth, beatScale, columnHeight])}

      {/* 마디 번호 */}
      {measureGrids.map(({ measure, measureY }) => {
        const halfWidth = laneWidth / 2;
        return (
          <group key={`measure-label-${measure}`}>
            <mesh position={[-halfWidth - 14, measureY, -0.5]}>
              <planeGeometry args={[24, 16]} />
              <meshBasicMaterial color="#1a1a2e" opacity={0.85} transparent />
            </mesh>
            <Text
              position={[-halfWidth - 14, measureY, 0]}
              fontSize={12}
              color="#8888bb"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.3}
              outlineColor="#000000"
            >
              {measure}
            </Text>
          </group>
        );
      })}

      {/* 노트 (InstancedMesh 최적화) */}
      <ColumnNotesRenderer
        notes={notes}
        lanes={lanes}
        beatScale={beatScale}
        startBeat={startBeat}
        columnHeight={columnHeight}
        offsetX={offsetX}
        columnX={columnX}
        noteTypeFilter={noteTypeFilter}
        diffMode={diffMode}
        addedNotes={addedNotes}
        removedNotes={removedNotes}
        modifiedNotes={modifiedNotes}
        positioning={positioning}
      />

      {/* 컬럼 외곽선 */}
      <Line
        points={[
          [-laneWidth / 2, 0, -2],
          [laneWidth / 2, 0, -2],
          [laneWidth / 2, columnHeight, -2],
          [-laneWidth / 2, columnHeight, -2],
          [-laneWidth / 2, 0, -2],
        ]}
        color="#444466"
      />
    </group>
  );
}

/** 컬럼 뷰 전체 렌더러 */
function ColumnsViewRenderer({
  notes,
  lanes,
  beatScale,
  totalMeasures,
  measuresPerColumn,
  columnGap,
  noteTypeFilter,
  diffMode,
  addedNotes,
  removedNotes,
  modifiedNotes = [],
  layout = 'horizontal',
  bpmChanges = [],
  baseBpm = 150,
  gridDivision = 4,
  positioning,
}: {
  notes: BMSNote[];
  lanes: LaneConfig[];
  beatScale: number;
  totalMeasures: number;
  measuresPerColumn: number;
  columnGap: number;
  noteTypeFilter: NoteTypeFilter;
  diffMode: boolean;
  addedNotes: BMSNote[];
  removedNotes: BMSNote[];
  modifiedNotes?: BMSNote[];
  layout?: ColumnsLayout;
  bpmChanges?: BpmChange[];
  baseBpm?: number;
  gridDivision?: number;
  positioning?: Positioning | null;
}) {
  const laneWidth = lanes.reduce((sum, l) => sum + l.width, 0);
  const columnWidth = laneWidth + columnGap;

  // vertical 레이아웃일 때는 전체를 하나의 컬럼으로
  const effectiveMeasuresPerColumn = layout === 'vertical' ? totalMeasures : measuresPerColumn;
  const columnHeight = effectiveMeasuresPerColumn * 4 * beatScale;
  const numColumns = layout === 'vertical' ? 1 : Math.ceil(totalMeasures / measuresPerColumn);

  const columns = useMemo(() => {
    const result = [];
    for (let col = 0; col < numColumns; col++) {
      const startMeasure = col * effectiveMeasuresPerColumn;
      const endMeasure = Math.min(startMeasure + effectiveMeasuresPerColumn, totalMeasures);
      const columnX = col * columnWidth;
      result.push({ startMeasure, endMeasure, columnX });
    }
    return result;
  }, [numColumns, effectiveMeasuresPerColumn, columnWidth, totalMeasures]);

  return (
    <group>
      {columns.map((col, i) => (
        <ColumnRenderer
          key={`col-${i}-mpc${measuresPerColumn}`}
          notes={notes}
          lanes={lanes}
          beatScale={beatScale}
          startMeasure={col.startMeasure}
          endMeasure={col.endMeasure}
          columnX={col.columnX}
          columnWidth={columnWidth}
          columnHeight={columnHeight}
          noteTypeFilter={noteTypeFilter}
          diffMode={diffMode}
          addedNotes={addedNotes}
          removedNotes={removedNotes}
          modifiedNotes={modifiedNotes}
          bpmChanges={bpmChanges}
          baseBpm={baseBpm}
          gridDivision={gridDivision}
          positioning={positioning}
        />
      ))}
    </group>
  );
}

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
}: NoteChartViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const keysoundPlayerRef = useRef<KeysoundPlayer | null>(null);
  const lastPlayedBeatRef = useRef<number>(-1);
  const playedNotesRef = useRef<Set<string>>(new Set());
  const notesRef = useRef(notes);
  // 성능 최적화: 비트 순으로 정렬된 노트 배열 (이진 검색용)
  const sortedNotesRef = useRef<BMSNote[]>([]);
  const keysoundEnabledRef = useRef(showKeysounds);
  const keysoundReadyRef = useRef(false);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const webglCleanupRef = useRef<(() => void) | null>(null); // Cleanup function for WebGL event listeners
  const [webglContextLost, setWebglContextLost] = useState(false);

  // Hit effects state (notes that have just been hit/played)
  const hitNotesRef = useRef<Map<string, HitEffect>>(new Map());
  const [hitNotesVersion, setHitNotesVersion] = useState(0);
  const lanesRef = useRef<LaneConfig[]>([]);
  const laneMapRef = useRef<Map<string, LaneConfig>>(new Map()); // Cached for animation loop
  const beatScaleRef = useRef(beatScale);
  const positioningRef = useRef(positioning);
  const timingRef = useRef(timing);

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [scrollBeat, setScrollBeat] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartBeat, setDragStartBeat] = useState(0);
  const [velocity, setVelocity] = useState(0);
  const [lastY, setLastY] = useState(0);
  const momentumRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [playbackBeat, setPlaybackBeat] = useState(0);
  const playbackBeatRef = useRef(0); // Ref for camera animation (decoupled from React state)
  // Web Audio 기반 정밀 동기화를 위한 refs
  const contextStartTimeRef = useRef(0); // 재생 시작 시점의 AudioContext.currentTime
  const startBeatRef = useRef(0); // 재생 시작 시점의 비트
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<{ loaded: number; total: number }>({ loaded: 0, total: 0 });
  const [keysoundOnlyMode, setKeysoundOnlyMode] = useState(false); // BGM 렌더링 실패 시 keysound만 사용

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // BMS Options
  const [showSettings, setShowSettings] = useState(false);
  const [localNoteFilter, setLocalNoteFilter] = useState<NoteTypeFilter>(noteTypeFilter);
  const [laneOption, setLaneOption] = useState<LaneOption>('normal');
  const [randomSeed] = useState(() => Math.floor(Math.random() * 1000000));
  const [hiSpeed, setHiSpeed] = useState(3);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [localMeasuresPerColumn, setLocalMeasuresPerColumn] = useState(measuresPerColumn);
  const [columnsLayout, setColumnsLayout] = useState<ColumnsLayout>('horizontal');
  const [verticalScrollY, setVerticalScrollY] = useState(0); // 세로 모드 스크롤 위치
  const [scrollSpeed, setScrollSpeed] = useState(1); // 음원 재생 속도와 분리된 스크롤 속도
  const [gridDivision, setGridDivision] = useState(4); // 비트당 그리드 라인 수
  const [showMinimap, setShowMinimap] = useState(true); // 미니맵 표시 여부
  const [chartWidthOverride, setChartWidthOverride] = useState<number | null>(null); // 차트 가로 크기 (px), null이면 자동
  const [chartHeightOverride, setChartHeightOverride] = useState<number | null>(null); // 캔버스 세로 크기 (px), null이면 기본값
  const [aspectRatioLocked, setAspectRatioLocked] = useState(false); // 가로/세로 비율 고정
  const [scaleWidthByScroll, setScaleWidthByScroll] = useState(false); // 스크롤 속도에 따른 노트 높이(두께) 스케일링
  const [timingMarkerSettings, setTimingMarkerSettings] = useState<TimingMarkerSettings>(
    initialTimingMarkerSettings ?? DEFAULT_TIMING_MARKER_SETTINGS
  );

  // Keysound state
  const [keysoundLoading, setKeysoundLoading] = useState(false);
  const [keysoundReady, setKeysoundReady] = useState(false);
  const [keysoundProgress, setKeysoundProgress] = useState({ loaded: 0, total: 0 });
  const [pipelineLatency, setPipelineLatency] = useState<number | null>(null);
  const [schedulingOverhead, setSchedulingOverhead] = useState<number | null>(null);
  const [keysoundEnabled, setKeysoundEnabled] = useState(showKeysounds);

  // Audio settings (defaults, no external preferences store)
  const audioSettings = { equalizer: undefined as EqualizerSettings | undefined, effector: undefined as EffectorSettings | undefined };
  const [keysoundVolume, setKeysoundVolume] = useState(50); // 0-100 scale
  const [keysoundMuted, setKeysoundMuted] = useState(false);
  const [audioDialogOpen, setAudioDialogOpen] = useState(false);
  const [localEqualizer, setLocalEqualizer] = useState<EqualizerSettings>(
    audioSettings.equalizer ?? {
      enabled: false,
      preset: 'flat',
      bands: [
        { frequency: 31, gain: 0 },
        { frequency: 63, gain: 0 },
        { frequency: 125, gain: 0 },
        { frequency: 250, gain: 0 },
        { frequency: 500, gain: 0 },
        { frequency: 1000, gain: 0 },
        { frequency: 2000, gain: 0 },
        { frequency: 4000, gain: 0 },
        { frequency: 8000, gain: 0 },
        { frequency: 16000, gain: 0 },
      ],
    }
  );
  const [localEffector, setLocalEffector] = useState<EffectorSettings>(
    audioSettings.effector ?? {
      compressor: { enabled: false, threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
      reverb: { enabled: false, mix: 0.3, decay: 1.5 },
      stereo: { enabled: false, width: 1 },
    }
  );

  // Keep refs in sync with values for use in animation loop
  useEffect(() => {
    notesRef.current = notes;
    // 성능 최적화: 노트를 비트 순으로 정렬 (이진 검색용)
    sortedNotesRef.current = [...notes].sort((a, b) => a.beat - b.beat);
  }, [notes]);
  useEffect(() => { keysoundEnabledRef.current = keysoundEnabled; }, [keysoundEnabled]);
  useEffect(() => { keysoundReadyRef.current = keysoundReady; }, [keysoundReady]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Fullscreen toggle function
  const toggleFullscreen = useCallback(async () => {
    if (!outerContainerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await outerContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err: unknown) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  // Listen for fullscreen change events (e.g., user presses ESC)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

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
      if (isPlayingRef.current) {
        setIsPlaying(false);
      }
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

  /**
   * Seek 시 활성 키음을 계산하고 offset과 함께 재생
   * 시작점이 seekBeat 이전이지만, 키음 길이가 seekBeat까지 이어지는 노트들을 재생
   *
   * 성능 최적화:
   * - 최대 lookbackTime(초) 이전 노트만 검색 (대부분의 키음은 30초 미만)
   * - duration 캐시 사용으로 반복 조회 방지
   */
  const playActiveKeysoundsAtBeat = useCallback((seekBeat: number, calculateTimeAtBeatFn: (beat: number) => number) => {
    if (!keysoundEnabledRef.current || !keysoundReadyRef.current || !keysoundPlayerRef.current) return;

    const player = keysoundPlayerRef.current;
    const seekTime = calculateTimeAtBeatFn(seekBeat);
    const keysoundsToPlay: Array<{ id: string; offset: number }> = [];

    // 성능 최적화: 최대 30초 이전의 노트만 검색 (대부분의 키음은 30초 미만)
    const maxLookbackTime = 30; // seconds
    const minTime = Math.max(0, seekTime - maxLookbackTime);

    // 키음 duration 캐시 (같은 키음이 여러 번 나올 수 있으므로)
    const durationCache = new Map<string, number>();

    // 노트를 순회하며 현재 위치에서 아직 재생중인 키음 찾기
    for (const note of notesRef.current) {
      if (!note.keysound) continue;

      const noteTime = calculateTimeAtBeatFn(note.beat);

      // 성능 최적화: seekTime 이후의 노트는 스킵
      if (noteTime > seekTime) continue;

      // 성능 최적화: 너무 오래전 노트는 스킵
      if (noteTime < minTime) continue;

      // 키음 duration 조회 (캐시 사용)
      let duration = durationCache.get(note.keysound);
      if (duration === undefined) {
        duration = player.getKeysoundDuration(note.keysound);
        durationCache.set(note.keysound, duration);
      }
      if (duration <= 0) continue; // 버퍼가 없거나 duration을 알 수 없음

      // 현재 시간이 노트 시작 + duration 내에 있으면 아직 재생중
      if (seekTime < noteTime + duration) {
        const offset = seekTime - noteTime;
        keysoundsToPlay.push({ id: note.keysound, offset });

        // 이 노트는 이미 재생됨으로 표시 (중복 재생 방지)
        const noteKey = `${note.beat}-${note.keysound}`;
        playedNotesRef.current.add(noteKey);
      }
    }

    // 활성 키음들을 offset과 함께 재생
    if (keysoundsToPlay.length > 0) {
      player.playMultipleWithOffset(keysoundsToPlay);
    }
  }, []);

  /**
   * 이진 검색: 주어진 beat보다 큰 첫 번째 노트의 인덱스 반환
   * 성능 최적화: O(n) -> O(log n)
   */
  const findFirstNoteIndexAfterBeat = useCallback((sortedNotes: BMSNote[], beat: number): number => {
    let left = 0;
    let right = sortedNotes.length;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (sortedNotes[mid].beat <= beat) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    return left;
  }, []);

  // Keysound trigger function (uses refs to avoid stale closures in animation loop)
  // 성능 최적화: 정렬된 배열과 이진 검색 사용 O(log n + k) where k = notes in range
  const triggerKeysoundsInRange = useCallback((fromBeat: number, toBeat: number) => {
    if (!keysoundEnabledRef.current || !keysoundReadyRef.current || !keysoundPlayerRef.current) return;
    if (toBeat <= fromBeat) return;

    const currentLanes = lanesRef.current;
    const currentBeatScale = beatScaleRef.current;
    const totalWidth = currentLanes.reduce((sum, l) => sum + l.width, 0);
    const offsetX = -totalWidth / 2;
    const laneMap = laneMapRef.current; // Use cached Map (avoid creating new Map every frame)
    const now = performance.now();

    const notesToPlay: string[] = [];
    let hasNewHits = false;

    // 성능 최적화: 이진 검색으로 시작 인덱스 찾기
    const sortedNotes = sortedNotesRef.current;
    const startIndex = findFirstNoteIndexAfterBeat(sortedNotes, fromBeat);

    // 범위 내 노트만 순회 (fromBeat < beat <= toBeat)
    for (let i = startIndex; i < sortedNotes.length; i++) {
      const note = sortedNotes[i];

      // toBeat를 넘어가면 종료
      if (note.beat > toBeat) break;

      const noteKey = `${note.beat}-${note.keysound}`;
      if (playedNotesRef.current.has(noteKey)) continue;

      if (note.keysound) {
        notesToPlay.push(note.keysound);
        playedNotesRef.current.add(noteKey);

        // Add hit effect for visual feedback
        if (note.column) {
          const lane = laneMap.get(note.column);
          if (lane) {
            const x = offsetX + lane.x + NOTE_PADDING + (lane.width - NOTE_PADDING * 2) / 2;
            // 스크롤 기믹 적용
            const currentPositioning = positioningRef.current;
            const y = currentPositioning
              ? currentPositioning.position(note.beat) * currentBeatScale + NOTE_HEIGHT / 2
              : note.beat * currentBeatScale + NOTE_HEIGHT / 2;
            const hitKey = `${note.beat}-${note.column}-${note.keysound}`;
            hitNotesRef.current.set(hitKey, { x, y, width: lane.width, color: lane.color, time: now });
            hasNewHits = true;
          }
        }
      }
    }

    if (notesToPlay.length > 0) {
      keysoundPlayerRef.current.playMultiple(notesToPlay);
    }

    // Trigger re-render for hit effects (no flushSync - let React batch naturally)
    // 성능 최적화: flushSync 제거로 메인 스레드 블로킹 방지
    if (hasNewHits) {
      setHitNotesVersion(v => v + 1);
    }

    // Clean up old hit effects (throttled - only every 10 frames)
    // 성능 최적화: 매 프레임 대신 주기적으로 정리
    const CLEANUP_THRESHOLD = 500;
    if (hitNotesRef.current.size > 0 && Math.random() < 0.1) {
      hitNotesRef.current.forEach((effect, key) => {
        if (now - effect.time > CLEANUP_THRESHOLD) {
          hitNotesRef.current.delete(key);
        }
      });
    }
  }, [findFirstNoteIndexAfterBeat]);

  const baseLanes = useMemo(() => generateLaneConfig(keyMode), [keyMode]);
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

  // Sync refs after variables are declared (for use in animation loop)
  useEffect(() => {
    lanesRef.current = lanes;
    laneMapRef.current = new Map(lanes.map(l => [l.id, l])); // Cache laneMap for animation loop
  }, [lanes]);
  useEffect(() => { beatScaleRef.current = effectiveBeatScale; }, [effectiveBeatScale]);
  useEffect(() => { positioningRef.current = positioning; }, [positioning]);
  useEffect(() => { timingRef.current = timing; }, [timing]);

  const totalHeight = useMemo(() => maxBeat * effectiveBeatScale, [maxBeat, effectiveBeatScale]);
  const progressPercent = viewMode === 'playback' ? (playbackBeat / maxBeat) * 100 : (scrollBeat / maxBeat) * 100;
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

  // 시간 계산 (BPM 변화 고려)
  const calculateTimeAtBeat = useCallback((targetBeat: number): number => {
    if (!bpmChanges || bpmChanges.length === 0) {
      return (targetBeat / bpm) * 60;
    }
    const sortedChanges = [...bpmChanges].sort((a, b) => a.beat - b.beat);
    let totalSeconds = 0;
    let currentBeat = 0;
    let currentBpm = bpm;
    for (const change of sortedChanges) {
      if (change.beat > currentBeat && change.beat <= targetBeat) {
        const beats = change.beat - currentBeat;
        totalSeconds += (beats / currentBpm) * 60;
        currentBeat = change.beat;
      }
      if (change.beat <= targetBeat) {
        currentBpm = change.bpm;
      }
    }
    if (currentBeat < targetBeat) {
      totalSeconds += ((targetBeat - currentBeat) / currentBpm) * 60;
    }
    return totalSeconds;
  }, [bpm, bpmChanges]);

  const totalDuration = useMemo(() => calculateTimeAtBeat(maxBeat), [calculateTimeAtBeat, maxBeat]);
  const currentTime = useMemo(() => calculateTimeAtBeat(playbackBeat), [calculateTimeAtBeat, playbackBeat]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 컬럼 뷰 계산
  const totalMeasures = useMemo(() => Math.ceil(maxBeat / 4), [maxBeat]);
  const columnBeatScale = beatScale * hiSpeed; // 컬럼 뷰에서는 zoomLevel 적용하지 않음

  // columnsLayout에 따른 계산
  const effectiveMeasuresPerColumn = columnsLayout === 'vertical' ? totalMeasures : localMeasuresPerColumn;
  const numColumns = columnsLayout === 'vertical' ? 1 : Math.ceil(totalMeasures / localMeasuresPerColumn);
  const singleColumnHeight = effectiveMeasuresPerColumn * 4 * columnBeatScale;

  // 오디오 (fetch로 먼저 확인 후 로드)
  useEffect(() => {
    if (!audioUrl) {
      console.log('[NoteChartViewer] No audioUrl provided, skipping BGM load');
      setAudioLoaded(false);
      setAudioLoading(false);
      setAudioError(null);
      return;
    }

    console.log('[NoteChartViewer] Loading BGM audio from:', audioUrl);
    setAudioLoading(true);
    setAudioLoaded(false);
    setAudioError(null);
    setAudioProgress({ loaded: 0, total: 0 });
    setKeysoundOnlyMode(false);

    let cancelled = false;
    let blobUrl: string | null = null;
    let audio: HTMLAudioElement | null = null;

    const loadAudio = async () => {
      try {
        // 먼저 fetch로 응답 확인 (서버 에러 시 적절한 에러 메시지 표시)
        const response = await fetch(audioUrl, {
          credentials: 'include',
        });

        if (cancelled) return;

        if (!response.ok) {
          // 서버 에러 응답 처리
          let errorMsg = `Server error: ${response.status}`;
          try {
            const errorData = await response.json();
            if (errorData.message) {
              errorMsg = errorData.message;
            }
          } catch {
            // JSON 파싱 실패 시 기본 메시지 사용
          }
          console.warn(`[NoteChartViewer] BGM fetch failed:`, errorMsg);
          setAudioLoading(false);

          // "too many notes" 또는 "too many keysounds" 에러는 keysound-only 모드로 전환
          // 이는 에러가 아니라 복잡한 BMS 파일에 대한 정상적인 동작
          if (errorMsg.includes('too many notes') || errorMsg.includes('too many keysounds')) {
            console.log('[NoteChartViewer] Complex BMS detected, using keysound-only mode');
            setKeysoundOnlyMode(true);
            setAudioError(null); // 에러가 아닌 정상 동작
          } else {
            setAudioError(errorMsg);
          }
          return;
        }

        // Content-Type 확인
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('audio/')) {
          console.warn(`[NoteChartViewer] Invalid content type: ${contentType}`);
          setAudioLoading(false);
          setAudioError('Invalid audio response from server');
          return;
        }

        // Blob으로 변환 후 Audio 생성 (진행률 추적)
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let blob: Blob;

        if (total > 0 && response.body) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let loaded = 0;

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (cancelled) { reader.cancel(); return; }
            chunks.push(value);
            loaded += value.length;
            setAudioProgress({ loaded, total });
          }

          blob = new Blob(chunks as unknown as BlobPart[], { type: contentType || 'audio/wav' });
        } else {
          blob = await response.blob();
        }
        if (cancelled) return;

        blobUrl = URL.createObjectURL(blob);
        audio = new Audio(blobUrl);
        audioRef.current = audio;

        const handleCanPlay = () => {
          console.log('[NoteChartViewer] BGM audio loaded successfully');
          setAudioLoading(false);
          setAudioLoaded(true);
          setAudioError(null);
        };

        const handleError = () => {
          console.warn('[NoteChartViewer] Audio playback error');
          setAudioLoading(false);
          setAudioLoaded(false);
          setAudioError('Failed to decode audio');
        };

        const handleEnded = () => {
          // 키사운드 모드일 때는 BGM 종료가 재생 종료를 의미하지 않음
          // (Web Audio 타이밍으로 재생이 계속되므로 BGM이 짧아도 차트 끝까지 재생)
          if (keysoundReadyRef.current) return;

          setIsPlaying(false);
          playbackBeatRef.current = maxBeat;
          setPlaybackBeat(maxBeat);
        };

        audio.addEventListener('canplaythrough', handleCanPlay);
        audio.addEventListener('error', handleError);
        audio.addEventListener('ended', handleEnded);
        audio.load();
      } catch (error: unknown) {
        if (cancelled) return;
        const errorMsg = error instanceof Error ? error.message : 'Network error';
        console.warn(`[NoteChartViewer] BGM load error:`, errorMsg);
        setAudioLoading(false);
        setAudioError(errorMsg);
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      audioRef.current = null;
    };
  }, [audioUrl, maxBeat]);

  // 키사운드 로드 (keysoundVolume은 별도 effect에서 처리하므로 의존성에서 제외)
  useEffect(() => {
    console.log('[NoteChartViewer] Keysound init check:', {
      hasKeysounds: !!keysounds,
      keysoundsCount: keysounds ? Object.keys(keysounds).length : 0,
      keysoundBaseUrl,
      sampleKeysounds: keysounds ? Object.entries(keysounds).slice(0, 3) : [],
    });

    if (!keysounds || !keysoundBaseUrl || Object.keys(keysounds).length === 0) {
      console.log('[NoteChartViewer] Skipping keysound load - missing data:', {
        hasKeysounds: !!keysounds,
        hasKeysoundBaseUrl: !!keysoundBaseUrl,
        keysoundsLength: keysounds ? Object.keys(keysounds).length : 0,
      });
      setKeysoundReady(false);
      return;
    }

    // 현재 keysounds 객체의 참조를 캡처 (effect 내에서 사용)
    const currentKeysounds = keysounds;
    const currentBaseUrl = keysoundBaseUrl;
    let cancelled = false;

    const initKeysounds = async () => {
      console.log('[NoteChartViewer] Starting keysound initialization...', {
        baseUrl: currentBaseUrl,
        keysoundsCount: Object.keys(currentKeysounds).length,
      });

      // 이전 플레이어 정리
      if (keysoundPlayerRef.current) {
        console.log('[NoteChartViewer] Disposing previous keysound player');
        keysoundPlayerRef.current.dispose();
        keysoundPlayerRef.current = null;
      }

      setKeysoundLoading(true);
      setKeysoundReady(false);
      setKeysoundProgress({ loaded: 0, total: Object.keys(currentKeysounds).length });

      try {
        const player = new KeysoundPlayer({
          baseUrl: currentBaseUrl,
          keysounds: currentKeysounds,
          volume: 0.8, // 기본값 사용, 로드 후 별도 effect에서 실제 볼륨 설정
          onProgress: (loaded, total) => {
            if (!cancelled) {
              setKeysoundProgress({ loaded, total });
            }
          },
          onReady: () => {
            console.log('[NoteChartViewer] KeysoundPlayer onReady callback fired!');
            if (!cancelled) {
              setKeysoundReady(true);
              setKeysoundLoading(false);
            }
          },
          onError: (error) => {
            console.warn('[NoteChartViewer] Keysound load error:', error);
          },
        });

        // NOTE: Do NOT set keysoundPlayerRef.current until AFTER async init/load
        // to prevent race conditions when cleanup runs mid-initialization
        console.log('[NoteChartViewer] KeysoundPlayer created, calling init()...');
        await player.init();

        // Check if cancelled after init (cleanup may have run during await)
        if (cancelled) {
          console.log('[NoteChartViewer] Cancelled after init, disposing player');
          player.dispose();
          return;
        }

        console.log('[NoteChartViewer] KeysoundPlayer init done, calling load()...');
        await player.load();

        // Check if cancelled after load
        if (cancelled) {
          console.log('[NoteChartViewer] Cancelled after load, disposing player');
          player.dispose();
          return;
        }

        console.log('[NoteChartViewer] KeysoundPlayer load done, isReady:', player.isReady);

        // 진단 정보 출력: 노트에서 참조된 키사운드 vs 로드된 키사운드 비교
        const referencedKeysoundIds = notes
          .filter(note => note.keysound)
          .map(note => note.keysound as string);
        player.logDiagnostics(referencedKeysoundIds);

        // Only NOW set the ref, after all async operations complete successfully
        keysoundPlayerRef.current = player;

        // 로드 완료 후 실제 볼륨 및 오디오 설정 적용
        const effectiveVolume = keysoundMuted ? 0 : keysoundVolume / 100;
        player.setVolume(effectiveVolume);
        console.log('[NoteChartViewer] Volume set to', effectiveVolume);

        // 이퀄라이저 초기 설정 적용
        player.setEqualizerEnabled(localEqualizer.enabled);
        if (localEqualizer.enabled && localEqualizer.preset !== 'custom') {
          player.setEqualizerPreset(localEqualizer.preset);
        }

        // 이펙터 초기 설정 적용
        player.setCompressorEnabled(localEffector.compressor.enabled);
        player.setReverbEnabled(localEffector.reverb.enabled);
        player.setStereoEnabled(localEffector.stereo.enabled);
      } catch (error: unknown) {
        console.error('[NoteChartViewer] Failed to initialize keysound player:', error);
        if (!cancelled) {
          setKeysoundLoading(false);
          setKeysoundReady(false);
        }
      }
    };

    initKeysounds();

    return () => {
      cancelled = true;
      if (keysoundPlayerRef.current) {
        keysoundPlayerRef.current.dispose();
        keysoundPlayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysounds, keysoundBaseUrl]);

  // 키사운드 볼륨 업데이트 (0-100 -> 0-1 변환, mute 반영)
  useEffect(() => {
    if (keysoundPlayerRef.current) {
      const effectiveVolume = keysoundMuted ? 0 : keysoundVolume / 100;
      keysoundPlayerRef.current.setVolume(effectiveVolume);
    }
  }, [keysoundVolume, keysoundMuted]);

  // 이퀄라이저 설정 적용
  useEffect(() => {
    if (keysoundPlayerRef.current) {
      keysoundPlayerRef.current.setEqualizerEnabled(localEqualizer.enabled);
      if (localEqualizer.enabled) {
        // 프리셋이 custom이 아니면 프리셋 적용
        if (localEqualizer.preset !== 'custom') {
          keysoundPlayerRef.current.setEqualizerPreset(localEqualizer.preset);
        } else {
          // custom인 경우 개별 밴드 값 적용
          localEqualizer.bands.forEach((band, index) => {
            keysoundPlayerRef.current?.setEqualizerBand(index, band.gain);
          });
        }
      }
    }
  }, [localEqualizer]);

  // 이펙터 설정 적용
  useEffect(() => {
    if (keysoundPlayerRef.current) {
      // Compressor
      keysoundPlayerRef.current.setCompressorEnabled(localEffector.compressor.enabled);
      if (localEffector.compressor.enabled) {
        keysoundPlayerRef.current.setCompressorSettings({
          threshold: localEffector.compressor.threshold,
          ratio: localEffector.compressor.ratio,
          attack: localEffector.compressor.attack,
          release: localEffector.compressor.release,
        });
      }

      // Reverb
      keysoundPlayerRef.current.setReverbEnabled(localEffector.reverb.enabled);
      if (localEffector.reverb.enabled) {
        keysoundPlayerRef.current.setReverbMix(localEffector.reverb.mix);
        keysoundPlayerRef.current.setReverbDecay(localEffector.reverb.decay);
      }

      // Stereo
      keysoundPlayerRef.current.setStereoEnabled(localEffector.stereo.enabled);
      if (localEffector.stereo.enabled) {
        keysoundPlayerRef.current.setStereoWidth(localEffector.stereo.width);
      }
    }
  }, [localEffector]);

  // 키사운드 재생 속도 업데이트
  useEffect(() => {
    if (keysoundPlayerRef.current) {
      keysoundPlayerRef.current.setPlaybackRate(playbackSpeed);
    }
  }, [playbackSpeed]);

  // 재생 시작/종료 시 상태 동기화
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      // 재생 시작 시 played notes 초기화 (false → true 전환)
      playedNotesRef.current.clear();
      lastPlayedBeatRef.current = playbackBeat;
      console.log('[NoteChartViewer] Playback started, initialized at beat:', playbackBeat);
    } else if (!isPlaying && wasPlayingRef.current) {
      // 재생 종료 시 scrollBeat를 현재 playbackBeat에 동기화 (true → false 전환)
      // 이렇게 하지 않으면 카메라가 재생 전 스크롤 위치로 점프함
      setScrollBeat(playbackBeatRef.current);
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, playbackBeat]);

  // 키사운드 상태 디버깅 (임시)
  useEffect(() => {
    if (keysoundReady && keysoundPlayerRef.current) {
      console.log('[NoteChartViewer] Keysound ready. Sample note keysounds:',
        notes.slice(0, 10).map(n => n.keysound).filter(Boolean));
      console.log('[NoteChartViewer] Keysounds prop keys:',
        keysounds ? Object.keys(keysounds).slice(0, 10) : 'none');
    }
  }, [keysoundReady, notes, keysounds]);

  // Keysound triggering is now done directly in the animation loop for precise timing
  // (see triggerKeysoundsInRange function and animate callback)

  const getBpmAtBeat = useCallback((beat: number): number => {
    if (!bpmChanges || bpmChanges.length === 0) return bpm;
    let currentBpm = bpm;
    for (const change of bpmChanges) {
      if (change.beat <= beat) currentBpm = change.bpm;
      else break;
    }
    return currentBpm;
  }, [bpm, bpmChanges]);

  // 재생 애니메이션 - Web Audio Context 기반 정밀 동기화
  useEffect(() => {
    if (viewMode !== 'playback' || !isPlaying) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioRef.current && !isPlaying) audioRef.current.pause();
      return;
    }

    // Guard against setState after cleanup
    let isCancelled = false;
    let lastUIUpdate = 0;
    let lastLatencySample = 0;
    const UI_UPDATE_INTERVAL = 50; // Update UI state every 50ms (20fps) instead of 60fps
    const LATENCY_SAMPLE_INTERVAL = 500; // Sample latency every 500ms

    // Web Audio Context 기반 타이밍 초기화
    const useWebAudioTiming = keysoundPlayerRef.current && keysoundReady;
    // timing 객체가 있으면 정확한 시간-비트 변환 사용
    const currentTiming = timingRef.current;
    // 시작 시점의 초 단위 시간 계산 (BPM 변화 고려)
    const startTimeInSeconds = currentTiming
      ? currentTiming.beatToSeconds(playbackBeat)
      : playbackBeat * 60 / bpm;

    if (useWebAudioTiming) {
      // Web Audio의 고정밀 타이밍 사용
      contextStartTimeRef.current = keysoundPlayerRef.current!.getContextTime();
      startBeatRef.current = playbackBeat;
    }

    // HTML Audio는 BGM 출력용으로만 사용
    if (audioRef.current && audioLoaded) {
      audioRef.current.currentTime = startTimeInSeconds;
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.play().catch(() => { });
    }

    const animate = (timestamp: number) => {
      // Don't update state if effect has been cleaned up
      if (isCancelled) return;

      let newBeat: number;
      const prevBeat = lastPlayedBeatRef.current;

      if (useWebAudioTiming && keysoundPlayerRef.current) {
        // Web Audio Context 기반 정밀 타이밍 (키사운드와 동기화)
        const contextTime = keysoundPlayerRef.current.getContextTime();
        let elapsedSeconds = (contextTime - contextStartTimeRef.current) * playbackSpeed;

        // Safety check: elapsedSeconds가 음수이거나 비정상적으로 크면 타이밍 기준 리셋
        // (게임 모드 전환 후 컨텍스트 시간이 맞지 않는 경우 방지)
        if (elapsedSeconds < 0 || !Number.isFinite(elapsedSeconds)) {
          contextStartTimeRef.current = contextTime;
          elapsedSeconds = 0;
        }

        const currentTimeInSec = startTimeInSeconds + elapsedSeconds;

        // timing 객체가 있으면 정확한 시간→비트 변환 (BPM 변화 고려)
        if (currentTiming) {
          newBeat = currentTiming.secondsToBeat(currentTimeInSec);
        } else {
          const currentBpm = getBpmAtBeat(startBeatRef.current);
          newBeat = startBeatRef.current + elapsedSeconds * (currentBpm / 60);
        }

        // NaN/Infinity 방지
        if (!Number.isFinite(newBeat) || newBeat < 0) {
          newBeat = prevBeat >= 0 ? prevBeat : 0;
        }

        if (newBeat >= maxBeat) {
          if (!isCancelled) {
            playbackBeatRef.current = maxBeat;
            setPlaybackBeat(maxBeat);
            setIsPlaying(false);
          }
          return;
        }
        // Always update ref for smooth camera animation
        playbackBeatRef.current = newBeat;
        // Only update state periodically for UI elements (progress bar, time display)
        if (!isCancelled && timestamp - lastUIUpdate > UI_UPDATE_INTERVAL) {
          setPlaybackBeat(newBeat);
          lastUIUpdate = timestamp;
        }
      } else if (audioRef.current && audioLoaded) {
        // Fallback: HTML Audio 기반 타이밍 (키사운드 없을 때)
        const audioTime = audioRef.current.currentTime;
        // timing 객체가 있으면 정확한 시간→비트 변환 (BPM 변화 고려)
        if (currentTiming) {
          newBeat = currentTiming.secondsToBeat(audioTime);
        } else {
          newBeat = audioTime / (60 / bpm);
        }
        // NaN/Infinity 방지
        if (!Number.isFinite(newBeat) || newBeat < 0) {
          newBeat = prevBeat >= 0 ? prevBeat : 0;
        }
        if (newBeat >= maxBeat) {
          if (!isCancelled) {
            playbackBeatRef.current = maxBeat;
            setPlaybackBeat(maxBeat);
            setIsPlaying(false);
          }
          return;
        }
        playbackBeatRef.current = newBeat;
        if (!isCancelled && timestamp - lastUIUpdate > UI_UPDATE_INTERVAL) {
          setPlaybackBeat(newBeat);
          lastUIUpdate = timestamp;
        }
      } else {
        // Fallback: requestAnimationFrame 기반 타이밍 (오디오 없을 때)
        if (!lastTimeRef.current) lastTimeRef.current = timestamp;
        const deltaTime = timestamp - lastTimeRef.current;
        lastTimeRef.current = timestamp;

        // timing 객체가 있으면 정확한 시간 기반 계산
        if (currentTiming) {
          const prevTimeInSec = prevBeat >= 0 ? currentTiming.beatToSeconds(prevBeat) : 0;
          const newTimeInSec = prevTimeInSec + (deltaTime / 1000) * playbackSpeed;
          newBeat = currentTiming.secondsToBeat(newTimeInSec);
        } else {
          const currentBpm = getBpmAtBeat(prevBeat >= 0 ? prevBeat : 0);
          newBeat = (prevBeat >= 0 ? prevBeat : 0) + (deltaTime * playbackSpeed) / (60000 / currentBpm);
        }

        // NaN/Infinity 방지
        if (!Number.isFinite(newBeat) || newBeat < 0) {
          newBeat = prevBeat >= 0 ? prevBeat : 0;
        }

        if (newBeat >= maxBeat) {
          if (!isCancelled) {
            playbackBeatRef.current = maxBeat;
            setPlaybackBeat(maxBeat);
            setIsPlaying(false);
          }
          return;
        }
        playbackBeatRef.current = newBeat;
        if (!isCancelled && timestamp - lastUIUpdate > UI_UPDATE_INTERVAL) {
          setPlaybackBeat(newBeat);
          lastUIUpdate = timestamp;
        }
      }

      // Trigger keysounds directly in animation loop for precise timing
      if (prevBeat >= 0 && newBeat > prevBeat) {
        triggerKeysoundsInRange(prevBeat, newBeat);
      }
      lastPlayedBeatRef.current = newBeat;

      // Sample keysound latency periodically
      if (keysoundPlayerRef.current && timestamp - lastLatencySample > LATENCY_SAMPLE_INTERVAL) {
        lastLatencySample = timestamp;
        const pipeline = keysoundPlayerRef.current.getPipelineLatency();
        const overhead = keysoundPlayerRef.current.getSchedulingOverhead();
        if (pipeline !== null) setPipelineLatency(pipeline);
        if (overhead !== null) setSchedulingOverhead(overhead);
      }

      if (!isCancelled) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    lastTimeRef.current = 0;
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      isCancelled = true;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [viewMode, isPlaying, bpm, maxBeat, audioLoaded, keysoundReady, getBpmAtBeat, playbackSpeed, triggerKeysoundsInRange]);

  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
      if (keysoundPlayerRef.current) {
        keysoundPlayerRef.current.stopAll();
        keysoundPlayerRef.current.resetLatencySamples();
      }
      setPipelineLatency(null);
      setSchedulingOverhead(null);
    } else {
      // 브라우저 정책상 AudioContext는 사용자 상호작용 후에만 재생 가능
      // 재생 시작 전에 resume 호출
      if (keysoundPlayerRef.current && keysoundReady) {
        await keysoundPlayerRef.current.resume();
      }
      if (playbackBeat >= maxBeat) {
        playbackBeatRef.current = 0;
        setPlaybackBeat(0);
        setScrollBeat(0);
        playedNotesRef.current.clear();
        lastPlayedBeatRef.current = 0;
        if (audioRef.current) audioRef.current.currentTime = 0;
      } else if (playbackBeat > 0) {
        // 중간 위치에서 재생 시작 시, 해당 위치에서 아직 재생 중인 키음들을 offset과 함께 재생
        playedNotesRef.current.clear();
        lastPlayedBeatRef.current = playbackBeat;
        if (keysoundReady && keysoundPlayerRef.current) {
          playActiveKeysoundsAtBeat(playbackBeat, calculateTimeAtBeat);
        }
      }
      setIsPlaying(true);
    }
  }, [isPlaying, playbackBeat, maxBeat, keysoundReady, playActiveKeysoundsAtBeat, calculateTimeAtBeat]);

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

  // 모멘텀
  const applyMomentum = useCallback(() => {
    if (Math.abs(velocity) < 0.01) { setVelocity(0); return; }
    setScrollBeat(prev => Math.max(0, Math.min(maxBeat, prev + velocity)));
    setVelocity(prev => prev * 0.92);
    momentumRef.current = requestAnimationFrame(applyMomentum);
  }, [velocity, maxBeat]);

  useEffect(() => {
    if (!isDragging && Math.abs(velocity) > 0.01) {
      momentumRef.current = requestAnimationFrame(applyMomentum);
    }
    return () => { if (momentumRef.current) cancelAnimationFrame(momentumRef.current); };
  }, [isDragging, velocity, applyMomentum]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (viewMode !== 'scroll') return;
    if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); setVelocity(0); }
    setIsDragging(true);
    setDragStartY(e.clientY);
    setDragStartBeat(scrollBeat);
    setLastY(e.clientY);
  }, [viewMode, scrollBeat]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || viewMode !== 'scroll') return;
    const deltaY = dragStartY - e.clientY;
    // scrollSpeed 적용: 높을수록 더 빠르게 스크롤
    const scrollSensitivity = effectiveBeatScale / scrollSpeed;
    setScrollBeat(Math.max(0, Math.min(maxBeat, dragStartBeat + deltaY / scrollSensitivity)));
    setVelocity((lastY - e.clientY) / scrollSensitivity);
    setLastY(e.clientY);
  }, [isDragging, dragStartY, dragStartBeat, viewMode, effectiveBeatScale, maxBeat, lastY, scrollSpeed]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  // Native event handlers for passive: false support
  const handleNativeTouchStart = useCallback((e: TouchEvent) => {
    if (viewMode !== 'scroll') return;
    if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); setVelocity(0); }
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStartY(touch.clientY);
    setDragStartBeat(scrollBeat);
    setLastY(touch.clientY);
  }, [viewMode, scrollBeat]);

  const handleNativeTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || viewMode !== 'scroll') return;
    e.preventDefault();
    const touch = e.touches[0];
    const deltaY = dragStartY - touch.clientY;
    // scrollSpeed 적용: 높을수록 더 빠르게 스크롤
    const scrollSensitivity = effectiveBeatScale / scrollSpeed;
    setScrollBeat(Math.max(0, Math.min(maxBeat, dragStartBeat + deltaY / scrollSensitivity)));
    setVelocity((lastY - touch.clientY) / scrollSensitivity * 1.5);
    setLastY(touch.clientY);
  }, [isDragging, dragStartY, dragStartBeat, viewMode, effectiveBeatScale, maxBeat, lastY, scrollSpeed]);

  const handleNativeTouchEnd = useCallback(() => setIsDragging(false), []);

  const handleNativeWheel = useCallback((e: WheelEvent) => {
    // Ctrl+wheel: zoom (prevent default to avoid browser zoom)
    if (e.ctrlKey) {
      e.preventDefault();
      // Smooth zoom with smaller increments
      const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05;
      setZoomLevel(prev => Math.max(0.25, Math.min(4, prev * zoomFactor)));
      return;
    }
    // Only handle scroll in scroll mode
    if (viewMode !== 'scroll') return;
    // Prevent default only for vertical scroll to allow horizontal scroll and other interactions
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
    }
    if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); setVelocity(0); }
    // scrollSpeed 적용: 높을수록 더 빠르게 스크롤
    const scrollSensitivity = effectiveBeatScale / scrollSpeed;
    setScrollBeat(prev => Math.max(0, Math.min(maxBeat, prev + e.deltaY / scrollSensitivity)));
  }, [viewMode, effectiveBeatScale, maxBeat, scrollSpeed]);

  // Register touch/wheel events with passive: false
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleNativeTouchStart, { passive: true });
    container.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    container.addEventListener('touchend', handleNativeTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleNativeTouchEnd, { passive: true });
    container.addEventListener('wheel', handleNativeWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleNativeTouchStart);
      container.removeEventListener('touchmove', handleNativeTouchMove);
      container.removeEventListener('touchend', handleNativeTouchEnd);
      container.removeEventListener('touchcancel', handleNativeTouchEnd);
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, [handleNativeTouchStart, handleNativeTouchMove, handleNativeTouchEnd, handleNativeWheel]);

  // Keyboard shortcuts (only when component is focused)
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if not focused on the chart viewer or if focused on input elements
      if (!isFocused) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (viewMode === 'playback') togglePlayback();
          break;
        case 'ArrowUp':
        case 'ArrowRight':
          e.preventDefault();
          if (viewMode === 'scroll' || (viewMode === 'playback' && !isPlaying)) {
            const currentBeat = viewMode === 'scroll' ? scrollBeat : playbackBeat;
            const newBeat = Math.min(maxBeat, currentBeat + 4);
            playbackBeatRef.current = newBeat;
            setPlaybackBeat(newBeat);
            setScrollBeat(newBeat);
          }
          break;
        case 'ArrowDown':
        case 'ArrowLeft':
          e.preventDefault();
          if (viewMode === 'scroll' || (viewMode === 'playback' && !isPlaying)) {
            const currentBeat = viewMode === 'scroll' ? scrollBeat : playbackBeat;
            const newBeat = Math.max(0, currentBeat - 4);
            playbackBeatRef.current = newBeat;
            setPlaybackBeat(newBeat);
            setScrollBeat(newBeat);
          }
          break;
        case 'Home':
          e.preventDefault();
          setScrollBeat(0);
          playbackBeatRef.current = 0;
          setPlaybackBeat(0);
          break;
        case 'End':
          e.preventDefault();
          setScrollBeat(maxBeat);
          playbackBeatRef.current = maxBeat;
          setPlaybackBeat(maxBeat);
          break;
        case 'Equal':
        case 'NumpadAdd':
          e.preventDefault();
          setZoomLevel(prev => Math.min(4, prev * 1.25));
          break;
        case 'Minus':
        case 'NumpadSubtract':
          e.preventDefault();
          setZoomLevel(prev => Math.max(0.25, prev * 0.8));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, maxBeat, isPlaying, togglePlayback, playbackBeat, scrollBeat, isFocused]);

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
                title="기본값으로 리셋"
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
              title={aspectRatioLocked ? "비율 고정 해제" : "가로/세로 비율 고정"}
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
                title="기본값으로 리셋"
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
                title="BPM 색상"
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
                title={`투명도: ${Math.round(timingMarkerSettings.bpm.opacity * 100)}%`}
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
                title="STOP 색상"
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
                title={`투명도: ${Math.round(timingMarkerSettings.stop.opacity * 100)}%`}
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
                title="SCROLL 색상"
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
                title={`투명도: ${Math.round(timingMarkerSettings.scroll.opacity * 100)}%`}
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
              <NotesRenderer notes={notes} lanes={lanes} beatScale={effectiveBeatScale} noteTypeFilter={localNoteFilter} diffMode={diffMode} addedNotes={addedNotes} removedNotes={removedNotes} modifiedNotes={modifiedNotes} positioning={positioning} scaleWidthByScroll={scaleWidthByScroll} noteScale={noteScale} />
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
            ? (keysoundReady ? `재생 중 (${playbackSpeed}x)` : audioLoaded ? `재생 중 (BGM, ${playbackSpeed}x)` : keysoundOnlyMode ? `재생 중 (Keysound, ${playbackSpeed}x)` : `재생 중 (BPM 기준, ${playbackSpeed}x)`)
            : "Space로 재생 • 클릭으로 이동")}
          {viewMode === 'scroll' && "드래그/스크롤로 탐색 • Ctrl+휠로 줌 • 방향키로 이동"}
          {isFullscreen && " • ESC로 전체화면 종료"}
          {viewMode === 'columns' && (columnsLayout === 'vertical'
            ? `세로 전체 뷰 • ${totalMeasures}마디 • 세로 스크롤로 탐색`
            : `가로 컬럼 뷰 • ${totalMeasures}마디 (${numColumns}컬럼, ${localMeasuresPerColumn}마디/컬럼) • 가로 스크롤로 탐색`)}
        </span>
        <div className="flex items-center gap-2">
          {viewMode === 'playback' && isPlaying && keysoundReady && (pipelineLatency !== null || schedulingOverhead !== null) && (
            <span
              className="text-blue-400"
              title={`파이프라인: baseLatency+outputLatency (AudioContext→스피커)\n스케줄링: playAudioSync 평균 처리 시간 (최근 100회)`}
            >
              {pipelineLatency !== null ? pipelineLatency.toFixed(1) : '?'}
              {schedulingOverhead !== null ? ` + ${schedulingOverhead.toFixed(2)}` : ''}ms
            </span>
          )}
          {viewMode === 'playback' && bpmChanges && bpmChanges.length > 0 && (
            <span className="text-orange-400">BPM {Math.round(getBpmAtBeat(playbackBeat))}</span>
          )}
          {viewMode === 'playback' && (!bpmChanges || bpmChanges.length === 0) && (
            <span className="text-orange-400">BPM {bpm}</span>
          )}
          {laneOption !== 'normal' && <span className="text-green-400 capitalize">{laneOption}</span>}
          {hiSpeed !== 1 && <span className="text-cyan-400">HS ×{hiSpeed}</span>}
        </div>
      </div>
    </div>
  );
}
