/**
 * useViewerKeyboard — NoteChartViewer keyboard shortcut hook
 *
 * Keyboard shortcut logic extracted from NoteChartViewer.tsx.
 * Shortcuts are only handled when isFocused is true.
 */
import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

export interface UseViewerKeyboardOptions {
  isFocused: boolean;
  viewMode: string;
  maxBeat: number;
  isPlaying: boolean;
  scrollBeat: number;
  playbackBeat: number;
  playbackBeatRef: MutableRefObject<number>;
  setScrollBeat: (beat: number | ((prev: number) => number)) => void;
  setPlaybackBeat: (beat: number) => void;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  togglePlayback: () => void;
}

export function useViewerKeyboard({
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
}: UseViewerKeyboardOptions): void {
  // Keep stable refs to avoid re-registering the listener on every state change
  const optsRef = useRef({
    isFocused,
    viewMode,
    maxBeat,
    isPlaying,
    scrollBeat,
    playbackBeat,
    togglePlayback,
  });

  useEffect(() => {
    optsRef.current = {
      isFocused,
      viewMode,
      maxBeat,
      isPlaying,
      scrollBeat,
      playbackBeat,
      togglePlayback,
    };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const {
        isFocused: focused,
        viewMode: mode,
        maxBeat: max,
        isPlaying: playing,
        scrollBeat: sb,
        playbackBeat: pb,
        togglePlayback: toggle,
      } = optsRef.current;

      if (!focused) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (mode === 'playback') toggle();
          break;
        case 'ArrowUp':
        case 'ArrowRight':
          e.preventDefault();
          if (mode === 'scroll' || (mode === 'playback' && !playing)) {
            const currentBeat = mode === 'scroll' ? sb : pb;
            const newBeat = Math.min(max, currentBeat + 4);
            playbackBeatRef.current = newBeat;
            setPlaybackBeat(newBeat);
            setScrollBeat(newBeat);
          }
          break;
        case 'ArrowDown':
        case 'ArrowLeft':
          e.preventDefault();
          if (mode === 'scroll' || (mode === 'playback' && !playing)) {
            const currentBeat = mode === 'scroll' ? sb : pb;
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
          setScrollBeat(max);
          playbackBeatRef.current = max;
          setPlaybackBeat(max);
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
    // Intentionally no deps — optsRef always holds the latest values, preventing listener re-registration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
