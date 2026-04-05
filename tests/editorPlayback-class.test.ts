import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EditorPlayback,
  buildBeatToTimeMap,
  beatToTime,
  timeToBeat,
  type BpmEvent,
} from '../src/chart/EditorPlayback';
import type { EditableBMSNote, BMSBpmChange } from '@rhythm-archive/bms-core';

// ─── Mock KeysoundPlayer ────────────────────────────────────────────

function createMockPlayer(options?: { isReady?: boolean; contextTime?: number }) {
  let contextTime = options?.contextTime ?? 0;
  return {
    isReady: options?.isReady ?? true,
    play: vi.fn(),
    stopAll: vi.fn(),
    dispose: vi.fn(),
    getContextTime: vi.fn(() => contextTime),
    /** Test helper: advance the mock AudioContext time */
    _setContextTime(t: number) {
      contextTime = t;
    },
  };
}

type MockPlayer = ReturnType<typeof createMockPlayer>;

// ─── Helper: create an EditableBMSNote ──────────────────────────────

function makeNote(
  beat: number,
  keysound: string,
  extra?: Partial<EditableBMSNote>,
): EditableBMSNote {
  return {
    id: `note-${beat}-${keysound}`,
    beat,
    keysound,
    measure: Math.floor(beat / 4),
    fraction: (beat % 4) / 4,
    channel: '11',
    noteType: 'normal',
    ...extra,
  };
}

// ─── Mock requestAnimationFrame / cancelAnimationFrame ──────────────

let rafCallbacks: Map<number, FrameRequestCallback>;
let rafId: number;

beforeEach(() => {
  rafCallbacks = new Map();
  rafId = 0;

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafCallbacks.set(id, cb);
    return id;
  });

  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks.delete(id);
  });
});

/** Flush one pending rAF callback (simulates one frame). */
function flushOneFrame() {
  const entry = rafCallbacks.entries().next();
  if (!entry.done) {
    const [id, cb] = entry.value;
    rafCallbacks.delete(id);
    cb(performance.now());
  }
}

// =====================================================================
// Pure function tests
// =====================================================================

describe('buildBeatToTimeMap', () => {
  it('returns a single event at beat 0 when there are no BPM changes', () => {
    const events = buildBeatToTimeMap([], 140);
    expect(events).toEqual([{ beat: 0, bpm: 140 }]);
  });

  it('converts measure/fraction to beats correctly', () => {
    // measure 3, fraction 0.25 => beat = 3*4 + 0.25*4 = 13
    const changes: BMSBpmChange[] = [{ measure: 3, fraction: 0.25, bpm: 180 }];
    const events = buildBeatToTimeMap(changes, 120);
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ beat: 13, bpm: 180 });
  });

  it('sorts events by beat even when input is unordered', () => {
    const changes: BMSBpmChange[] = [
      { measure: 4, fraction: 0, bpm: 200 },
      { measure: 1, fraction: 0, bpm: 160 },
    ];
    const events = buildBeatToTimeMap(changes, 130);
    expect(events.map((e) => e.beat)).toEqual([0, 4, 16]);
  });

  it('handles multiple changes in the same measure at different fractions', () => {
    const changes: BMSBpmChange[] = [
      { measure: 2, fraction: 0.75, bpm: 300 },
      { measure: 2, fraction: 0, bpm: 180 },
      { measure: 2, fraction: 0.5, bpm: 240 },
    ];
    const events = buildBeatToTimeMap(changes, 120);
    const beats = events.map((e) => e.beat);
    // 0, 8, 10, 11
    expect(beats).toEqual([0, 8, 10, 11]);
  });
});

describe('beatToTime', () => {
  it('is monotonically increasing for positive BPMs with many changes', () => {
    const changes: BMSBpmChange[] = [
      { measure: 1, fraction: 0, bpm: 200 },
      { measure: 3, fraction: 0, bpm: 90 },
      { measure: 5, fraction: 0.5, bpm: 400 },
      { measure: 8, fraction: 0, bpm: 60 },
    ];
    const events = buildBeatToTimeMap(changes, 150);

    let prev = -1;
    for (let beat = 0; beat <= 40; beat += 0.5) {
      const t = beatToTime(beat, events);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });

  it('computes correct time across a BPM change boundary', () => {
    // 0-4 beats at 60 BPM (4 seconds), then at 120 BPM
    const changes: BMSBpmChange[] = [{ measure: 1, fraction: 0, bpm: 120 }];
    const events = buildBeatToTimeMap(changes, 60);

    // beat 4: 4 * (60/60) = 4s
    expect(beatToTime(4, events)).toBeCloseTo(4.0, 10);
    // beat 6: 4s + 2 * (60/120) = 4 + 1 = 5s
    expect(beatToTime(6, events)).toBeCloseTo(5.0, 10);
  });

  it('defaults to 130 BPM when events array is empty', () => {
    expect(beatToTime(1, [])).toBeCloseTo(60 / 130, 10);
  });
});

describe('timeToBeat / beatToTime round-trip', () => {
  it('round-trips correctly with constant BPM', () => {
    const events = buildBeatToTimeMap([], 144);
    for (const beat of [0, 1, 3.5, 10, 99.25]) {
      const time = beatToTime(beat, events);
      const recovered = timeToBeat(time, events);
      expect(recovered).toBeCloseTo(beat, 8);
    }
  });

  it('round-trips correctly with multiple BPM changes', () => {
    const changes: BMSBpmChange[] = [
      { measure: 2, fraction: 0, bpm: 200 },
      { measure: 4, fraction: 0, bpm: 80 },
      { measure: 6, fraction: 0.5, bpm: 300 },
    ];
    const events = buildBeatToTimeMap(changes, 130);

    for (const beat of [0, 2, 7.5, 9, 16, 20, 30]) {
      const time = beatToTime(beat, events);
      const recovered = timeToBeat(time, events);
      expect(recovered).toBeCloseTo(beat, 8);
    }
  });
});

// =====================================================================
// EditorPlayback class tests
// =====================================================================

describe('EditorPlayback', () => {
  let player: MockPlayer;
  let onBeatUpdate: ReturnType<typeof vi.fn>;
  let onEnd: ReturnType<typeof vi.fn>;

  function createPlayback(
    opts?: Partial<{
      notes: EditableBMSNote[];
      bpmChanges: BMSBpmChange[];
      baseBpm: number;
      speed: number;
    }>,
  ) {
    return new EditorPlayback({
      player: player as unknown as Parameters<typeof EditorPlayback['prototype']['start']> extends never[]
        ? never
        : ConstructorParameters<typeof EditorPlayback>[0]['player'],
      notes: opts?.notes ?? [],
      bpmChanges: opts?.bpmChanges ?? [],
      baseBpm: opts?.baseBpm ?? 120,
      speed: opts?.speed,
      onBeatUpdate,
      onEnd,
    });
  }

  beforeEach(() => {
    player = createMockPlayer();
    onBeatUpdate = vi.fn();
    onEnd = vi.fn();
  });

  // ── Construction ──────────────────────────────────────────────────

  describe('constructor', () => {
    it('constructs without error with empty notes and bpmChanges', () => {
      expect(() => createPlayback()).not.toThrow();
    });

    it('constructs with notes and BPM changes', () => {
      const notes = [makeNote(0, 'kick'), makeNote(4, 'snare')];
      const bpmChanges: BMSBpmChange[] = [{ measure: 2, fraction: 0, bpm: 180 }];
      expect(() => createPlayback({ notes, bpmChanges })).not.toThrow();
    });

    it('filters out landmine notes', () => {
      const notes = [
        makeNote(0, 'kick'),
        makeNote(2, 'mine', { noteType: 'landmine' }),
        makeNote(4, 'snare'),
      ];
      const pb = createPlayback({ notes });
      // Start playback and advance past all notes to verify only 2 notes trigger
      player._setContextTime(0);
      pb.start(0);

      // Advance time far enough to pass all notes (8 beats at 120 BPM = 4s)
      player._setContextTime(10);
      flushOneFrame();

      // play should have been called for 'kick' and 'snare' but NOT 'mine'
      const playedIds = player.play.mock.calls.map((c) => c[0]);
      expect(playedIds).toContain('kick');
      expect(playedIds).toContain('snare');
      expect(playedIds).not.toContain('mine');

      pb.stop();
    });
  });

  // ── start() ───────────────────────────────────────────────────────

  describe('start()', () => {
    it('sets playing to true', () => {
      const pb = createPlayback();
      pb.start(0);
      expect(pb.playing).toBe(true);
      pb.stop();
    });

    it('does nothing when player is not ready', () => {
      const notReadyPlayer = createMockPlayer({ isReady: false });
      const pb = new EditorPlayback({
        player: notReadyPlayer as unknown as ConstructorParameters<typeof EditorPlayback>[0]['player'],
        notes: [],
        bpmChanges: [],
        baseBpm: 120,
        onBeatUpdate,
        onEnd,
      });
      pb.start(0);
      expect(pb.playing).toBe(false);
    });

    it('calls onBeatUpdate on the first tick', () => {
      const pb = createPlayback();
      player._setContextTime(0);
      pb.start(0);
      // start() calls tick() synchronously
      expect(onBeatUpdate).toHaveBeenCalled();
      pb.stop();
    });

    it('starts from a non-zero beat', () => {
      const notes = [makeNote(0, 'a'), makeNote(4, 'b'), makeNote(8, 'c')];
      const pb = createPlayback({ notes });
      player._setContextTime(0);
      pb.start(4); // skip first note

      // At time 0, currentBeat = fromBeat = 4
      // Note at beat 4 should be triggered immediately
      expect(player.play).toHaveBeenCalledWith('b');
      // Note at beat 0 should NOT have been triggered
      const ids = player.play.mock.calls.map((c) => c[0]);
      expect(ids).not.toContain('a');

      pb.stop();
    });

    it('stops previous playback if already playing', () => {
      const pb = createPlayback();
      player._setContextTime(0);
      pb.start(0);
      expect(pb.playing).toBe(true);

      // Start again - should stop first
      pb.start(0);
      // stopAll should have been called from the stop() inside start()
      expect(player.stopAll).toHaveBeenCalled();
      expect(pb.playing).toBe(true);
      pb.stop();
    });
  });

  // ── stop() ────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('sets playing to false', () => {
      const pb = createPlayback();
      pb.start(0);
      pb.stop();
      expect(pb.playing).toBe(false);
    });

    it('calls player.stopAll()', () => {
      const pb = createPlayback();
      pb.start(0);
      pb.stop();
      expect(player.stopAll).toHaveBeenCalled();
    });

    it('cancels the animation frame', () => {
      const pb = createPlayback();
      pb.start(0);
      // After start, a rAF should be queued
      expect(rafCallbacks.size).toBeGreaterThan(0);

      pb.stop();
      // After stop, it should be cancelled
      expect(rafCallbacks.size).toBe(0);
    });

    it('is safe to call stop() when not playing', () => {
      const pb = createPlayback();
      expect(() => pb.stop()).not.toThrow();
    });
  });

  // ── Note triggering via tick ──────────────────────────────────────

  describe('note triggering', () => {
    it('triggers notes as time advances past their beat', () => {
      const notes = [makeNote(0, 'kick'), makeNote(2, 'snare'), makeNote(4, 'hat')];
      const pb = createPlayback({ notes, baseBpm: 120 });

      // At 120 BPM: 1 beat = 0.5s
      player._setContextTime(0);
      pb.start(0);

      // beat 0 note should already be triggered (elapsed=0, currentBeat=0)
      expect(player.play).toHaveBeenCalledWith('kick');
      player.play.mockClear();

      // Advance to 1.1s => ~2.2 beats => snare (beat 2) should trigger
      player._setContextTime(1.1);
      flushOneFrame();
      expect(player.play).toHaveBeenCalledWith('snare');
      expect(player.play).not.toHaveBeenCalledWith('hat');
      player.play.mockClear();

      // Advance to 2.1s => ~4.2 beats => hat (beat 4) should trigger
      player._setContextTime(2.1);
      flushOneFrame();
      expect(player.play).toHaveBeenCalledWith('hat');

      pb.stop();
    });

    it('does not trigger notes whose keysound is empty/falsy', () => {
      const notes = [makeNote(0, ''), makeNote(2, 'snare')];
      const pb = createPlayback({ notes, baseBpm: 120 });

      player._setContextTime(0);
      pb.start(0);

      // Advance past all notes
      player._setContextTime(5);
      flushOneFrame();

      // play() should only have been called for 'snare'
      const ids = player.play.mock.calls.map((c) => c[0]);
      expect(ids).toEqual(['snare']);

      pb.stop();
    });

    it('triggers all notes even when multiple share the same beat', () => {
      const notes = [makeNote(4, 'a'), makeNote(4, 'b'), makeNote(4, 'c')];
      const pb = createPlayback({ notes, baseBpm: 120 });

      player._setContextTime(0);
      pb.start(0);

      // Advance to 2.5s => beat 5
      player._setContextTime(2.5);
      flushOneFrame();

      const ids = player.play.mock.calls.map((c) => c[0]);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toContain('c');

      pb.stop();
    });
  });

  // ── Playback completion ───────────────────────────────────────────

  describe('playback completion', () => {
    it('calls onEnd when currentBeat passes maxBeat + 4', () => {
      // Single note at beat 4
      const notes = [makeNote(4, 'kick')];
      const pb = createPlayback({ notes, baseBpm: 120 });

      player._setContextTime(0);
      pb.start(0);
      onEnd.mockClear();

      // maxBeat = 4, so completion at > 8 beats
      // At 120 BPM, beat 8.1 => 8.1 * 0.5 = 4.05s
      player._setContextTime(4.1);
      flushOneFrame();

      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(pb.playing).toBe(false);
    });

    it('does not call onEnd prematurely', () => {
      const notes = [makeNote(8, 'snare')];
      const pb = createPlayback({ notes, baseBpm: 120 });

      player._setContextTime(0);
      pb.start(0);
      onEnd.mockClear();

      // Beat 10 (maxBeat+4=12, so not done yet)
      player._setContextTime(5.0); // beat 10
      flushOneFrame();

      expect(onEnd).not.toHaveBeenCalled();
      expect(pb.playing).toBe(true);

      pb.stop();
    });
  });

  // ── Edge: start with no notes ─────────────────────────────────────

  describe('edge: no notes', () => {
    it('starts and immediately completes (maxBeat is 0, so 0+4=4 beats)', () => {
      const pb = createPlayback({ notes: [] });

      player._setContextTime(0);
      pb.start(0);
      onEnd.mockClear();

      // maxBeat=0, ends after beat > 4, at 120 BPM that is >2s
      player._setContextTime(2.1);
      flushOneFrame();

      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });

  // ── Edge: no BPM events (default BPM) ─────────────────────────────

  describe('edge: no BPM changes', () => {
    it('uses baseBpm for timing', () => {
      const notes = [makeNote(4, 'kick')];
      // baseBpm=60 => 1 beat = 1 second
      const pb = createPlayback({ notes, baseBpm: 60, bpmChanges: [] });

      player._setContextTime(0);
      pb.start(0);
      player.play.mockClear();

      // At t=3.9s, beat ~3.9 => kick at beat 4 not yet triggered
      player._setContextTime(3.9);
      flushOneFrame();
      expect(player.play).not.toHaveBeenCalled();

      // At t=4.1s, beat ~4.1 => kick should trigger
      player._setContextTime(4.1);
      flushOneFrame();
      expect(player.play).toHaveBeenCalledWith('kick');

      pb.stop();
    });
  });

  // ── setSpeed() ────────────────────────────────────────────────────

  describe('setSpeed()', () => {
    it('changes the rate of beat advancement', () => {
      const notes = [makeNote(4, 'kick')];
      // baseBpm=120 => 1 beat = 0.5s at speed=1
      // At speed=2: effective 1 beat = 0.25s
      const pb = createPlayback({ notes, baseBpm: 120, speed: 1 });

      player._setContextTime(0);
      pb.start(0);
      player.play.mockClear();

      // At speed=1, t=0.9s => beat 1.8, not enough for beat 4
      player._setContextTime(0.9);
      flushOneFrame();
      expect(player.play).not.toHaveBeenCalled();

      // Now set speed to 4x. This resets timing anchors.
      pb.setSpeed(4);

      // Advance just 0.3s more real-time at 4x speed => 0.3*4 = 1.2s of music time
      // from current beat ~1.8, that adds 1.2/0.5 = 2.4 beats => ~4.2
      player._setContextTime(1.2);
      flushOneFrame();
      expect(player.play).toHaveBeenCalledWith('kick');

      pb.stop();
    });

    it('can be called when not playing without error', () => {
      const pb = createPlayback();
      expect(() => pb.setSpeed(2)).not.toThrow();
    });

    it('accepts fractional speeds', () => {
      const pb = createPlayback({ notes: [makeNote(2, 'kick')], baseBpm: 120 });
      player._setContextTime(0);
      pb.start(0);
      player.play.mockClear();

      // At speed=0.5 and baseBpm=120: effective 1 beat takes 1s
      pb.setSpeed(0.5);

      // After 1.5s real time at 0.5x => 0.75s music time => beat ~1.5 from anchor
      // anchor is at beat 0 (we just started), so not yet at beat 2
      player._setContextTime(1.5);
      flushOneFrame();
      expect(player.play).not.toHaveBeenCalled();

      // After 3s real time from anchor => 1.5s music time from anchor => beat 3
      player._setContextTime(3.0);
      flushOneFrame();
      expect(player.play).toHaveBeenCalledWith('kick');

      pb.stop();
    });
  });

  // ── dispose() ─────────────────────────────────────────────────────

  describe('dispose()', () => {
    it('stops playback', () => {
      const pb = createPlayback();
      pb.start(0);
      pb.dispose();
      expect(pb.playing).toBe(false);
      expect(player.stopAll).toHaveBeenCalled();
    });
  });

  // ── playing getter ────────────────────────────────────────────────

  describe('playing getter', () => {
    it('is false initially', () => {
      const pb = createPlayback();
      expect(pb.playing).toBe(false);
    });

    it('reflects start/stop state', () => {
      const pb = createPlayback();
      pb.start(0);
      expect(pb.playing).toBe(true);
      pb.stop();
      expect(pb.playing).toBe(false);
    });
  });
});
