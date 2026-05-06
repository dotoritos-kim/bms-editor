/**
 * GridRenderers.tsx
 * Lane background + measure/beat/grid line renderers for NoteChartViewer.
 * Extracted from NoteChartViewer.tsx (Stage E).
 */

import React, { useMemo, useCallback } from 'react';
import { Text } from '@react-three/drei';
import { Line } from '@react-three/drei';
import type { Positioning } from '@rhythm-archive/bms-core';
import type { LaneConfig } from '../../laneConfig';
import { getLaneBackground } from '../../laneConfig';
import type { BpmChange } from '../../NoteChartViewer';

// ─── LanesRenderer ───────────────────────────────────────────────────────────
export const LanesRenderer = React.memo(function LanesRenderer({
  lanes,
  totalHeight,
  totalWidth,
}: {
  lanes: LaneConfig[];
  totalHeight: number;
  totalWidth: number;
}) {
  const offsetX = -totalWidth / 2;

  const laneData = useMemo(() => lanes.map((lane) => ({
    id: lane.id,
    color: getLaneBackground(lane),
    position: [offsetX + lane.x + lane.width / 2, totalHeight / 2, -5] as [number, number, number],
    size: [lane.width, totalHeight] as [number, number],
    dividerX: offsetX + lane.x + lane.width,
  })), [lanes, offsetX, totalHeight]);

  return (
    <group>
      {laneData.map((lane) => (
        <mesh key={lane.id} position={lane.position}>
          <planeGeometry args={lane.size} />
          <meshBasicMaterial color={lane.color} />
        </mesh>
      ))}
      {laneData.map((lane) => (
        <Line
          key={`divider-${lane.id}`}
          points={[[lane.dividerX, 0, -4], [lane.dividerX, totalHeight, -4]]}
          color="#333366"
        />
      ))}
    </group>
  );
});

// ─── MeasureLinesRenderer ────────────────────────────────────────────────────
export const MeasureLinesRenderer = React.memo(function MeasureLinesRenderer({
  totalBeats,
  beatScale,
  totalWidth,
  gridDivision = 4,
  bpmChanges = [],
  baseBpm = 150,
  positioning,
}: {
  totalBeats: number;
  beatScale: number;
  totalWidth: number;
  gridDivision?: number;
  bpmChanges?: BpmChange[];
  baseBpm?: number;
  positioning?: Positioning | null;
}) {
  const getLineY = useCallback((beat: number) => {
    return positioning ? positioning.position(beat) * beatScale : beat * beatScale;
  }, [positioning, beatScale]);

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

  const lines = useMemo(() => {
    const result: { y: number; type: 'measure' | 'beat' | 'grid'; measureNum: number }[] = [];

    for (let beat = 0; beat <= totalBeats; beat++) {
      const isMeasure = beat % 4 === 0;
      result.push({ y: getLineY(beat), type: isMeasure ? 'measure' : 'beat', measureNum: Math.floor(beat / 4) });
    }

    for (let measure = 0; measure < Math.ceil(totalBeats / 4); measure++) {
      const measureStartBeat = measure * 4;
      const bpm = getBpmAtBeat(measureStartBeat);
      const division = getGridDivisionForBpm(bpm);
      const gridStep = 1 / division;

      for (let beatInMeasure = 0; beatInMeasure < 4; beatInMeasure++) {
        for (let grid = 1; grid < division; grid++) {
          const beat = measureStartBeat + beatInMeasure + grid * gridStep;
          if (beat > totalBeats) break;
          const roundedBeat = Math.round(beat * 1000) / 1000;
          result.push({ y: getLineY(roundedBeat), type: 'grid', measureNum: measure });
        }
      }
    }

    return result.sort((a, b) => a.y - b.y);
  }, [totalBeats, beatScale, getBpmAtBeat, getGridDivisionForBpm, getLineY]); // eslint-disable-line react-hooks/exhaustive-deps

  const halfWidth = totalWidth / 2;
  const totalMeasures = Math.ceil(totalBeats / 4);
  const MAX_VALID_Y = 1e7;

  const lineBuffers = useMemo(() => {
    const measure: number[] = [];
    const beat: number[] = [];
    const grid: number[] = [];
    const measureYPositions: { y: number; measureNum: number }[] = [];

    for (const { y, type, measureNum } of lines) {
      if (!Number.isFinite(y) || Math.abs(y) > MAX_VALID_Y) continue;
      const arr = type === 'measure' ? measure : type === 'beat' ? beat : grid;
      arr.push(-halfWidth, y, -3, halfWidth, y, -3);
      if (type === 'measure') {
        measureYPositions.push({ y, measureNum });
      }
    }

    return {
      measure: new Float32Array(measure),
      beat: new Float32Array(beat),
      grid: new Float32Array(grid),
      measureYPositions,
    };
  }, [lines, halfWidth]);

  return (
    <group>
      {/* Alternating measure backgrounds */}
      {Array.from({ length: totalMeasures }, (_, i) => {
        const measureStartBeat = i * 4;
        const measureEndBeat   = (i + 1) * 4;
        const measureY    = getLineY(measureStartBeat);
        const measureEndY = getLineY(measureEndBeat);
        if (!Number.isFinite(measureY) || !Number.isFinite(measureEndY) ||
            Math.abs(measureY) > MAX_VALID_Y || Math.abs(measureEndY) > MAX_VALID_Y) {
          return null;
        }
        const measureHeight = Math.abs(measureEndY - measureY);
        const measureCenter = (measureY + measureEndY) / 2;
        return i % 2 === 1 ? (
          <mesh key={`bg-${i}`} position={[0, measureCenter, -6]}>
            <planeGeometry args={[totalWidth, measureHeight]} />
            <meshBasicMaterial color="#1a1a2e" opacity={0.3} transparent />
          </mesh>
        ) : null;
      })}

      {/* Grid lines */}
      {lineBuffers.grid.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={lineBuffers.grid.length / 3} args={[lineBuffers.grid, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#2a2a44" linewidth={1} />
        </lineSegments>
      )}

      {/* Beat lines */}
      {lineBuffers.beat.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={lineBuffers.beat.length / 3} args={[lineBuffers.beat, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#444466" linewidth={1} />
        </lineSegments>
      )}

      {/* Measure lines */}
      {lineBuffers.measure.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={lineBuffers.measure.length / 3} args={[lineBuffers.measure, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#6666aa" linewidth={1} />
        </lineSegments>
      )}

      {/* Measure numbers */}
      {lineBuffers.measureYPositions
        .filter((_, i, arr) => {
          const step = arr.length <= 30 ? 1 : Math.ceil(arr.length / 30);
          return i % step === 0;
        })
        .map(({ y, measureNum }) => (
          <group key={`measure-label-${measureNum}`}>
            <mesh position={[-halfWidth - 16, y, -0.5]}>
              <planeGeometry args={[28, 18]} />
              <meshBasicMaterial color="#1a1a2e" opacity={0.85} transparent />
            </mesh>
            <Text
              position={[-halfWidth - 16, y, 0]}
              fontSize={13}
              color="#8888bb"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.3}
              outlineColor="#000000"
            >
              {measureNum}
            </Text>
          </group>
        ))}
    </group>
  );
});
