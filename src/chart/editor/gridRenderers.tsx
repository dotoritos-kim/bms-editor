/**
 * Grid & Lane Renderers
 *
 * LanesRenderer, MeasureLinesRenderer, BpmMarkersRenderer, StopMarkersRenderer
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { BMSBpmChange, BMSStopEvent } from '@rhythm-archive/bms-core';
import type { KeyMode } from '../NoteChartViewer';
import { getLaneBackground, getDpSplitIndex, type LaneConfig } from '../laneConfig';
import type { GridSnap } from './types';

// 마디선 색상 상수
const MEASURE_LINE_COLOR = new THREE.Color('#6666aa');
const BEAT_LINE_COLOR = new THREE.Color('#444466');
const GRID_LINE_COLOR = new THREE.Color('#2a2a44');

/** 레인 배경 렌더러 (batched dividers → single LineSegments) */
export const LanesRenderer = React.memo(function LanesRenderer({
  lanes,
  totalHeight,
  keyMode,
}: {
  lanes: LaneConfig[];
  totalHeight: number;
  keyMode?: KeyMode;
}) {
  const totalWidth = (() => { const last = lanes[lanes.length - 1]; return last ? last.x + last.width : 0; })();
  const offsetX = -totalWidth / 2;
  const dividerGeomRef = useRef<THREE.BufferGeometry>(null);
  const dpSplitIndex = keyMode ? getDpSplitIndex(keyMode) : null;

  const laneBackgrounds = useMemo(
    () => lanes.map((lane) => getLaneBackground(lane)),
    [lanes]
  );

  useEffect(() => {
    const geometry = dividerGeomRef.current;
    if (!geometry) return;
    const positions: number[] = [];
    for (const lane of lanes) {
      const x = offsetX + lane.x + lane.width;
      positions.push(x, 0, -4, x, totalHeight, -4);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.computeBoundingSphere();
  }, [lanes, totalHeight, offsetX]);

  return (
    <group>
      {lanes.map((lane, i) => (
        <mesh
          key={lane.id}
          position={[
            offsetX + lane.x + lane.width / 2,
            totalHeight / 2,
            -5,
          ]}
        >
          <planeGeometry args={[lane.width, totalHeight]} />
          <meshBasicMaterial color={laneBackgrounds[i]} />
        </mesh>
      ))}
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={dividerGeomRef} />
        <lineBasicMaterial color="#333366" />
      </lineSegments>
      {dpSplitIndex !== null && dpSplitIndex < lanes.length && (() => {
        const splitLane = lanes[dpSplitIndex];
        const x = offsetX + splitLane.x;
        return (
          <mesh position={[x, totalHeight / 2, -3]}>
            <planeGeometry args={[3, totalHeight]} />
            <meshBasicMaterial color="#ff6600" opacity={0.6} transparent />
          </mesh>
        );
      })()}
    </group>
  );
});

/** 마디선 렌더러 (batched LineSegments + viewport culling with large buffer) */
export const MeasureLinesRenderer = React.memo(function MeasureLinesRenderer({
  totalBeats,
  beatScale,
  totalWidth,
  gridSnap,
  scrollBeat,
  viewportBeats,
  timeSignatures,
  gridSnapOverrides,
}: {
  totalBeats: number;
  beatScale: number;
  totalWidth: number;
  gridSnap: GridSnap;
  scrollBeat: number;
  viewportBeats: number;
  timeSignatures?: Map<number, number>;
  gridSnapOverrides?: Map<number, number>;
}) {
  const lineSegmentsRef = useRef<THREE.LineSegments>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  const BUFFER_MULTIPLIER = 2.0;
  const buffer = viewportBeats * BUFFER_MULTIPLIER;

  const computedRangeRef = useRef<{ min: number; max: number; beatScale: number; gridSnap: number; halfWidth: number }>({
    min: -1, max: -1, beatScale: 0, gridSnap: 0, halfWidth: 0,
  });

  const halfWidth = totalWidth / 2;

  const innerBuffer = viewportBeats * 0.3;
  const prev = computedRangeRef.current;
  const needsRebuild =
    prev.beatScale !== beatScale ||
    prev.gridSnap !== gridSnap ||
    prev.halfWidth !== halfWidth ||
    scrollBeat < prev.min + innerBuffer ||
    scrollBeat + viewportBeats > prev.max - innerBuffer;

  const minBeat = needsRebuild ? Math.max(0, scrollBeat - buffer) : prev.min;
  const maxBeat = needsRebuild ? Math.min(totalBeats, scrollBeat + viewportBeats + buffer) : prev.max;

  useEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;

    const positions: number[] = [];
    const colors: number[] = [];

    const addLine = (y: number, color: THREE.Color) => {
      positions.push(-halfWidth, y, -3, halfWidth, y, -3);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    };

    // 박자표 인식 마디/비트/그리드선 렌더링
    // 마디별 비트 수를 구해서 정확한 위치에 선을 그림
    let measureBeat = 0;
    let measure = 0;
    // 먼저 minBeat 이전까지 skip
    while (measureBeat < minBeat && measure < 9999) {
      const size = timeSignatures?.get(measure) ?? 1.0;
      const beatsInMeasure = 4 * size;
      if (measureBeat + beatsInMeasure > minBeat) break;
      measureBeat += beatsInMeasure;
      measure++;
    }
    // 마디별로 선 생성
    const startMeasure = measure;
    let currentBeat = measureBeat;
    while (currentBeat <= maxBeat && measure < 9999) {
      const size = timeSignatures?.get(measure) ?? 1.0;
      const beatsInMeasure = 4 * size;

      // 마디선
      addLine(currentBeat * beatScale, MEASURE_LINE_COLOR);

      // 비트선 (1비트 간격, 마디선 제외)
      for (let b = 1; b < beatsInMeasure; b++) {
        const beatPos = currentBeat + b;
        if (beatPos > maxBeat) break;
        addLine(beatPos * beatScale, BEAT_LINE_COLOR);
      }

      // 그리드선 (마디별 gridSnap override 지원, 인덱스 기반으로 부동소수점 누적 오차 방지)
      const effectiveSnap = gridSnapOverrides?.get(measure) ?? gridSnap;
      for (let i = 1; i < effectiveSnap; i++) {
        const b = (i * beatsInMeasure) / effectiveSnap;
        const beatPos = currentBeat + b;
        if (beatPos > maxBeat) break;
        const isOnBeat = Math.abs(b - Math.round(b)) < 0.001;
        if (!isOnBeat) {
          addLine(beatPos * beatScale, GRID_LINE_COLOR);
        }
      }

      currentBeat += beatsInMeasure;
      measure++;
    }

    const posArray = new Float32Array(positions);
    const colorArray = new Float32Array(colors);

    geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    geometry.computeBoundingSphere();

    computedRangeRef.current = { min: minBeat, max: maxBeat, beatScale, gridSnap, halfWidth };
  }, [totalBeats, beatScale, gridSnap, halfWidth, minBeat, maxBeat]);

  // 마디 번호 - viewport 내만 (박자표 인식)
  const measureLabels = useMemo(() => {
    const labels: { y: number; label: string }[] = [];
    let beat = 0;
    let m = 0;
    while (beat <= maxBeat && m < 9999) {
      const size = timeSignatures?.get(m) ?? 1.0;
      const beatsInMeasure = 4 * size;
      if (beat >= minBeat) {
        labels.push({ y: beat * beatScale, label: `#${String(m).padStart(3, '0')}` });
      }
      beat += beatsInMeasure;
      m++;
    }
    return labels;
  }, [beatScale, minBeat, maxBeat, timeSignatures]);

  return (
    <group>
      <lineSegments ref={lineSegmentsRef} frustumCulled={false}>
        <bufferGeometry ref={geometryRef} />
        <lineBasicMaterial vertexColors />
      </lineSegments>
      {measureLabels.map(({ y, label }) => (
        <Text
          key={label}
          position={[-halfWidth - 30, y + 8, -3]}
          fontSize={10}
          color="#8888cc"
          anchorX="right"
          anchorY="middle"
          font={undefined}
        >
          {label}
        </Text>
      ))}
    </group>
  );
});

/** BPM 마커 렌더러 (batched LineSegments + viewport-culled Text) */
export const BpmMarkersRenderer = React.memo(function BpmMarkersRenderer({
  bpmChanges,
  beatScale,
  totalWidth,
  scrollBeat,
  viewportBeats,
}: {
  bpmChanges: BMSBpmChange[];
  beatScale: number;
  totalWidth: number;
  scrollBeat: number;
  viewportBeats: number;
}) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const halfWidth = totalWidth / 2;

  useEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;
    const positions: number[] = [];
    for (const change of bpmChanges) {
      const y = (change.measure * 4 + change.fraction * 4) * beatScale;
      positions.push(-halfWidth, y, 5, halfWidth, y, 5);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.computeBoundingSphere();
  }, [bpmChanges, beatScale, halfWidth]);

  const buffer = viewportBeats * 0.5;
  const minBeat = scrollBeat - buffer;
  const maxBeat = scrollBeat + viewportBeats + buffer;
  const visibleLabels = useMemo(() => {
    return bpmChanges
      .map((change) => {
        const beat = change.measure * 4 + change.fraction * 4;
        return { beat, y: beat * beatScale, bpm: change.bpm };
      })
      .filter((l) => l.beat >= minBeat && l.beat <= maxBeat);
  }, [bpmChanges, beatScale, minBeat, maxBeat]);

  return (
    <group>
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={geometryRef} />
        <lineBasicMaterial color="#ff6600" />
      </lineSegments>
      {visibleLabels.map((l, i) => (
        <Text
          key={i}
          position={[halfWidth + 30, l.y, 5]}
          fontSize={10}
          color="#ff6600"
          anchorX="left"
          anchorY="middle"
          font={undefined}
        >
          BPM {l.bpm}
        </Text>
      ))}
    </group>
  );
});

/** STOP 마커 렌더러 (batched LineSegments + viewport-culled Text) */
export const StopMarkersRenderer = React.memo(function StopMarkersRenderer({
  stopEvents,
  beatScale,
  totalWidth,
  scrollBeat,
  viewportBeats,
}: {
  stopEvents: BMSStopEvent[];
  beatScale: number;
  totalWidth: number;
  scrollBeat: number;
  viewportBeats: number;
}) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const halfWidth = totalWidth / 2;

  useEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;
    const positions: number[] = [];
    for (const stop of stopEvents) {
      const y = (stop.measure * 4 + stop.fraction * 4) * beatScale;
      positions.push(-halfWidth, y, 5, halfWidth, y, 5);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.computeBoundingSphere();
  }, [stopEvents, beatScale, halfWidth]);

  const buffer = viewportBeats * 0.5;
  const minBeat = scrollBeat - buffer;
  const maxBeat = scrollBeat + viewportBeats + buffer;
  const visibleLabels = useMemo(() => {
    return stopEvents
      .map((stop) => {
        const beat = stop.measure * 4 + stop.fraction * 4;
        const durationBeats = stop.duration / 192;
        return { beat, y: beat * beatScale, label: `STOP ${durationBeats.toFixed(2)}b` };
      })
      .filter((l) => l.beat >= minBeat && l.beat <= maxBeat);
  }, [stopEvents, beatScale, minBeat, maxBeat]);

  return (
    <group>
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={geometryRef} />
        <lineBasicMaterial color="#cc33ff" />
      </lineSegments>
      {visibleLabels.map((l, i) => (
        <Text
          key={i}
          position={[halfWidth + 30, l.y, 5]}
          fontSize={10}
          color="#cc33ff"
          anchorX="left"
          anchorY="middle"
          font={undefined}
        >
          {l.label}
        </Text>
      ))}
    </group>
  );
});
