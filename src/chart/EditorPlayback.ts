/**
 * EditorPlayback
 *
 * 차트 에디터 재생 엔진
 * AudioContext 기반으로 비트 순서로 노트를 순회하며 키음 트리거
 * requestAnimationFrame으로 스크롤 동기화
 */

import type { EditableBMSNote, BMSBpmChange } from '@rhythm-archive/bms-core';
import type { KeysoundPlayer } from './KeysoundPlayer';

/** 재생 옵션 */
export interface EditorPlaybackOptions {
  /** 키음 플레이어 */
  player: KeysoundPlayer;
  /** 노트 배열 */
  notes: EditableBMSNote[];
  /** BPM 변경 배열 */
  bpmChanges: BMSBpmChange[];
  /** 기본 BPM */
  baseBpm: number;
  /** 재생 속도 배율 (기본: 1) */
  speed?: number;
  /** 매 프레임 콜백 (현재 비트 전달) */
  onBeatUpdate: (beat: number) => void;
  /** 재생 종료 콜백 */
  onEnd: () => void;
}

/** BPM 이벤트 (비트 기반) */
export interface BpmEvent {
  beat: number;
  bpm: number;
}

/**
 * 비트 → 시간(초) 변환 테이블 생성
 * BPM 변경을 고려하여 각 비트의 절대 시간 계산
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

  // 비트 순 정렬
  events.sort((a, b) => a.beat - b.beat);
  return events;
}

/** 비트 → 절대 시간(초) 변환 */
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

  // 남은 구간
  const remaining = beat - prevBeat;
  time += (remaining / currentBpm) * 60;

  return time;
}

/** 절대 시간(초) → 비트 변환 */
export function timeToBeat(targetTime: number, bpmEvents: BpmEvent[]): number {
  let time = 0;
  let prevBeat = 0;
  let currentBpm = bpmEvents[0]?.bpm ?? 130;

  for (const event of bpmEvents) {
    const deltaBeat = event.beat - prevBeat;
    const segmentDuration = (deltaBeat / currentBpm) * 60;

    if (time + segmentDuration >= targetTime) {
      // 이 세그먼트 내에 위치
      const remaining = targetTime - time;
      return prevBeat + (remaining / 60) * currentBpm;
    }

    time += segmentDuration;
    prevBeat = event.beat;
    currentBpm = event.bpm;
  }

  // 마지막 BPM 구간
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
  private startBeatTime: number = 0; // startBeat의 절대 시간
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

    // 비트 순 정렬
    this.sortedNotes = [...options.notes]
      .filter((n) => n.noteType !== 'landmine')
      .sort((a, b) => a.beat - b.beat);

    this.maxBeat = this.sortedNotes.length > 0
      ? Math.max(...this.sortedNotes.map((n) => n.endBeat ?? n.beat))
      : 0;
  }

  /** 특정 비트부터 재생 시작 */
  start(fromBeat: number = 0): void {
    if (this.isPlaying) this.stop();
    if (!this.player.isReady) return;

    this.isPlaying = true;
    this.startBeatTime = beatToTime(fromBeat, this.bpmEvents);
    this.playbackStartTime = this.player.getContextTime();

    // 시작 비트 이후의 첫 번째 노트 인덱스 찾기
    this.nextNoteIndex = this.sortedNotes.findIndex((n) => n.beat >= fromBeat);
    if (this.nextNoteIndex === -1) this.nextNoteIndex = this.sortedNotes.length;

    this.tick();
  }

  /** 재생 정지 */
  stop(): void {
    this.isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.player.stopAll();
  }

  /** 재생 중인지 여부 */
  get playing(): boolean {
    return this.isPlaying;
  }

  /** 매 프레임 처리 */
  private tick = (): void => {
    if (!this.isPlaying) return;

    const elapsed = (this.player.getContextTime() - this.playbackStartTime) * this.speed;
    const currentAbsTime = this.startBeatTime + elapsed;
    const currentBeat = timeToBeat(currentAbsTime, this.bpmEvents);

    // 현재 비트까지의 노트 트리거
    while (this.nextNoteIndex < this.sortedNotes.length) {
      const note = this.sortedNotes[this.nextNoteIndex];
      if (note.beat > currentBeat + 0.01) break; // 약간의 여유

      if (note.keysound) {
        this.player.play(note.keysound);
      }
      this.nextNoteIndex++;
    }

    // 콜백: 현재 비트 업데이트 (스크롤 동기화용)
    this.onBeatUpdate(currentBeat);

    // 재생 종료 체크
    if (currentBeat > this.maxBeat + 4) {
      this.stop();
      this.onEnd();
      return;
    }

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  /** 재생 속도 변경 (재생 중에도 가능) */
  setSpeed(speed: number): void {
    if (this.isPlaying) {
      // 현재 비트 위치를 기준으로 타이밍을 재설정
      const elapsed = (this.player.getContextTime() - this.playbackStartTime) * this.speed;
      const currentAbsTime = this.startBeatTime + elapsed;
      this.startBeatTime = currentAbsTime;
      this.playbackStartTime = this.player.getContextTime();
    }
    this.speed = speed;
  }

  /** 리소스 해제 */
  dispose(): void {
    this.stop();
  }
}

export default EditorPlayback;
