/**
 * Grid & Lane Renderers
 *
 * LanesRenderer, MeasureLinesRenderer, BpmMarkersRenderer, StopMarkersRenderer
 */

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BMSBpmChange, BMSStopEvent } from '@rhythm-archive/bms-core';
import type { KeyMode } from '../NoteChartViewer';
import { getLaneBackground, getDpSplitIndex, type LaneConfig } from '../laneConfig';
import type { GridSnap } from './types';
import { _dummy, _color } from './editorUtils';

// 마디선 색상 상수
const MEASURE_LINE_COLOR = new THREE.Color('#6666aa');
const BEAT_LINE_COLOR = new THREE.Color('#444466');
const GRID_LINE_COLOR = new THREE.Color('#2a2a44');

/**
 * Individual text labels rendered as separate sprites with correct proportions.
 * Each label gets its own small CanvasTexture so aspect ratio is always correct.
 */
const LABEL_FONT_PX = 20;
const LABEL_WORLD_HEIGHT = 6; // world units height per label

const _labelGeometry = new THREE.PlaneGeometry(1, 1);
const _labelMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

function _getOrCreateLabelMaterial(text: string, color: string): { material: THREE.MeshBasicMaterial; aspect: number } {
  const key = `${text}\0${color}`;
  const cached = _labelMaterialCache.get(key);
  if (cached) return { material: cached, aspect: (cached.map as THREE.CanvasTexture).image.width / (cached.map as THREE.CanvasTexture).image.height };

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${LABEL_FONT_PX}px monospace`;
  const metrics = ctx.measureText(text);
  const pad = 4;
  const w = Math.ceil(metrics.width) + pad * 2;
  const h = LABEL_FONT_PX + pad * 2;
  canvas.width = w;
  canvas.height = h;
  ctx.font = `bold ${LABEL_FONT_PX}px monospace`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  _labelMaterialCache.set(key, material);
  return { material, aspect: w / h };
}

export const TextLabels = React.memo(function TextLabels({
  labels,
  x,
  z,
  color,
  align,
  worldHeight = LABEL_WORLD_HEIGHT,
}: {
  labels: { y: number; text: string }[];
  x: number;
  z: number;
  color: string;
  align: 'left' | 'right';
  worldHeight?: number;
}) {
  if (labels.length === 0) return null;
  return (
    <>
      {labels.map((label, i) => {
        const { material, aspect } = _getOrCreateLabelMaterial(label.text, color);
        const worldW = worldHeight * aspect;
        const offsetX = align === 'left' ? worldW / 2 : -worldW / 2;
        return (
          <mesh
            key={`${label.text}-${label.y}`}
            position={[x + offsetX, label.y, z]}
            scale={[worldW, worldHeight, 1]}
            geometry={_labelGeometry}
            material={material}
            frustumCulled={false}
          />
        );
      })}
    </>
  );
});

/** 현재 마디 하이라이트 — scrollBeat(뷰포트 하단) 기준으로 해당 마디 전체를 반투명 밴드로 표시 */
export const CurrentMeasureHighlight = React.memo(function CurrentMeasureHighlight({
  currentBeat,
  totalWidth,
  beatScale,
  timeSignatures,
}: {
  currentBeat: number;
  totalWidth: number;
  beatScale: number;
  timeSignatures?: Map<number, number>;
}) {
  const { startBeat, measureBeats } = useMemo(() => {
    let beat = 0;
    let m = 0;
    while (m < 9999) {
      const size = timeSignatures?.get(m) ?? 1.0;
      const beatsInMeasure = 4 * size;
      if (beat + beatsInMeasure > currentBeat) break;
      beat += beatsInMeasure;
      m++;
    }
    const size = timeSignatures?.get(m) ?? 1.0;
    return { startBeat: beat, measureBeats: 4 * size };
  }, [currentBeat, timeSignatures]);

  const height = measureBeats * beatScale;
  const centerY = startBeat * beatScale + height / 2;

  return (
    <group>
      <mesh position={[0, centerY, -4.5]} frustumCulled={false}>
        <planeGeometry args={[totalWidth, height]} />
        <meshBasicMaterial color="#4488ff" opacity={0.1} transparent depthWrite={false} />
      </mesh>
      {/* 상단 테두리 */}
      <mesh position={[0, startBeat * beatScale + height, -4.4]} frustumCulled={false}>
        <planeGeometry args={[totalWidth, 2]} />
        <meshBasicMaterial color="#6699ff" opacity={0.7} transparent depthWrite={false} />
      </mesh>
      {/* 하단 테두리 */}
      <mesh position={[0, startBeat * beatScale, -4.4]} frustumCulled={false}>
        <planeGeometry args={[totalWidth, 2]} />
        <meshBasicMaterial color="#6699ff" opacity={0.4} transparent depthWrite={false} />
      </mesh>
    </group>
  );
});

/** @deprecated Use TextLabels instead */
export const TextBatchStrip = React.memo(function TextBatchStrip({
  labels,
  x,
  z,
  color,
  align,
  stripWidth = 60,
}: {
  labels: { y: number; text: string }[];
  x: number;
  z: number;
  minY: number;
  maxY: number;
  color: string;
  align: 'left' | 'right';
  stripWidth?: number;
}) {
  return <TextLabels labels={labels} x={x} z={z} color={color} align={align} worldHeight={LABEL_WORLD_HEIGHT} />;
});

/** 레인 배경 렌더러 (InstancedMesh 1 draw call + batched dividers LineSegments) */
const MAX_LANE_INSTANCES = 50;

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
  const laneMeshRef = useRef<THREE.InstancedMesh>(null);
  const dividerGeomRef = useRef<THREE.BufferGeometry>(null);
  const dpSplitIndex = keyMode ? getDpSplitIndex(keyMode) : null;

  const laneBackgrounds = useMemo(
    () => lanes.map((lane) => getLaneBackground(lane)),
    [lanes]
  );

  // Lane backgrounds → single InstancedMesh
  useEffect(() => {
    const mesh = laneMeshRef.current;
    if (!mesh) return;
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      _dummy.position.set(offsetX + lane.x + lane.width / 2, totalHeight / 2, -5);
      _dummy.scale.set(lane.width, totalHeight, 1);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      _color.set(laneBackgrounds[i]);
      mesh.setColorAt(i, _color);
    }
    mesh.count = lanes.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [lanes, totalHeight, offsetX, laneBackgrounds]);

  // Lane dividers → batched LineSegments
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
      <instancedMesh
        ref={laneMeshRef}
        args={[undefined, undefined, MAX_LANE_INSTANCES]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>
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
    // 저줌 시 draw call 감소: viewport에 최대 ~16개 레이블만 표시
    const labelStep = Math.max(1, Math.ceil(viewportBeats / 16));
    let beat = 0;
    let m = 0;
    while (beat <= maxBeat && m < 9999) {
      const size = timeSignatures?.get(m) ?? 1.0;
      const beatsInMeasure = 4 * size;
      if (beat >= minBeat && m % labelStep === 0) {
        labels.push({ y: beat * beatScale, label: `#${String(m).padStart(3, '0')}` });
      }
      beat += beatsInMeasure;
      m++;
    }
    return labels;
  }, [beatScale, minBeat, maxBeat, timeSignatures, viewportBeats]);

  const textLabels = useMemo(
    () => measureLabels.map((l) => ({ y: l.y + 8, text: l.label })),
    [measureLabels]
  );

  return (
    <group>
      <lineSegments ref={lineSegmentsRef} frustumCulled={false}>
        <bufferGeometry ref={geometryRef} />
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <TextLabels
        labels={textLabels}
        x={-halfWidth - 4}
        z={-3}
        color="#8888cc"
        align="right"
      />
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

  const bpmTextLabels = useMemo(
    () => visibleLabels.map((l) => ({ y: l.y, text: `BPM ${l.bpm}` })),
    [visibleLabels]
  );

  return (
    <group>
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={geometryRef} />
        <lineBasicMaterial color="#ff6600" />
      </lineSegments>
      <TextLabels
        labels={bpmTextLabels}
        x={halfWidth + 4}
        z={5}
        color="#ff6600"
        align="left"
      />
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

  const stopTextLabels = useMemo(
    () => visibleLabels.map((l) => ({ y: l.y, text: l.label })),
    [visibleLabels]
  );

  return (
    <group>
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={geometryRef} />
        <lineBasicMaterial color="#cc33ff" />
      </lineSegments>
      <TextLabels
        labels={stopTextLabels}
        x={halfWidth + 4}
        z={5}
        color="#cc33ff"
        align="left"
      />
    </group>
  );
});
