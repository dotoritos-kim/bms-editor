import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { BMSParser } from '@rhythm-archive/bms-core';
import { generateLaneConfig, getLaneIds } from '../src/chart/laneConfig';
import { detectKeyMode } from '../src/chart/useBmsChart';
import { buildBeatToTimeMap, beatToTime } from '../src/chart/EditorPlayback';

const BMS_FILE_PATH = 'S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms';

/**
 * Try to load a real BMS file for integration testing.
 * If the file is not available (CI, different machine), skip gracefully.
 */
function loadBmsFile(): { content: string; available: boolean } {
  try {
    const content = readFileSync(BMS_FILE_PATH, 'utf-8');
    return { content, available: true };
  } catch {
    return { content: '', available: false };
  }
}

describe('Integration with bms-core', () => {
  const { content, available } = loadBmsFile();

  it.skipIf(!available)('should parse a real BMS file and detect key mode', () => {
    const parser = new BMSParser();
    const chart = parser.compileString(content);
    const notesObj = parser.getNotes();
    expect(notesObj).not.toBeNull();

    const notes = notesObj!.all();
    expect(notes.length).toBeGreaterThan(0);

    const keyMode = detectKeyMode(notes, chart.headers);
    // This is a 4K chart based on the filename
    expect(keyMode).toBe('4K');
  });

  it.skipIf(!available)('should generate lane config that matches detected key mode', () => {
    const parser = new BMSParser();
    const chart = parser.compileString(content);
    const notes = parser.getNotes()!.all();
    const keyMode = detectKeyMode(notes, chart.headers);

    const lanes = generateLaneConfig(keyMode);
    const laneIds = getLaneIds(keyMode);

    expect(lanes.length).toBeGreaterThan(0);
    expect(laneIds.length).toBe(lanes.length);

    // Every playable note column should be in the lane config
    const playableNotes = notes.filter(
      (n) => n.column && n.noteType !== 'bgm' && n.noteType !== 'landmine'
    );

    const laneIdSet = new Set(laneIds);
    for (const note of playableNotes) {
      if (note.column) {
        expect(laneIdSet.has(note.column)).toBe(true);
      }
    }
  });

  it.skipIf(!available)('should extract BPM and build beat-to-time map', () => {
    const parser = new BMSParser();
    const chart = parser.compileString(content);

    const bpmHeader = chart.headers.get('bpm');
    expect(bpmHeader).toBeDefined();

    const baseBpm = parseFloat(bpmHeader!);
    expect(baseBpm).toBeGreaterThan(0);

    // Collect BPM changes from chart objects
    const objects = chart.objects.allSorted();
    const bpmChanges: Array<{ measure: number; fraction: number; bpm: number }> = [];

    for (const obj of objects) {
      if (obj.channel === '03') {
        const bpmValue = parseInt(obj.value, 16);
        if (!isNaN(bpmValue) && bpmValue > 0) {
          bpmChanges.push({
            measure: obj.measure,
            fraction: obj.fraction,
            bpm: bpmValue,
          });
        }
      } else if (obj.channel === '08') {
        const bpmValue = parseFloat(chart.headers.get('bpm' + obj.value) || '');
        if (!isNaN(bpmValue) && bpmValue > 0) {
          bpmChanges.push({
            measure: obj.measure,
            fraction: obj.fraction,
            bpm: bpmValue,
          });
        }
      }
    }

    const events = buildBeatToTimeMap(bpmChanges, baseBpm);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].beat).toBe(0);
    expect(events[0].bpm).toBe(baseBpm);

    // Time should be monotonically increasing for reasonable beat range
    const notes = parser.getNotes()!.all();
    const maxBeat = Math.max(...notes.map((n) => n.endBeat ?? n.beat));

    let prevTime = -1;
    for (let beat = 0; beat <= maxBeat; beat += 1) {
      const t = beatToTime(beat, events);
      expect(t).toBeGreaterThan(prevTime);
      prevTime = t;
    }
  });

  it.skipIf(!available)('should extract keysound definitions from parsed chart', () => {
    const parser = new BMSParser();
    const chart = parser.compileString(content);

    const keysounds: Record<string, string> = {};
    chart.headers.each((key: string, value: string) => {
      const match = key.match(/^wav(\S\S)$/i);
      if (match) {
        keysounds[match[1].toLowerCase()] = value;
      }
    });

    // The chart should have WAV definitions
    const wavCount = Object.keys(keysounds).length;
    expect(wavCount).toBeGreaterThan(0);

    // Notes should reference keysounds that are defined
    const notes = parser.getNotes()!.all();
    const noteKeysoundIds = new Set(
      notes.filter((n) => n.keysound).map((n) => n.keysound.toLowerCase())
    );

    // At least some note keysound IDs should match WAV definitions
    let matchCount = 0;
    for (const id of noteKeysoundIds) {
      if (keysounds[id]) matchCount++;
    }
    expect(matchCount).toBeGreaterThan(0);
  });

  it.skipIf(!available)('should produce valid song info from parsed chart', () => {
    const parser = new BMSParser();
    parser.compileString(content);
    const songInfo = parser.getSongInfo();

    expect(songInfo).not.toBeNull();
    expect(songInfo!.title).toBeDefined();
    expect(typeof songInfo!.title).toBe('string');
  });
});
