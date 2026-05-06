/**
 * useViewerPlayback — 재생 엔진 훅
 *
 * NoteChartViewer.tsx 에서 추출된 재생 관련 로직.
 *
 * 책임:
 * - isPlaying / playbackBeat 상태 관리
 * - Web Audio / HTML Audio / rAF 기반 3중 타이밍 fallback 애니메이션 루프
 * - togglePlayback (play/pause + seek-to-start 처리)
 * - 재생 시작/종료 시 scrollBeat 동기화 effect
 *
 * hitEffect 관리(hitNotesRef, setHitNotesVersion)는 렌더링 책임이 있어
 * NoteChartViewer 에 그대로 두고, triggerKeysoundsInRange 콜백으로 주입받습니다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { KeysoundPlayer } from '../../KeysoundPlayer';
import type { Timing } from '@rhythm-archive/bms-core';
import type { BpmChange } from '../../NoteChartViewer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface UseViewerPlaybackOptions {
  viewMode: string;
  bpm: number;
  bpmChanges: BpmChange[];
  maxBeat: number;
  audioLoaded: boolean;
  keysoundReady: boolean;
  playbackSpeed: number;
  /** 오디오 요소 ref (BGM) */
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  /** 키사운드 플레이어 ref */
  keysoundPlayerRef: MutableRefObject<KeysoundPlayer | null>;
  /** timing 객체 ref (BPM 변화 있을 때 정밀 시간-비트 변환용) */
  timingRef: MutableRefObject<Timing | null | undefined>;
  /** 키사운드 활성화 여부 ref */
  keysoundEnabledRef: MutableRefObject<boolean>;
  /** 키사운드 준비 여부 ref */
  keysoundReadyRef: MutableRefObject<boolean>;
  /** scrollBeat setter (재생 종료 시 동기화) */
  setScrollBeat: (beat: number | ((prev: number) => number)) => void;
  /** setPipelineLatency (레이턴시 측정값) */
  setPipelineLatency: (v: number | null) => void;
  /** setSchedulingOverhead */
  setSchedulingOverhead: (v: number | null) => void;
  /**
   * 애니메이션 루프 내에서 비트 범위 내 키사운드를 트리거하는 콜백.
   * hit effect 상태(hitNotesRef, setHitNotesVersion)를 포함하므로
   * NoteChartViewer 에서 구현하여 주입합니다.
   */
  triggerKeysoundsInRange: (fromBeat: number, toBeat: number) => void;
  /**
   * seek 시 현재 재생 중인 키사운드들을 offset과 함께 재생.
   * (미구현 시 undefined 로 두면 seek 시 스킵됨)
   */
  playActiveKeysoundsAtBeat?: (seekBeat: number, calculateTimeAtBeatFn: (beat: number) => number) => void;
  /**
   * 외부에서 주입하는 playedNotesRef (useKeysoundTrigger가 소유).
   * 주입 시 이 훅은 자체 ref 대신 주입된 ref를 사용합니다.
   */
  playedNotesRef?: MutableRefObject<Set<string>>;
}

export interface UseViewerPlaybackReturn {
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  playbackBeat: number;
  setPlaybackBeat: React.Dispatch<React.SetStateAction<number>>;
  /** rAF handle ref (외부에서 cancel 필요 시 접근용) */
  animationRef: MutableRefObject<number | null>;
  playbackBeatRef: MutableRefObject<number>;
  lastPlayedBeatRef: MutableRefObject<number>;
  playedNotesRef: MutableRefObject<Set<string>>;
  /** play/pause 토글 */
  togglePlayback: () => Promise<void>;
  /** BPM 변화를 고려한 beat→seconds 변환 */
  calculateTimeAtBeat: (targetBeat: number) => number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useViewerPlayback({
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
  playedNotesRef: externalPlayedNotesRef,
}: UseViewerPlaybackOptions): UseViewerPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackBeat, setPlaybackBeat] = useState(0);

  const animationRef = useRef<number | null>(null);
  const playbackBeatRef = useRef(0);
  const lastTimeRef = useRef<number>(0);
  const lastPlayedBeatRef = useRef<number>(-1);
  const _internalPlayedNotesRef = useRef<Set<string>>(new Set());
  // Use external ref if provided (owned by useKeysoundTrigger), otherwise fallback to internal
  const playedNotesRef = externalPlayedNotesRef ?? _internalPlayedNotesRef;
  const contextStartTimeRef = useRef(0);
  const startBeatRef = useRef(0);
  const wasPlayingRef = useRef(false);

  // Stable ref for triggerKeysoundsInRange to avoid stale closure in rAF loop
  const triggerRef = useRef(triggerKeysoundsInRange);
  useEffect(() => { triggerRef.current = triggerKeysoundsInRange; });

  // -------------------------------------------------------------------------
  // calculateTimeAtBeat — BPM 변화 고려한 beat → seconds
  // -------------------------------------------------------------------------
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
        currentBpm = change.bpm;
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

  // -------------------------------------------------------------------------
  // getBpmAtBeat (used inside animation loop via ref)
  // -------------------------------------------------------------------------
  const getBpmAtBeatRef = useRef<(beat: number) => number>((beat: number) => {
    if (!bpmChanges || bpmChanges.length === 0) return bpm;
    let cur = bpm;
    for (const c of bpmChanges) {
      if (c.beat <= beat) cur = c.bpm; else break;
    }
    return cur;
  });
  // Keep fresh every render
  useEffect(() => {
    getBpmAtBeatRef.current = (beat: number) => {
      if (!bpmChanges || bpmChanges.length === 0) return bpm;
      let cur = bpm;
      for (const c of bpmChanges) {
        if (c.beat <= beat) cur = c.bpm; else break;
      }
      return cur;
    };
  });

  // -------------------------------------------------------------------------
  // Playback started/stopped side-effect: sync scrollBeat on stop
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      playedNotesRef.current.clear();
      lastPlayedBeatRef.current = playbackBeat;
    } else if (!isPlaying && wasPlayingRef.current) {
      setScrollBeat(playbackBeatRef.current);
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, playbackBeat, setScrollBeat]);

  // -------------------------------------------------------------------------
  // Animation loop useEffect
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (viewMode !== 'playback' || !isPlaying) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioRef.current && !isPlaying) audioRef.current.pause();
      return;
    }

    let isCancelled = false;
    let lastUIUpdate = 0;
    let lastLatencySample = 0;
    const UI_UPDATE_INTERVAL = 50;
    const LATENCY_SAMPLE_INTERVAL = 500;

    const useWebAudioTiming = keysoundPlayerRef.current && keysoundReady;
    const currentTiming = timingRef.current;
    const startTimeInSeconds = currentTiming
      ? currentTiming.beatToSeconds(playbackBeat)
      : playbackBeat * 60 / bpm;

    if (useWebAudioTiming) {
      contextStartTimeRef.current = keysoundPlayerRef.current!.getContextTime();
      startBeatRef.current = playbackBeat;
    }

    if (audioRef.current && audioLoaded) {
      audioRef.current.currentTime = startTimeInSeconds;
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.play().catch(() => {});
    }

    const animate = (timestamp: number) => {
      if (isCancelled) return;

      let newBeat: number;
      const prevBeat = lastPlayedBeatRef.current;

      if (useWebAudioTiming && keysoundPlayerRef.current) {
        const contextTime = keysoundPlayerRef.current.getContextTime();
        let elapsedSeconds = (contextTime - contextStartTimeRef.current) * playbackSpeed;

        if (elapsedSeconds < 0 || !Number.isFinite(elapsedSeconds)) {
          contextStartTimeRef.current = contextTime;
          elapsedSeconds = 0;
        }

        const currentTimeInSec = startTimeInSeconds + elapsedSeconds;

        if (currentTiming) {
          newBeat = currentTiming.secondsToBeat(currentTimeInSec);
        } else {
          const currentBpmVal = getBpmAtBeatRef.current(startBeatRef.current);
          newBeat = startBeatRef.current + elapsedSeconds * (currentBpmVal / 60);
        }

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
      } else if (audioRef.current && audioLoaded) {
        const audioTime = audioRef.current.currentTime;
        if (currentTiming) {
          newBeat = currentTiming.secondsToBeat(audioTime);
        } else {
          newBeat = audioTime / (60 / bpm);
        }
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
        if (!lastTimeRef.current) lastTimeRef.current = timestamp;
        const deltaTime = timestamp - lastTimeRef.current;
        lastTimeRef.current = timestamp;

        if (currentTiming) {
          const prevTimeInSec = prevBeat >= 0 ? currentTiming.beatToSeconds(prevBeat) : 0;
          const newTimeInSec = prevTimeInSec + (deltaTime / 1000) * playbackSpeed;
          newBeat = currentTiming.secondsToBeat(newTimeInSec);
        } else {
          const currentBpmVal = getBpmAtBeatRef.current(prevBeat >= 0 ? prevBeat : 0);
          newBeat = (prevBeat >= 0 ? prevBeat : 0) + (deltaTime * playbackSpeed) / (60000 / currentBpmVal);
        }

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

      if (prevBeat >= 0 && newBeat > prevBeat) {
        triggerRef.current(prevBeat, newBeat);
      }
      lastPlayedBeatRef.current = newBeat;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, isPlaying, bpm, maxBeat, audioLoaded, keysoundReady, playbackSpeed]);

  // -------------------------------------------------------------------------
  // togglePlayback
  // -------------------------------------------------------------------------
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
        playedNotesRef.current.clear();
        lastPlayedBeatRef.current = playbackBeat;
        if (keysoundReady && keysoundPlayerRef.current && playActiveKeysoundsAtBeat) {
          playActiveKeysoundsAtBeat(playbackBeat, calculateTimeAtBeat);
        }
      }
      setIsPlaying(true);
    }
  }, [isPlaying, playbackBeat, maxBeat, keysoundReady, playActiveKeysoundsAtBeat, calculateTimeAtBeat, audioRef, keysoundPlayerRef, setScrollBeat, setPipelineLatency, setSchedulingOverhead]);

  return {
    isPlaying,
    setIsPlaying,
    playbackBeat,
    setPlaybackBeat,
    animationRef,
    playbackBeatRef,
    lastPlayedBeatRef,
    playedNotesRef,
    togglePlayback,
    calculateTimeAtBeat,
  };
}
