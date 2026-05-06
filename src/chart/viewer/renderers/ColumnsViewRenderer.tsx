/**
 * ColumnsViewRenderer.tsx
 * Column view (ColumnNotesRenderer, ColumnRenderer, ColumnsViewRenderer)
 * extracted from NoteChartViewer.tsx (Stage E).
 */

import React, { useMemo, useCallback } from 'react';
import { Text, Line } from '@react-three/drei';
import type { BMSNote } from '@rhythm-archive/bms-core';
import type { Positioning } from '@rhythm-archive/bms-core';
import type { LaneConfig } from '../../laneConfig';
import { getLaneBackground } from '../../laneConfig';
import type { NoteTypeFilter, BpmChange, ColumnsLayout } from '../../NoteChartViewer';
import {
  NOTE_HEIGHT,
  NOTE_PADDING,
  sharedNoteGeometry,
  sharedCircleGeometry,
  sharedBgmGeometry,
  sharedLnBodyGeometry,
  getNoteColor,
} from './viewerRenderUtils';
import { InstancedNotes } from './NotesRenderer';

// ─── ColumnNotesRenderer ─────────────────────────────────────────────────────
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
  const getColumnY = useCallback((beat: number) => {
    if (positioning) {
      const pos      = positioning.position(beat);
      const startPos = positioning.position(startBeat);
      return (pos - startPos) * beatScale + NOTE_HEIGHT / 2;
    }
    return (beat - startBeat) * beatScale + NOTE_HEIGHT / 2;
  }, [positioning, startBeat, beatScale]);

  const laneMap    = useMemo(() => new Map(lanes.map(l => [l.id, l])), [lanes]);
  const addedSet   = useMemo(() => new Set(addedNotes.map(n => `${n.beat}-${n.column}`)),   [addedNotes]);
  const removedSet = useMemo(() => new Set(removedNotes.map(n => `${n.beat}-${n.column}`)), [removedNotes]);
  const modifiedSet = useMemo(() => new Set(modifiedNotes.map(n => `${n.beat}-${n.column}`)), [modifiedNotes]);

  const noteGroups = useMemo(() => {
    const groups: Record<string, {
      positions: [number, number][];
      scales:    [number, number][];
      color: string;
      opacity: number;
      zIndex: number;
      type: 'note' | 'circle' | 'bgm' | 'lnBody';
    }> = {};

    const addToGroup = (
      key: string,
      pos:   [number, number],
      scale: [number, number],
      color: string,
      opacity: number,
      zIndex: number,
      type: 'note' | 'circle' | 'bgm' | 'lnBody',
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

      const laneX       = offsetX + lane.x + NOTE_PADDING + (lane.width - NOTE_PADDING * 2) / 2 - columnX;
      const relativeY   = getColumnY(note.beat);
      const width       = lane.width - NOTE_PADDING * 2;
      const noteKey     = `${note.beat}-${note.column}`;
      const isAdded     = diffMode && addedSet.has(noteKey);
      const isRemoved   = diffMode && removedSet.has(noteKey);
      const isModified  = diffMode && modifiedSet.has(noteKey);
      const color       = getNoteColor(note, lane.color, isAdded, isRemoved, isModified);

      if (note.endBeat !== undefined) {
        const endRelativeY = getColumnY(note.endBeat);
        const endY         = Math.min(endRelativeY, columnHeight);
        const startY       = Math.max(relativeY, NOTE_HEIGHT / 2);
        const bodyHeight   = Math.abs(endY - startY);
        const bodyCenter   = (startY + endY) / 2;

        if (bodyHeight > 0) {
          addToGroup(`col-lnBody-${color}`, [laneX, bodyCenter], [width, bodyHeight], color, 0.4, -0.5, 'lnBody');
          if (relativeY >= 0 && relativeY < columnHeight)
            addToGroup(`col-lnNote-${color}`, [laneX, relativeY], [width, 1], color, 1, 0, 'note');
          if (endRelativeY >= 0 && endRelativeY < columnHeight)
            addToGroup(`col-lnNote-${color}`, [laneX, endY], [width, 1], color, 1, 0, 'note');
        }
        continue;
      }

      if (relativeY < 0 || relativeY > columnHeight) continue;

      if (type === 'landmine') {
        const radius = Math.min(width / 2, NOTE_HEIGHT / 2) - 1;
        addToGroup(`col-mine-${color}`, [laneX, relativeY], [radius, radius], color, 1, 0, 'circle');
        continue;
      }

      if (type === 'invisible') {
        addToGroup(`col-invis-${lane.color}`, [laneX, relativeY], [width, 1], lane.color, 0.15, 0, 'note');
        continue;
      }

      if (type === 'bgm') {
        addToGroup('col-bgm', [laneX, relativeY], [width - 4, 1], '#666666', 1, -1, 'bgm');
        continue;
      }

      addToGroup(`col-reg-${color}`, [laneX, relativeY], [width, 1], color, 1, 0, 'note');
    }

    return groups;
  }, [notes, lanes, beatScale, startBeat, columnHeight, offsetX, columnX, noteTypeFilter, diffMode, addedSet, removedSet, modifiedSet, laneMap, getColumnY]); // eslint-disable-line react-hooks/exhaustive-deps

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

// ─── ColumnRenderer ──────────────────────────────────────────────────────────
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
  const offsetX   = columnX - laneWidth / 2;

  const getGridDivisionForBpm = useCallback((bpm: number) => {
    const ratio = bpm / baseBpm;
    if (ratio >= 2)    return Math.max(1, Math.floor(gridDivision / 2));
    if (ratio >= 1.5)  return Math.max(2, Math.floor(gridDivision * 0.75));
    if (ratio <= 0.5)  return gridDivision * 2;
    if (ratio <= 0.75) return Math.floor(gridDivision * 1.5);
    return gridDivision;
  }, [gridDivision, baseBpm]);

  const getBpmAtBeat = useCallback((beat: number) => {
    if (bpmChanges.length === 0) return baseBpm;
    let currentBpm = baseBpm;
    for (const change of bpmChanges) {
      if (change.beat <= beat) currentBpm = change.bpm;
      else break;
    }
    return currentBpm;
  }, [bpmChanges, baseBpm]);

  const measureGrids = useMemo(() => {
    const result: { measure: number; measureY: number; grids: number[] }[] = [];
    for (let i = 0; i <= endMeasure - startMeasure; i++) {
      const measure     = startMeasure + i;
      const measureBeat = measure * 4;
      const measureY    = i * 4 * beatScale;
      const bpm         = getBpmAtBeat(measureBeat);
      const division    = getGridDivisionForBpm(bpm);
      const gridStep    = 1 / division;
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
      {/* Lane backgrounds */}
      {lanes.map((lane) => {
        const color  = getLaneBackground(lane);
        const laneX  = offsetX + lane.x + lane.width / 2 - columnX;
        return (
          <mesh key={`bg-${lane.id}-${lane.width.toFixed(2)}-${columnHeight}`} position={[laneX, columnHeight / 2, -5]}>
            <planeGeometry args={[lane.width, columnHeight]} />
            <meshBasicMaterial color={color} />
          </mesh>
        );
      })}

      {/* Lane dividers */}
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

      {/* Alternating measure backgrounds */}
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

      {/* Grid/beat/measure lines (batched) */}
      {useMemo(() => {
        const halfWidth = laneWidth / 2;
        const measureLines: [number, number, number][] = [];
        const beatLines:    [number, number, number][] = [];
        const gridLines:    [number, number, number][] = [];

        for (const { measureY, grids } of measureGrids) {
          measureLines.push([-halfWidth, measureY, -3], [halfWidth, measureY, -3]);
          for (const beat of [1, 2, 3]) {
            const beatY = measureY + beat * beatScale;
            if (beatY < columnHeight)
              beatLines.push([-halfWidth, beatY, -3], [halfWidth, beatY, -3]);
          }
          for (const gridBeat of grids) {
            const gridY = measureY + gridBeat * beatScale;
            if (gridY < columnHeight && gridY > 0)
              gridLines.push([-halfWidth, gridY, -3], [halfWidth, gridY, -3]);
          }
        }

        return (
          <>
            {measureLines.length > 0 && <Line points={measureLines} color="#6666aa" lineWidth={2} segments />}
            {beatLines.length > 0    && <Line points={beatLines}    color="#444466" segments />}
            {gridLines.length > 0    && <Line points={gridLines}    color="#2a2a44" lineWidth={0.5} segments />}
          </>
        );
      }, [measureGrids, laneWidth, beatScale, columnHeight])}

      {/* Measure numbers */}
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

      {/* Column border */}
      <Line
        points={[
          [-laneWidth / 2, 0, -2],
          [ laneWidth / 2, 0, -2],
          [ laneWidth / 2, columnHeight, -2],
          [-laneWidth / 2, columnHeight, -2],
          [-laneWidth / 2, 0, -2],
        ]}
        color="#444466"
      />
    </group>
  );
}

// ─── ColumnsViewRenderer ─────────────────────────────────────────────────────
export function ColumnsViewRenderer({
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

  const effectiveMeasuresPerColumn = layout === 'vertical' ? totalMeasures : measuresPerColumn;
  const columnHeight = effectiveMeasuresPerColumn * 4 * beatScale;
  const numColumns   = layout === 'vertical' ? 1 : Math.ceil(totalMeasures / measuresPerColumn);

  const columns = useMemo(() => {
    const result = [];
    for (let col = 0; col < numColumns; col++) {
      const startMeasure = col * effectiveMeasuresPerColumn;
      const endMeasure   = Math.min(startMeasure + effectiveMeasuresPerColumn, totalMeasures);
      const colX         = col * columnWidth;
      result.push({ startMeasure, endMeasure, columnX: colX });
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
