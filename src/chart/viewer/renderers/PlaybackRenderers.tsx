/**
 * PlaybackRenderers.tsx
 * Camera controllers, JudgmentLine, HitEffects renderers.
 * Extracted from NoteChartViewer.tsx (Stage E).
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Positioning } from '@rhythm-archive/bms-core';
import type { Line2, LineSegments2 } from 'three-stdlib';

// ─── HitEffect type ──────────────────────────────────────────────────────────
export interface HitEffect {
  x: number;
  y: number;
  width: number;
  color: string;
  time: number;
}

// ─── SceneInvalidator ────────────────────────────────────────────────────────
export function SceneInvalidator({ deps }: { deps: unknown[] }) {
  const { invalidate } = useThree();
  const prevDepsRef = useRef<unknown[]>(deps);

  useEffect(() => {
    const hasChanged = deps.some((dep, i) => dep !== prevDepsRef.current[i]);
    if (hasChanged) {
      invalidate();
      prevDepsRef.current = deps;
    }
  }, [deps, invalidate]);

  return null;
}

// ─── CameraController ────────────────────────────────────────────────────────
export function CameraController({
  scrollBeat,
  beatScale,
  isPlaying,
  playbackBeatRef,
  cameraOffset,
  positioning,
  chartWidth,
  viewportHeight,
}: {
  scrollBeat: number;
  beatScale: number;
  isPlaying: boolean;
  playbackBeatRef: React.MutableRefObject<number>;
  cameraOffset: number;
  positioning?: Positioning | null;
  chartWidth: number;
  viewportHeight: number;
}) {
  const { camera, invalidate } = useThree();
  const LEFT_MARGIN = 90;

  useEffect(() => {
    const orthoCam = camera as THREE.OrthographicCamera;
    orthoCam.left   = -chartWidth / 2 - LEFT_MARGIN;
    orthoCam.right  = chartWidth / 2;
    orthoCam.top    = viewportHeight / 2;
    orthoCam.bottom = -viewportHeight / 2;
    orthoCam.updateProjectionMatrix();
    invalidate();
  }, [camera, chartWidth, viewportHeight, invalidate]);

  useFrame(() => {
    const targetBeat = isPlaying ? playbackBeatRef.current : scrollBeat;
    const targetY = positioning
      ? positioning.position(targetBeat) * beatScale
      : targetBeat * beatScale;
    camera.position.y = THREE.MathUtils.lerp(
      camera.position.y,
      targetY + cameraOffset,
      isPlaying ? 1 : 0.15,
    );
  });

  return null;
}

// ─── ColumnsCameraController ─────────────────────────────────────────────────
export function ColumnsCameraController({
  centerX,
  centerY,
}: {
  centerX: number;
  centerY: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(centerX, centerY, 100);
    camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, centerX, centerY]);

  return null;
}

// ─── JudgmentLine ────────────────────────────────────────────────────────────
export function JudgmentLine({
  width,
  playbackBeatRef,
  beatScale,
  positioning,
}: {
  width: number;
  playbackBeatRef: React.MutableRefObject<number>;
  beatScale: number;
  positioning?: Positioning | null;
}) {
  const lineRef = useRef<Line2 | LineSegments2>(null);
  const halfWidth = width / 2;

  useFrame(() => {
    if (lineRef.current) {
      const beat = playbackBeatRef.current;
      const y = positioning
        ? positioning.position(beat) * beatScale
        : beat * beatScale;
      lineRef.current.position.y = y;
    }
  });

  return (
    <Line
      ref={lineRef}
      points={[[-halfWidth, 0, 5], [halfWidth, 0, 5]]}
      color="#ff6600"
      lineWidth={3}
    />
  );
}

// ─── HitEffectBeam ────────────────────────────────────────────────────────────
function HitEffectBeam({ effect, effectKey: _effectKey }: { effect: HitEffect; effectKey: string }) {
  const EFFECT_DURATION = 150;
  const BEAM_HEIGHT = 40;
  const beamWidth = Math.max(effect.width - 4, 4);

  const meshRef     = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const groupRef    = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!meshRef.current || !materialRef.current || !groupRef.current) return;
    const elapsed = performance.now() - effect.time;
    if (elapsed >= EFFECT_DURATION) { groupRef.current.visible = false; return; }
    groupRef.current.visible = true;
    const progress = elapsed / EFFECT_DURATION;
    const beamY = effect.y + (BEAM_HEIGHT / 2) * (1 - progress * 0.3);
    groupRef.current.position.set(effect.x, beamY, 8);
    meshRef.current.scale.set(1, 1 - progress * 0.5, 1);
    materialRef.current.opacity = (1 - progress) * 0.6;
  });

  return (
    <group ref={groupRef} position={[effect.x, effect.y + BEAM_HEIGHT / 2, 8]}>
      <mesh ref={meshRef}>
        <planeGeometry args={[beamWidth, BEAM_HEIGHT]} />
        <meshBasicMaterial ref={materialRef} color={effect.color} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

// ─── HitEffectsRenderer ──────────────────────────────────────────────────────
export const HitEffectsRenderer = React.memo(function HitEffectsRenderer({
  hitNotes,
  version,
}: {
  hitNotes: Map<string, HitEffect>;
  version: number;
}) {
  const effects = useMemo(() => {
    const result: { key: string; effect: HitEffect }[] = [];
    const now = performance.now();
    hitNotes.forEach((effect, key) => {
      if (now - effect.time < 200) result.push({ key, effect });
    });
    return result;
  }, [hitNotes, version]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <group>
      {effects.map(({ key, effect }) => (
        <HitEffectBeam key={key} effect={effect} effectKey={key} />
      ))}
    </group>
  );
});
