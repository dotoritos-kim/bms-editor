/**
 * useViewerPlayback — playback engine hook
 *
 * Playback-related logic extracted from NoteChartViewer.tsx.
 *
 * Responsibilities:
 * - isPlaying / playbackBeat state management
 * - Triple-timing fallback animation loop: Web Audio / HTML Audio / rAF
 * - togglePlayback (play/pause + seek-to-start handling)
 * - scrollBeat sync effect on playback start/stop
 *
 * Hit effect management (hitNotesRef, setHitNotesVersion) stays in NoteChartViewer
 * as it is a rendering concern; injected here via the triggerKeysoundsInRange callback.
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
  /** Audio element ref (BGM) */
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  /** Keysound player ref */
  keysoundPlayerRef: MutableRefObject<KeysoundPlayer | null>;
  /** Timing object ref (used for precise time-to-beat conversion when BPM changes exist) */
  timingRef: MutableRefObject<Timing | null | undefined>;
  /** Keysound enabled state ref */
  keysoundEnabledRef: MutableRefObject<boolean>;
  /** Keysound ready state ref */
  keysoundReadyRef: MutableRefObject<boolean>;
  /** scrollBeat setter (synced when playback stops) */
  setScrollBeat: (beat: number | ((prev: number) => number)) => void;
  /** setPipelineLatency (measured latency value) */
  setPipelineLatency: (v: number | null) => void;
  /** setSchedulingOverhead */
  setSchedulingOverhead: (v: number | null) => void;
  /**
   * Callback that triggers keysounds within a beat range inside the animation loop.
   * Includes hit effect state (hitNotesRef, setHitNotesVersion), so it is
   * implemented in NoteChartViewer and injected here.
   */
  triggerKeysoundsInRange: (fromBeat: number, toBeat: number) => void;
  /**
   * Plays currently active keysounds with their offset when seeking.
   * (Leave undefined to skip keysound resumption on seek)
   */
  playActiveKeysoundsAtBeat?: (seekBeat: number, calculateTimeAtBeatFn: (beat: number) => number) => void;
  /**
   * Externally injected playedNotesRef (owned by useKeysoundTrigger).
   * When provided, this hook uses the injected ref instead of its own internal ref.
   */
  playedNotesRef?: MutableRefObject<Set<string>>;
}

export interface UseViewerPlaybackReturn {
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  playbackBeat: number;
  setPlaybackBeat: React.Dispatch<React.SetStateAction<number>>;
  /** rAF handle ref (accessible externally if cancellation is needed) */
  animationRef: MutableRefObject<number | null>;
  playbackBeatRef: MutableRefObject<number>;
  lastPlayedBeatRef: MutableRefObject<number>;
  playedNotesRef: MutableRefObject<Set<string>>;
  /** play/pause toggle */
  togglePlayback: () => Promise<void>;
  /** beat→seconds conversion accounting for BPM changes */
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
  keysoundEnabledRef: _keysoundEnabledRef,
  keysoundReadyRef: _keysoundReadyRef,
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
  // calculateTimeAtBeat — beat → seconds accounting for BPM changes
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
