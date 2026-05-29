/**
 * EditorPlayback
 *
 * Chart editor playback engine.
 * Traverses notes in beat order and triggers keysounds via AudioContext.
 * Synchronizes scroll position via requestAnimationFrame.
 */

import type { EditableBMSNote, BMSBpmChange } from '@rhythm-archive/bms-core';
import type { KeysoundPlayer } from './KeysoundPlayer';

/** Playback options */
export interface EditorPlaybackOptions {
  /** Keysound player */
  player: KeysoundPlayer;
  /** Note array */
  notes: EditableBMSNote[];
  /** BPM change array */
  bpmChanges: BMSBpmChange[];
  /** Base BPM */
  baseBpm: number;
  /** Playback speed multiplier (default: 1) */
  speed?: number;
  /** Per-frame callback delivering current beat */
  onBeatUpdate: (beat: number) => void;
  /** Playback end callback */
  onEnd: () => void;
}

/** BPM event (beat-based) */
export interface BpmEvent {
  beat: number;
  bpm: number;
}

/**
 * Build a beat-to-time lookup table.
 * Calculates absolute time for each beat, accounting for BPM changes.
 */
export function buildBeatToTimeMap(
  bpmChanges: BMSBpmChange[],
  baseBpm: number,
): BpmEvent[] {
  const events: BpmEvent[] = [{ beat: 0, bpm: baseBpm }];

  for (const change of bpmChanges) {
    const beat = change.measure * 4 + change.fraction * 4;
    events.push({ beat, bpm: change.bpm });
  }

  // Sort by beat
  events.sort((a, b) => a.beat - b.beat);
  return events;
}

/** Convert beat → absolute time (seconds) */
export function beatToTime(beat: number, bpmEvents: BpmEvent[]): number {
  let time = 0;
  let prevBeat = 0;
  let currentBpm = bpmEvents[0]?.bpm ?? 130;

  for (const event of bpmEvents) {
    if (event.beat >= beat) break;
    const deltaBeat = event.beat - prevBeat;
    time += (deltaBeat / currentBpm) * 60;
    prevBeat = event.beat;
    currentBpm = event.bpm;
  }

  // Remaining segment
  const remaining = beat - prevBeat;
  time += (remaining / currentBpm) * 60;

  return time;
}

/** Convert absolute time (seconds) → beat */
export function timeToBeat(targetTime: number, bpmEvents: BpmEvent[]): number {
  let time = 0;
  let prevBeat = 0;
  let currentBpm = bpmEvents[0]?.bpm ?? 130;

  for (const event of bpmEvents) {
    const deltaBeat = event.beat - prevBeat;
    const segmentDuration = (deltaBeat / currentBpm) * 60;

    if (time + segmentDuration >= targetTime) {
      // Position is within this segment
      const remaining = targetTime - time;
      return prevBeat + (remaining / 60) * currentBpm;
    }

    time += segmentDuration;
    prevBeat = event.beat;
    currentBpm = event.bpm;
  }

  // Last BPM segment
  const remaining = targetTime - time;
  return prevBeat + (remaining / 60) * currentBpm;
}

export class EditorPlayback {
  private player: KeysoundPlayer;
  private bpmEvents: BpmEvent[];
  private onBeatUpdate: (beat: number) => void;
  private onEnd: () => void;

  private animationFrameId: number | null = null;
  private playbackStartTime: number = 0;
  private startBeatTime: number = 0; // Absolute time of startBeat
  private nextNoteIndex: number = 0;
  private sortedNotes: EditableBMSNote[];
  private maxBeat: number;
  private isPlaying: boolean = false;
  private speed: number;

  constructor(options: EditorPlaybackOptions) {
    this.player = options.player;
    this.onBeatUpdate = options.onBeatUpdate;
    this.onEnd = options.onEnd;
    this.speed = options.speed ?? 1;

    this.bpmEvents = buildBeatToTimeMap(
      options.bpmChanges,
      options.baseBpm,
    );

    // Sort by beat
    this.sortedNotes = [...options.notes]
      .filter((n) => n.noteType !== 'landmine')
      .sort((a, b) => a.beat - b.beat);

    this.maxBeat = this.sortedNotes.length > 0
      ? Math.max(...this.sortedNotes.map((n) => n.endBeat ?? n.beat))
      : 0;
  }

  /** Start playback from a given beat */
  start(fromBeat: number = 0): void {
    if (this.isPlaying) this.stop();
    if (!this.player.isReady) return;

    this.isPlaying = true;
    this.startBeatTime = beatToTime(fromBeat, this.bpmEvents);
    this.playbackStartTime = this.player.getContextTime();

    // Find the index of the first note at or after the start beat
    this.nextNoteIndex = this.sortedNotes.findIndex((n) => n.beat >= fromBeat);
    if (this.nextNoteIndex === -1) this.nextNoteIndex = this.sortedNotes.length;

    this.tick();
  }

  /** Stop playback */
  stop(): void {
    this.isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.player.stopAll();
  }

  /** Whether playback is active */
  get playing(): boolean {
    return this.isPlaying;
  }

  /** Per-frame processing */
  private tick = (): void => {
    if (!this.isPlaying) return;

    const elapsed = (this.player.getContextTime() - this.playbackStartTime) * this.speed;
    const currentAbsTime = this.startBeatTime + elapsed;
    const currentBeat = timeToBeat(currentAbsTime, this.bpmEvents);

    // Trigger notes up to the current beat
    while (this.nextNoteIndex < this.sortedNotes.length) {
      const note = this.sortedNotes[this.nextNoteIndex];
      if (note.beat > currentBeat + 0.01) break; // Small lookahead margin

      if (note.keysound) {
        this.player.play(note.keysound);
      }
      this.nextNoteIndex++;
    }

    // Callback: update current beat (for scroll sync)
    this.onBeatUpdate(currentBeat);

    // Check for end of playback
    if (currentBeat > this.maxBeat + 4) {
      this.stop();
      this.onEnd();
      return;
    }

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  /** Change playback speed (can be called while playing) */
  setSpeed(speed: number): void {
    if (this.isPlaying) {
      // Recalculate timing based on current beat position
      const elapsed = (this.player.getContextTime() - this.playbackStartTime) * this.speed;
      const currentAbsTime = this.startBeatTime + elapsed;
      this.startBeatTime = currentAbsTime;
      this.playbackStartTime = this.player.getContextTime();
    }
    this.speed = speed;
  }

  /** Release resources */
  dispose(): void {
    this.stop();
  }
}

export default EditorPlayback;
