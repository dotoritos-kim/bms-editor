/**
 * TimingMarkersRenderer.tsx
 * BPM / STOP / SCROLL timing marker rendering for NoteChartViewer.
 * Extracted from NoteChartViewer.tsx (Stage E).
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Positioning } from '@rhythm-archive/bms-core';
import type { BpmChange, StopEvent, ScrollSpeedChange, TimingMarkerSettings } from '../../NoteChartViewer';
import { createTextTexture, collectLinePoints, filterTextsByDensity } from './viewerRenderUtils';

// ─── InstancedBpmSprites ─────────────────────────────────────────────────────
const InstancedBpmSprites = React.memo(function InstancedBpmSprites({
  texture,
  positions,
  width,
  height,
  xOffset,
  opacity,
}: {
  texture: THREE.CanvasTexture;
  positions: number[];
  width: number;
  height: number;
  xOffset: number;
  opacity: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const resourcesRef = useRef<{
    geometry: THREE.PlaneGeometry | null;
    material: THREE.MeshBasicMaterial | null;
  }>({ geometry: null, material: null });

  const geometry = useMemo(() => new THREE.PlaneGeometry(width, height), [width, height]);

  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [texture, opacity]);

  useEffect(() => {
    const prev = resourcesRef.current;
    if (prev.geometry && prev.geometry !== geometry) prev.geometry.dispose();
    if (prev.material && prev.material !== material) prev.material.dispose();
    resourcesRef.current.geometry = geometry;
    resourcesRef.current.material = material;
  }, [geometry, material]);

  useEffect(() => {
    return () => {
      resourcesRef.current.geometry?.dispose();
      resourcesRef.current.material?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!meshRef.current || positions.length === 0) return;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < positions.length; i++) {
      matrix.makeTranslation(xOffset, positions[i], 3);
      meshRef.current.setMatrixAt(i, matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, xOffset]);

  if (positions.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, positions.length]}
      frustumCulled={false}
    />
  );
});

// ─── InstancedBpmTexts ───────────────────────────────────────────────────────
const InstancedBpmTexts = React.memo(function InstancedBpmTexts({
  bpmChanges,
  getMarkerY,
  halfWidth,
  color,
  opacity,
  fontSize,
}: {
  bpmChanges: BpmChange[];
  getMarkerY: (beat: number) => number;
  halfWidth: number;
  color: string;
  opacity: number;
  fontSize: number;
}) {
  const textureCacheRef = useRef<Map<number, { texture: THREE.CanvasTexture; width: number; height: number }> | null>(null);

  const bpmGroups = useMemo(() => {
    const groups = new Map<number, BpmChange[]>();
    for (const change of bpmChanges) {
      const bpm = change.bpm;
      if (!groups.has(bpm)) groups.set(bpm, []);
      groups.get(bpm)!.push(change);
    }
    return groups;
  }, [bpmChanges]);

  const textureCache = useMemo(() => {
    const cache = new Map<number, { texture: THREE.CanvasTexture; width: number; height: number }>();
    for (const bpm of bpmGroups.keys()) {
      const bpmText = Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
      cache.set(bpm, createTextTexture(`BPM ${bpmText}`, color, fontSize));
    }
    return cache;
  }, [bpmGroups, color, fontSize]);

  useEffect(() => {
    const prevCache = textureCacheRef.current;
    if (prevCache && prevCache !== textureCache) {
      prevCache.forEach(({ texture }) => texture.dispose());
    }
    textureCacheRef.current = textureCache;
  }, [textureCache]);

  useEffect(() => {
    return () => {
      textureCacheRef.current?.forEach(({ texture }) => texture.dispose());
    };
  }, []);

  return (
    <group>
      {Array.from(bpmGroups.entries()).map(([bpm, changes]) => {
        const cached = textureCache.get(bpm);
        if (!cached) return null;
        const { texture, width, height } = cached;
        const positions = changes
          .map(c => getMarkerY(c.beat))
          .filter(y => Number.isFinite(y) && Math.abs(y) < 1e7);
        if (positions.length === 0) return null;
        return (
          <InstancedBpmSprites
            key={`bpm-${bpm}`}
            texture={texture}
            positions={positions}
            width={width}
            height={height}
            xOffset={-halfWidth - 45}
            opacity={opacity}
          />
        );
      })}
    </group>
  );
});

// ─── TimingMarkersRenderer ───────────────────────────────────────────────────
export function TimingMarkersRenderer({
  bpmChanges,
  stops,
  scrollChanges,
  beatScale,
  baseBeatScale,
  totalWidth,
  showMarkers,
  positioning,
  settings,
}: {
  bpmChanges: BpmChange[];
  stops: StopEvent[];
  scrollChanges: ScrollSpeedChange[];
  beatScale: number;
  baseBeatScale: number;
  totalWidth: number;
  showMarkers: boolean;
  positioning?: Positioning | null;
  settings: TimingMarkerSettings;
}) {
  const halfWidth = totalWidth / 2;
  const rawScaleY = baseBeatScale / beatScale;
  const getTextBoxHeight = (fontSize: number) => fontSize * 1.5;
  const textBoxWidth = 85;
  const MIN_TEXT_SPACING = 50;

  const getMarkerY = useCallback((beat: number) => {
    return positioning ? positioning.position(beat) * beatScale : beat * beatScale;
  }, [positioning, beatScale]);

  const getBackgroundColor = useCallback((color: string) => {
    if (color.includes('ff') && color.includes('88')) return '#001a0a';
    if (color.includes('ff') && color.includes('44')) return '#1a0000';
    if (color.includes('ff') && color.includes('00ff')) return '#001a1a';
    if (color.includes('ff00ff')) return '#1a001a';
    return '#0a0a0a';
  }, []);

  const calculateYOffset = useCallback((currentBeat: number, items: { beat: number }[], index: number, boxHeight: number) => {
    let offset = 0;
    const minSpacing = boxHeight + 4;
    for (let j = 0; j < index; j++) {
      const prevY = getMarkerY(items[j].beat);
      const currentY = getMarkerY(currentBeat);
      const distance = Math.abs(currentY - prevY);
      if (distance < minSpacing) offset += (minSpacing - distance);
    }
    return offset;
  }, [getMarkerY]);

  const bpmLineData = useMemo(() => {
    if (!settings.bpm.visible || !settings.bpm.showLine) return [];
    return collectLinePoints(bpmChanges, getMarkerY, halfWidth, settings.bpm.color);
  }, [bpmChanges, getMarkerY, halfWidth, settings.bpm.visible, settings.bpm.showLine, settings.bpm.color]);

  const stopLineData = useMemo(() => {
    if (!settings.stop.visible || !settings.stop.showLine) return [];
    const points: [number, number, number][] = [];
    for (const stop of stops) {
      const y = getMarkerY(stop.beat);
      const stopHeight = Math.max(stop.duration * beatScale, 4);
      points.push([-halfWidth, y, 2], [halfWidth, y, 2]);
      points.push([-halfWidth, y + stopHeight, 2], [halfWidth, y + stopHeight, 2]);
    }
    return [{ points, color: settings.stop.color }];
  }, [stops, getMarkerY, halfWidth, beatScale, settings.stop.visible, settings.stop.showLine, settings.stop.color]);

  const scrollLineData = useMemo(() => {
    if (!settings.scroll.visible || !settings.scroll.showLine) return [];
    const itemsWithColor = scrollChanges.map(s => ({
      ...s,
      color: s.speed < 0 ? '#ff00ff' : settings.scroll.color,
    }));
    return collectLinePoints(itemsWithColor, getMarkerY, halfWidth, settings.scroll.color);
  }, [scrollChanges, getMarkerY, halfWidth, settings.scroll.visible, settings.scroll.showLine, settings.scroll.color]);

  const filteredStops = useMemo(() =>
    filterTextsByDensity(stops, getMarkerY, MIN_TEXT_SPACING),
  [stops, getMarkerY]);

  const filteredScrollChanges = useMemo(() =>
    filterTextsByDensity(scrollChanges, getMarkerY, MIN_TEXT_SPACING),
  [scrollChanges, getMarkerY]);

  if (!showMarkers) return null;

  return (
    <group>
      {bpmLineData.map((data, i) => (
        <Line key={`bpm-lines-${i}`} points={data.points} color={data.color} lineWidth={2.5} transparent opacity={settings.bpm.opacity} segments />
      ))}

      {stopLineData.map((data, i) => (
        <Line key={`stop-lines-${i}`} points={data.points} color={data.color} lineWidth={2} transparent opacity={settings.stop.opacity} segments />
      ))}

      {scrollLineData.map((data, i) => (
        <Line key={`scroll-lines-${i}`} points={data.points} color={data.color} lineWidth={2.5} transparent opacity={settings.scroll.opacity} segments />
      ))}

      {settings.stop.visible && settings.stop.showBackground && stops.map((stop, i) => {
        const y = getMarkerY(stop.beat);
        const stopHeight = Math.max(stop.duration * beatScale, 4);
        return (
          <mesh key={`stop-bg-${i}`} position={[0, y + stopHeight / 2, 1]}>
            <planeGeometry args={[totalWidth, stopHeight]} />
            <meshBasicMaterial color={settings.stop.color} opacity={settings.stop.opacity * 0.15} transparent />
          </mesh>
        );
      })}

      {settings.bpm.visible && (
        <InstancedBpmTexts
          bpmChanges={bpmChanges}
          getMarkerY={getMarkerY}
          halfWidth={halfWidth}
          color={settings.bpm.color}
          opacity={settings.bpm.opacity}
          fontSize={settings.bpm.fontSize}
        />
      )}

      {settings.stop.visible && filteredStops.map((stop, i) => {
        const y = getMarkerY(stop.beat);
        const fontSize = settings.stop.fontSize;
        const textBoxHeight = getTextBoxHeight(fontSize);
        const yOffset = calculateYOffset(stop.beat, filteredStops, i, textBoxHeight * rawScaleY);
        const bgColor = getBackgroundColor(settings.stop.color);
        return (
          <group key={`stop-text-${i}`}>
            {settings.stop.showBackground && (
              <mesh position={[-halfWidth - textBoxWidth / 2 - 4, y + yOffset + textBoxHeight / 2, 2.5]}>
                <planeGeometry args={[textBoxWidth, textBoxHeight + 6]} />
                <meshBasicMaterial color={bgColor} opacity={settings.stop.opacity * 0.9} transparent />
              </mesh>
            )}
            <Text
              position={[-halfWidth - 8, y + yOffset + textBoxHeight / 2, 3]}
              fontSize={fontSize}
              color={settings.stop.color}
              anchorX="left"
              anchorY="middle"
              outlineWidth={1}
              outlineColor="#000000"
              fontWeight="bold"
              fillOpacity={settings.stop.opacity}
            >
              STOP {Math.round(stop.duration * 48)}
            </Text>
          </group>
        );
      })}

      {settings.scroll.visible && filteredScrollChanges.map((scroll, i) => {
        const y = getMarkerY(scroll.beat);
        const isNegative = scroll.speed < 0;
        const markerColor = isNegative ? '#ff00ff' : settings.scroll.color;
        const fontSize = settings.scroll.fontSize;
        const textBoxHeight = getTextBoxHeight(fontSize);
        const yOffset = calculateYOffset(scroll.beat, filteredScrollChanges, i, textBoxHeight * rawScaleY);
        const bgColor = isNegative ? '#1a001a' : getBackgroundColor(settings.scroll.color);
        return (
          <group key={`scroll-text-${i}`}>
            {settings.scroll.showBackground && (
              <mesh position={[-halfWidth + textBoxWidth / 2 - 10, y + yOffset + textBoxHeight / 2, 2.5]}>
                <planeGeometry args={[textBoxWidth - 20, textBoxHeight + 6]} />
                <meshBasicMaterial color={bgColor} opacity={settings.scroll.opacity * 0.9} transparent />
              </mesh>
            )}
            <Text
              position={[-halfWidth + 8, y + yOffset + textBoxHeight / 2, 3]}
              fontSize={fontSize}
              color={markerColor}
              anchorX="left"
              anchorY="middle"
              outlineWidth={1}
              outlineColor="#000000"
              fontWeight="bold"
              fillOpacity={settings.scroll.opacity}
            >
              {isNegative ? '↓' : '×'}{Math.abs(scroll.speed).toFixed(2)}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
