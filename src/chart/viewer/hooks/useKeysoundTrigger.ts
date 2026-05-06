/**
 * useKeysoundTrigger.ts
 * Keysound triggering, hit-effect state management, and binary-search helpers.
 * Extracted from NoteChartViewer.tsx (Stage F).
 *
 * Owns playedNotesRef so that useViewerPlayback can receive it as a dependency.
 */

import { useRef, useState, useCallback } from 'react';
import type { BMSNote } from '@rhythm-archive/bms-core';
import type { Positioning } from '@rhythm-archive/bms-core';
import type { LaneConfig } from '../../laneConfig';
import type { HitEffect } from '../renderers/PlaybackRenderers';
import { NOTE_HEIGHT, NOTE_PADDING } from '../renderers/viewerRenderUtils';

export interface UseKeysoundTriggerOptions {
  notesRef: React.MutableRefObject<BMSNote[]>;
  sortedNotesRef: React.MutableRefObject<BMSNote[]>;
  keysoundEnabledRef: React.MutableRefObject<boolean>;
  keysoundReadyRef: React.MutableRefObject<boolean>;
  keysoundPlayerRef: React.MutableRefObject<{
    getKeysoundDuration: (id: string) => number;
    playMultipleWithOffset: (items: { id: string; offset: number }[]) => void;
    playMultiple: (ids: string[]) => void;
  } | null>;
  lanesRef: React.MutableRefObject<LaneConfig[]>;
  laneMapRef: React.MutableRefObject<Map<string, LaneConfig>>;
  beatScaleRef: React.MutableRefObject<number>;
  positioningRef: React.MutableRefObject<Positioning | null | undefined>;
}

export interface UseKeysoundTriggerReturn {
  hitNotesRef: React.MutableRefObject<Map<string, HitEffect>>;
  hitNotesVersion: number;
  /** Owned by this hook; pass to useViewerPlayback so resets work correctly */
  playedNotesRef: React.MutableRefObject<Set<string>>;
  playActiveKeysoundsAtBeat: (
    seekBeat: number,
    calculateTimeAtBeatFn: (beat: number) => number,
  ) => void;
  triggerKeysoundsInRange: (fromBeat: number, toBeat: number) => void;
}

export function useKeysoundTrigger({
  notesRef,
  sortedNotesRef,
  keysoundEnabledRef,
  keysoundReadyRef,
  keysoundPlayerRef,
  lanesRef,
  laneMapRef,
  beatScaleRef,
  positioningRef,
}: UseKeysoundTriggerOptions): UseKeysoundTriggerReturn {
  const hitNotesRef    = useRef<Map<string, HitEffect>>(new Map());
  const playedNotesRef = useRef<Set<string>>(new Set());
  const [hitNotesVersion, setHitNotesVersion] = useState(0);

  // ─── Binary search ────────────────────────────────────────────────────────
  const findFirstNoteIndexAfterBeat = useCallback((sortedNotes: BMSNote[], beat: number): number => {
    let left = 0;
    let right = sortedNotes.length;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (sortedNotes[mid].beat <= beat) left = mid + 1;
      else right = mid;
    }
    return left;
  }, []);

  // ─── Seek: play currently-active keysounds at the given beat ─────────────
  const playActiveKeysoundsAtBeat = useCallback((
    seekBeat: number,
    calculateTimeAtBeatFn: (beat: number) => number,
  ) => {
    if (!keysoundEnabledRef.current || !keysoundReadyRef.current || !keysoundPlayerRef.current) return;

    const player   = keysoundPlayerRef.current;
    const seekTime = calculateTimeAtBeatFn(seekBeat);
    const keysoundsToPlay: Array<{ id: string; offset: number }> = [];

    const maxLookbackTime = 30;
    const minTime = Math.max(0, seekTime - maxLookbackTime);
    const durationCache = new Map<string, number>();

    for (const note of notesRef.current) {
      if (!note.keysound) continue;

      const noteTime = calculateTimeAtBeatFn(note.beat);
      if (noteTime > seekTime) continue;
      if (noteTime < minTime) continue;

      let duration = durationCache.get(note.keysound);
      if (duration === undefined) {
        duration = player.getKeysoundDuration(note.keysound);
        durationCache.set(note.keysound, duration);
      }
      if (duration <= 0) continue;

      if (seekTime < noteTime + duration) {
        keysoundsToPlay.push({ id: note.keysound, offset: seekTime - noteTime });
        playedNotesRef.current.add(`${note.beat}-${note.keysound}`);
      }
    }

    if (keysoundsToPlay.length > 0) {
      player.playMultipleWithOffset(keysoundsToPlay);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Animation loop: trigger keysounds in beat range + hit effects ────────
  const triggerKeysoundsInRange = useCallback((fromBeat: number, toBeat: number) => {
    if (!keysoundEnabledRef.current || !keysoundReadyRef.current || !keysoundPlayerRef.current) return;
    if (toBeat <= fromBeat) return;

    const currentLanes    = lanesRef.current;
    const currentBeatScale = beatScaleRef.current;
    const totalWidth      = currentLanes.reduce((sum, l) => sum + l.width, 0);
    const offsetX         = -totalWidth / 2;
    const laneMap         = laneMapRef.current;
    const now             = performance.now();

    const notesToPlay: string[] = [];
    let hasNewHits = false;

    const sortedNotes = sortedNotesRef.current;
    const startIndex  = findFirstNoteIndexAfterBeat(sortedNotes, fromBeat);

    for (let i = startIndex; i < sortedNotes.length; i++) {
      const note = sortedNotes[i];
      if (note.beat > toBeat) break;

      const noteKey = `${note.beat}-${note.keysound}`;
      if (playedNotesRef.current.has(noteKey)) continue;

      if (note.keysound) {
        notesToPlay.push(note.keysound);
        playedNotesRef.current.add(noteKey);

        if (note.column) {
          const lane = laneMap.get(note.column);
          if (lane) {
            const x = offsetX + lane.x + NOTE_PADDING + (lane.width - NOTE_PADDING * 2) / 2;
            const currentPositioning = positioningRef.current;
            const y = currentPositioning
              ? currentPositioning.position(note.beat) * currentBeatScale + NOTE_HEIGHT / 2
              : note.beat * currentBeatScale + NOTE_HEIGHT / 2;
            hitNotesRef.current.set(
              `${note.beat}-${note.column}-${note.keysound}`,
              { x, y, width: lane.width, color: lane.color, time: now },
            );
            hasNewHits = true;
          }
        }
      }
    }

    if (notesToPlay.length > 0) {
      keysoundPlayerRef.current.playMultiple(notesToPlay);
    }

    if (hasNewHits) {
      setHitNotesVersion(v => v + 1);
    }

    const CLEANUP_THRESHOLD = 500;
    if (hitNotesRef.current.size > 0 && Math.random() < 0.1) {
      hitNotesRef.current.forEach((effect, key) => {
        if (now - effect.time > CLEANUP_THRESHOLD) hitNotesRef.current.delete(key);
      });
    }
  }, [findFirstNoteIndexAfterBeat]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    hitNotesRef,
    hitNotesVersion,
    playedNotesRef,
    playActiveKeysoundsAtBeat,
    triggerKeysoundsInRange,
  };
}
