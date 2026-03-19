/**
 * useBmsChart Hook
 *
 * BMS 파일을 로드하고 파싱하여 차트 정보를 제공하는 훅
 */

import { useState, useCallback } from 'react';
import { BMSParser, BMSNote, Positioning, Timing } from '@rhythm-archive/bms-core';
import type { ISongInfoData } from '@rhythm-archive/bms-core';
import type { KeyMode } from './NoteChartViewer';

/** BPM 변경 이벤트 */
export interface BpmChange {
  beat: number;
  bpm: number;
}

/** STOP 이벤트 */
export interface StopEvent {
  beat: number;
  /** 정지 시간 (beats) */
  duration: number;
}

/** 스크롤 속도 변경 이벤트 */
export interface ScrollSpeedChange {
  beat: number;
  /** 스크롤 속도 배율 (1.0 = 기본) */
  speed: number;
}

export interface BmsChartInfo {
  /** 곡 정보 */
  songInfo: ISongInfoData | null;
  /** 파싱된 노트 배열 */
  notes: BMSNote[];
  /** 키 모드 */
  keyMode: KeyMode;
  /** 총 비트 수 */
  totalBeats: number;
  /** BPM 정보 */
  bpm: {
    initial: number;
    min: number;
    max: number;
  };
  /** BPM 변경 목록 */
  bpmChanges: BpmChange[];
  /** LN 타입 */
  lnType: number;
  /** 노트 통계 */
  stats: {
    total: number;
    scratch: number;
    longNotes: number;
    landmines: number;
    invisible: number;
  };
  /** STOP 정보 */
  stops: StopEvent[];
  /** 스크롤 속도 변경 정보 */
  scrollChanges: ScrollSpeedChange[];
  /** 프리뷰/배경음악 파일 경로 */
  previewAudio: string | null;
  /** 키사운드 매핑 (ID -> 파일명) */
  keysounds: Record<string, string>;
  /** Positioning 객체 (스크롤 위치 계산용) */
  positioning: Positioning | null;
  /** Timing 객체 (시간-비트 변환용) */
  timing: Timing | null;
}

export interface UseBmsChartOptions {
  /** 기본 URL */
  baseUrl: string;
  /** BMS 파일 경로 */
  bmsPath?: string;
}

export interface UseBmsChartState {
  /** 차트 정보 */
  chart: BmsChartInfo | null;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 */
  error: string | null;
  /** 로드 완료 여부 */
  isLoaded: boolean;
}

export interface UseBmsChartControls {
  /** 차트 로드 */
  load: (path?: string) => Promise<void>;
  /** 초기화 */
  reset: () => void;
}

export type UseBmsChartReturn = [UseBmsChartState, UseBmsChartControls];

/**
 * 채널에서 키 모드 감지
 * 노트가 사용하는 컬럼을 분석하여 적절한 키 모드를 반환
 *
 * 감지 우선순위:
 * 1. 헤더 확장 명령 (#6K, #4K)
 * 2. DP (2P 컬럼 사용 여부)
 * 3. 키보드 스타일 (SC/FZ 없이 숫자 컬럼만 사용)
 * 4. IIDX 스타일 (SC/FZ 포함)
 *
 * 6K/4K 감지 (7+1 구조 기반):
 * - 6K: 컬럼 1,2,3,5,6,7 사용, 4번과 SC 미사용
 * - 4K: 컬럼 1,2,6,7 또는 유사 패턴, SC 미사용
 */
export function detectKeyMode(notes: BMSNote[], headers?: { get: (key: string) => string | undefined }): KeyMode {
  // 헤더 확장 명령 확인 (#6K, #4K)
  if (headers) {
    const has6K = headers.get('6k') || headers.get('6K');
    const has4K = headers.get('4k') || headers.get('4K');
    if (has6K) return '6K';
    if (has4K) return '4K';
  }
  const usedColumns = new Set<string>();

  for (const note of notes) {
    if (note.column) {
      usedColumns.add(note.column);
    }
  }

  // 노트가 없는 빈 차트 → 가장 일반적인 7K 반환
  if (usedColumns.size === 0) return '7K';

  // Check for high column numbers (for keyboard modes like 24K, 48K)
  const maxNumericColumn = Array.from(usedColumns)
    .filter(col => /^\d+$/.test(col))
    .map(col => parseInt(col, 10))
    .reduce((max, num) => Math.max(max, num), 0);

  // Scratch/FZ detection (IIDX style indicators)
  const hasScratch = usedColumns.has('SC');
  const hasScratch2 = usedColumns.has('SC2');
  const hasFZ = usedColumns.has('FZ');
  const hasFZ2 = usedColumns.has('FZ2');
  const hasIIDXSpecialLanes = hasScratch || hasScratch2 || hasFZ || hasFZ2;

  // 2P side columns for DP detection
  // For IIDX DP: columns 10-14, SC2, FZ2 (columns 8-9 are ambiguous — could be 8K/9K SP)
  // For Keyboard DP: columns 10+
  const iidxDP2PColumns = ['10', '11', '12', '13', '14', 'SC2', 'FZ2'];
  const hasIIDX2P = iidxDP2PColumns.some(col => usedColumns.has(col));
  const hasKeyboard2P = maxNumericColumn >= 10;  // Keyboard DP uses columns 10+

  // ============================================
  // DP (Double Play) modes
  // ============================================
  if (hasIIDX2P || hasKeyboard2P) {
    // IIDX DP 스타일 (SC/SC2 사용): 14K 또는 10K
    // IIDX DP에서 컬럼 8-14는 2P 사이드 (7키+스크래치)
    if (hasIIDXSpecialLanes) {
      // 14K: 7 keys + scratch each side (uses columns 6, 7, 13, 14)
      if (usedColumns.has('6') || usedColumns.has('7') || usedColumns.has('13') || usedColumns.has('14')) {
        return '14K';
      }
      // 10K: 5 keys + scratch each side
      return '10K';
    }

    // Keyboard DP 스타일 (SC 없음): 컬럼 번호로 판단
    // 48K: keyboard DP (24 keys each side)
    if (maxNumericColumn >= 24) return '48K';

    // 24K: keyboard DP (12 keys each side, columns 1-12 on each side)
    // IIDX DP에서 컬럼 13, 14는 2P의 6, 7키이므로 제외
    if (maxNumericColumn >= 18) return '24K';

    // 18K: keyboard DP (9 keys each side, no scratch)
    if (maxNumericColumn >= 10) return '18K';

    // 12K: keyboard 6 keys each side (no scratch)
    return '12K';
  }

  // ============================================
  // SP (Single Play) modes
  // ============================================

  // IIDX SP 스타일 (SC/FZ 사용): 실제 사용된 키 컬럼 수로 판별
  if (hasIIDXSpecialLanes) {
    // 1P 키 컬럼 (1-7) 중 실제로 사용된 개수 카운트
    const keyColumns = ['1', '2', '3', '4', '5', '6', '7'];
    const usedKeyCount = keyColumns.filter(col => usedColumns.has(col)).length;

    // 사용된 키 개수에 따라 키 모드 반환
    if (usedKeyCount >= 7) return '7K';
    if (usedKeyCount === 6) return '6K';
    if (usedKeyCount === 5) return '5K';
    if (usedKeyCount <= 4) return '4K';

    return '5K'; // fallback
  }

  // Keyboard SP 스타일 (SC 없음): 컬럼 번호로 판단
  // 48K SP (keyboard)
  if (maxNumericColumn >= 24) return '48K';

  // 24K SP (keyboard) - columns 1-24
  if (maxNumericColumn >= 12) return '24K';

  // 9K: PMS style or keyboard 9 keys
  if (maxNumericColumn >= 9 || usedColumns.has('9')) return '9K';

  // 8K: 8 keys keyboard style
  if (maxNumericColumn >= 8) return '8K';

  // ============================================
  // 7+1 구조 기반 6K/4K 감지 (SC 없음)
  // 6K: 컬럼 1,2,3,5,6,7 사용 (4번 미사용)
  // 4K: 컬럼 1,2,4,5 사용 (3,6,7번 미사용)
  // ============================================
  if (maxNumericColumn >= 5) {
    const hasColumn3 = usedColumns.has('3');
    const hasColumn4 = usedColumns.has('4');
    const hasColumn6 = usedColumns.has('6');
    const hasColumn7 = usedColumns.has('7');
    const usedKeyColumns = ['1', '2', '3', '4', '5', '6', '7'].filter(col => usedColumns.has(col));
    const usedKeyCount = usedKeyColumns.length;

    // 4K 패턴: 컬럼 1,2,4,5 사용, 3,6,7 미사용
    if (!hasColumn3 && !hasColumn6 && !hasColumn7 && usedKeyCount === 4) {
      return '4K';
    }

    // 6K 패턴: 컬럼 1,2,3,5,6,7 사용, 4번 미사용
    if (!hasColumn4 && usedKeyCount === 6) {
      return '6K';
    }

    // 7K: 7 keys keyboard style
    if (maxNumericColumn >= 7) return '7K';

    // 6K: 6 keys keyboard style
    if (maxNumericColumn >= 6) return '6K';

    // 5K: 5 keys keyboard style
    return '5K';
  }

  // 5K: 5 keys keyboard style
  if (maxNumericColumn >= 5) return '5K';

  // 4K: 4 keys keyboard style
  return '4K';
}

/**
 * 총 비트 수 계산
 */
function calculateTotalBeats(notes: BMSNote[]): number {
  let maxBeat = 0;
  for (const note of notes) {
    const endBeat = note.endBeat ?? note.beat;
    if (endBeat > maxBeat) maxBeat = endBeat;
  }
  return Math.ceil(maxBeat) + 4;
}

/**
 * 노트 통계 계산
 */
function calculateStats(notes: BMSNote[]) {
  let total = 0;
  let scratch = 0;
  let longNotes = 0;
  let landmines = 0;
  let invisible = 0;

  for (const note of notes) {
    if (!note.column) continue;

    const noteType = note.noteType || 'playable';

    // 노트 타입별 카운트
    if (noteType === 'landmine') {
      landmines++;
    } else if (noteType === 'invisible') {
      invisible++;
    } else if (noteType === 'playable') {
      total++;

      if (note.column === 'SC' || note.column === 'SC2') {
        scratch++;
      }

      if (note.endBeat !== undefined) {
        longNotes++;
      }
    }
  }

  return { total, scratch, longNotes, landmines, invisible };
}

/**
 * BMS 차트 로드 및 파싱 훅
 */
export function useBmsChart(options: UseBmsChartOptions): UseBmsChartReturn {
  const { baseUrl, bmsPath: initialPath } = options;

  const [state, setState] = useState<UseBmsChartState>({
    chart: null,
    isLoading: false,
    error: null,
    isLoaded: false,
  });

  const load = useCallback(async (path?: string) => {
    const bmsPath = path || initialPath;
    if (!bmsPath) {
      setState(prev => ({
        ...prev,
        error: 'No BMS file path provided',
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const parser = new BMSParser();

      // BMS 파일 로드 - Use query parameter for files with special characters to avoid reverse proxy issues
      const hasSpecialChars = /[#[\]%]/.test(bmsPath);
      const url = hasSpecialChars
        ? `${baseUrl}?path=${encodeURIComponent(bmsPath)}`
        : `${baseUrl}/${bmsPath.split('/').map(segment => encodeURIComponent(segment)).join('/')}`;
      const bmsContent = await parser.fetchFromUrl(url);

      // 파싱 (디버그 로그는 compiler에서 출력)
      const chart = parser.compileString(bmsContent);
      const songInfo = parser.getSongInfo();
      const notesObj = parser.getNotes();

      if (!notesObj) {
        throw new Error('Failed to parse notes');
      }

      const notes = notesObj.all();

      // BPM 정보 추출
      const bpmHeader = chart.headers.get('bpm');
      const initialBpm = bpmHeader ? parseFloat(bpmHeader) : 130;
      let minBpm = initialBpm;
      let maxBpm = initialBpm;

      // BPM 변경 이벤트 수집
      const bpmChanges: BpmChange[] = [];
      const objects = chart.objects.allSorted();

      for (const obj of objects) {
        // 채널 03: 직접 16진수 BPM 값
        if (obj.channel === '03') {
          const bpmValue = parseInt(obj.value, 16);
          if (!isNaN(bpmValue) && bpmValue > 0) {
            const beat = chart.measureToBeat(obj.measure, obj.fraction);
            bpmChanges.push({ beat, bpm: bpmValue });
            if (bpmValue < minBpm) minBpm = bpmValue;
            if (bpmValue > maxBpm) maxBpm = bpmValue;
          }
        }
        // 채널 08: #BPMxx 참조
        else if (obj.channel === '08') {
          const bpmValue = parseFloat(chart.headers.get('bpm' + obj.value) || '');
          if (!isNaN(bpmValue) && bpmValue > 0) {
            const beat = chart.measureToBeat(obj.measure, obj.fraction);
            bpmChanges.push({ beat, bpm: bpmValue });
            if (bpmValue < minBpm) minBpm = bpmValue;
            if (bpmValue > maxBpm) maxBpm = bpmValue;
          }
        }
      }

      // BPM 변화 확인 (헤더에서 추가로)
      chart.headers.each((key, value) => {
        if (key.toLowerCase().startsWith('bpm') && key.toLowerCase() !== 'bpm') {
          const bpmValue = parseFloat(value);
          if (!isNaN(bpmValue)) {
            if (bpmValue < minBpm) minBpm = bpmValue;
            if (bpmValue > maxBpm) maxBpm = bpmValue;
          }
        }
      });

      // LN 타입 확인
      const lnTypeHeader = chart.headers.get('lntype');
      const lnType = lnTypeHeader ? parseInt(lnTypeHeader) : 1;

      // STOP 정보 수집 (채널 09)
      const stops: StopEvent[] = [];
      for (const obj of objects) {
        if (obj.channel === '09') {
          // STOP 값은 #STOPxx 헤더를 참조
          const stopHeader = chart.headers.get('stop' + obj.value);
          if (stopHeader) {
            // STOP 값은 1/192 비트 단위 (음수 값도 지원 - 마이너스 스탑 기믹)
            const stopValue = parseInt(stopHeader, 10) / 192;
            if (!isNaN(stopValue) && stopValue !== 0) {
              stops.push({
                beat: chart.measureToBeat(obj.measure, obj.fraction),
                duration: stopValue,
              });
            }
          }
        }
      }

      // 스크롤 속도 변경 수집 (채널 SC 또는 헤더 기반)
      const scrollChanges: ScrollSpeedChange[] = [];
      for (const obj of objects) {
        // 채널 SC: 스크롤 속도 변경 (일부 BMS에서 사용)
        if (obj.channel.toUpperCase() === 'SC') {
          const scrollHeader = chart.headers.get('scroll' + obj.value);
          if (scrollHeader) {
            const scrollValue = parseFloat(scrollHeader);
            if (!isNaN(scrollValue)) {
              scrollChanges.push({
                beat: chart.measureToBeat(obj.measure, obj.fraction),
                speed: scrollValue,
              });
            }
          }
        }
      }

      // #SCROLL 헤더가 정의되어 있으면 추가로 확인
      chart.headers.each((key, _value) => {
        if (key.toLowerCase().startsWith('scroll') && key.toLowerCase() !== 'scroll') {
          // 일부 BMS는 SCROLL01, SCROLL02 형식으로 정의
          // 실제 사용되는 scroll은 채널에서 참조됨
        }
      });

      // 프리뷰/배경음악 파일 추출
      // #PREVIEW 헤더 또는 #WAV01 (일반적인 배경음악 슬롯) 확인
      let previewAudio: string | null = null;
      const previewHeader = chart.headers.get('preview');
      if (previewHeader) {
        previewAudio = previewHeader;
      } else {
        // WAV01을 배경음악으로 사용하는 경우가 많음
        const wav01 = chart.headers.get('wav01');
        if (wav01) {
          previewAudio = wav01;
        }
      }

      // 키사운드 매핑 추출
      const keysounds: Record<string, string> = {};
      chart.headers.each((key, value) => {
        const match = key.match(/^wav(\S\S)$/i);
        if (match) {
          keysounds[match[1].toLowerCase()] = value;
        }
      });

      // Timing 및 Positioning 객체 생성 (스크롤 기믹 지원)
      const timing = Timing.fromBMSChart(chart);
      const positioning = Positioning.fromBMSChart(chart, timing);

      // 디버그: WAV 정의 vs 노트 키사운드 ID 비교
      if (import.meta.env.DEV) {
        const wavIds = Object.keys(keysounds);
        const noteKeysoundIds = [...new Set(notes.filter(n => n.keysound).map(n => n.keysound!.toLowerCase()))];

        // 매칭되지 않는 노트 키사운드 ID 찾기
        const missingWavDefs = noteKeysoundIds.filter(id => !keysounds[id]);
        const unusedWavDefs = wavIds.filter(id => !noteKeysoundIds.includes(id));

        if (missingWavDefs.length > 0 || unusedWavDefs.length > 0) {
          console.group('[useBmsChart] WAV Definition Analysis');
          console.log(`Total WAV definitions: ${wavIds.length}`);
          console.log(`Unique keysound IDs in notes: ${noteKeysoundIds.length}`);

          if (missingWavDefs.length > 0) {
            console.warn(`⚠️ Notes reference ${missingWavDefs.length} keysounds with NO WAV definition`);
            console.warn(`Missing IDs: [${missingWavDefs.slice(0, 20).join(', ')}]${missingWavDefs.length > 20 ? '...' : ''}`);
          }

          if (unusedWavDefs.length > 0) {
            console.log(`ℹ️ ${unusedWavDefs.length} WAV definitions not used by any note`);
          }

          // ID 형식 분석
          const numericWavIds = wavIds.filter(id => /^\d+$/.test(id));
          const alphaWavIds = wavIds.filter(id => /[a-z]/i.test(id));
          const numericNoteIds = noteKeysoundIds.filter(id => /^\d+$/.test(id));
          const alphaNoteIds = noteKeysoundIds.filter(id => /[a-z]/i.test(id));

          console.log(`WAV IDs: ${numericWavIds.length} numeric, ${alphaWavIds.length} alphanumeric`);
          console.log(`Note keysound IDs: ${numericNoteIds.length} numeric, ${alphaNoteIds.length} alphanumeric`);

          // 패턴 불일치 경고
          if (numericWavIds.length > 0 && alphaWavIds.length === 0 && alphaNoteIds.length > 0) {
            console.error('❌ MISMATCH: WAV definitions are numeric-only but notes use alphanumeric IDs');
            console.error('This may indicate a BMS parsing issue or unsupported BMS format');
          }

          console.groupEnd();
        }
      }

      const chartInfo: BmsChartInfo = {
        songInfo: songInfo ? {
          title: songInfo.title,
          subtitles: songInfo.subtitles,
          artist: songInfo.artist,
          subartists: songInfo.subartists,
          genre: songInfo.genre,
          difficulty: songInfo.difficulty,
          level: songInfo.level,
        } : null,
        notes,
        keyMode: detectKeyMode(notes, chart.headers),
        totalBeats: calculateTotalBeats(notes),
        bpm: {
          initial: initialBpm,
          min: minBpm,
          max: maxBpm,
        },
        bpmChanges,
        lnType,
        stats: calculateStats(notes),
        stops,
        scrollChanges,
        previewAudio,
        keysounds,
        positioning,
        timing,
      };

      setState({
        chart: chartInfo,
        isLoading: false,
        error: null,
        isLoaded: true,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load chart';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: message,
        isLoaded: false,
      }));
    }
  }, [baseUrl, initialPath]);

  const reset = useCallback(() => {
    setState({
      chart: null,
      isLoading: false,
      error: null,
      isLoaded: false,
    });
  }, []);

  return [state, { load, reset }];
}
