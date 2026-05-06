/**
 * useKeysoundLifecycle — KeysoundPlayer 초기화 + dispose + 오디오 설정 훅
 *
 * NoteChartViewer.tsx 에서 추출된 키사운드 라이프사이클 로직.
 * keysounds / keysoundBaseUrl 이 바뀔 때마다 이전 플레이어를 dispose 하고
 * 새 플레이어를 init → load 순서로 초기화합니다.
 * 볼륨·EQ·이펙터·재생 속도 변경은 별도 useEffect 로 처리합니다.
 */
import { useEffect, useRef, useState } from 'react';
import { KeysoundPlayer } from '../../KeysoundPlayer';
import type { BMSNote } from '@rhythm-archive/bms-core';

// ---------------------------------------------------------------------------
// Sub-types (mirrors the private interfaces in NoteChartViewer)
// ---------------------------------------------------------------------------

export interface EqualizerBand {
  frequency: number;
  gain: number;
}

export interface EqualizerSettings {
  enabled: boolean;
  preset: string;
  bands: EqualizerBand[];
}

export interface EffectorSettings {
  compressor: { enabled: boolean; threshold: number; ratio: number; attack: number; release: number };
  reverb: { enabled: boolean; mix: number; decay: number };
  stereo: { enabled: boolean; width: number };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseKeysoundLifecycleOptions {
  keysounds: Record<string, string> | undefined;
  keysoundBaseUrl: string | undefined;
  notes: BMSNote[];
  /** Initial volume 0-100 */
  keysoundVolume: number;
  keysoundMuted: boolean;
  playbackSpeed: number;
  localEqualizer: EqualizerSettings;
  localEffector: EffectorSettings;
}

export interface UseKeysoundLifecycleReturn {
  keysoundPlayerRef: React.MutableRefObject<KeysoundPlayer | null>;
  keysoundLoading: boolean;
  keysoundReady: boolean;
  keysoundProgress: { loaded: number; total: number };
}

export function useKeysoundLifecycle({
  keysounds,
  keysoundBaseUrl,
  notes,
  keysoundVolume,
  keysoundMuted,
  playbackSpeed,
  localEqualizer,
  localEffector,
}: UseKeysoundLifecycleOptions): UseKeysoundLifecycleReturn {
  const keysoundPlayerRef = useRef<KeysoundPlayer | null>(null);
  const [keysoundLoading, setKeysoundLoading] = useState(false);
  const [keysoundReady, setKeysoundReady] = useState(false);
  const [keysoundProgress, setKeysoundProgress] = useState({ loaded: 0, total: 0 });

  // Keep stable refs for values used inside async init (avoids stale closures)
  const keysoundVolumeRef = useRef(keysoundVolume);
  const keysoundMutedRef = useRef(keysoundMuted);
  const localEqualizerRef = useRef(localEqualizer);
  const localEffectorRef = useRef(localEffector);
  useEffect(() => { keysoundVolumeRef.current = keysoundVolume; }, [keysoundVolume]);
  useEffect(() => { keysoundMutedRef.current = keysoundMuted; }, [keysoundMuted]);
  useEffect(() => { localEqualizerRef.current = localEqualizer; }, [localEqualizer]);
  useEffect(() => { localEffectorRef.current = localEffector; }, [localEffector]);

  // -------------------------------------------------------------------------
  // Main lifecycle: init + load
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!keysounds || !keysoundBaseUrl || Object.keys(keysounds).length === 0) {
      setKeysoundReady(false);
      return;
    }

    const currentKeysounds = keysounds;
    const currentBaseUrl = keysoundBaseUrl;
    let cancelled = false;

    const initKeysounds = async () => {
      // 이전 플레이어 정리
      if (keysoundPlayerRef.current) {
        keysoundPlayerRef.current.dispose();
        keysoundPlayerRef.current = null;
      }

      setKeysoundLoading(true);
      setKeysoundReady(false);
      setKeysoundProgress({ loaded: 0, total: Object.keys(currentKeysounds).length });

      try {
        const player = new KeysoundPlayer({
          baseUrl: currentBaseUrl,
          keysounds: currentKeysounds,
          volume: 0.8, // 로드 후 별도 effect에서 실제 볼륨 설정
          onProgress: (loaded, total) => {
            if (!cancelled) setKeysoundProgress({ loaded, total });
          },
          onReady: () => {
            if (!cancelled) {
              setKeysoundReady(true);
              setKeysoundLoading(false);
            }
          },
          onError: (error) => {
            console.warn('[useKeysoundLifecycle] Keysound load error:', error);
          },
        });

        // NOTE: Do NOT set keysoundPlayerRef.current until AFTER async init/load
        // to prevent race conditions when cleanup runs mid-initialization
        await player.init();
        if (cancelled) { player.dispose(); return; }

        await player.load();
        if (cancelled) { player.dispose(); return; }

        // 진단 정보 출력
        const referencedKeysoundIds = notes
          .filter(note => note.keysound)
          .map(note => note.keysound as string);
        player.logDiagnostics(referencedKeysoundIds);

        // Only NOW set the ref, after all async operations complete successfully
        keysoundPlayerRef.current = player;

        // 로드 완료 후 오디오 설정 적용
        const effectiveVolume = keysoundMutedRef.current ? 0 : keysoundVolumeRef.current / 100;
        player.setVolume(effectiveVolume);

        const eq = localEqualizerRef.current;
        player.setEqualizerEnabled(eq.enabled);
        if (eq.enabled && eq.preset !== 'custom') {
          player.setEqualizerPreset(eq.preset);
        }

        const fx = localEffectorRef.current;
        player.setCompressorEnabled(fx.compressor.enabled);
        player.setReverbEnabled(fx.reverb.enabled);
        player.setStereoEnabled(fx.stereo.enabled);
      } catch (error: unknown) {
        console.error('[useKeysoundLifecycle] Failed to initialize keysound player:', error);
        if (!cancelled) {
          setKeysoundLoading(false);
          setKeysoundReady(false);
        }
      }
    };

    initKeysounds();

    return () => {
      cancelled = true;
      if (keysoundPlayerRef.current) {
        keysoundPlayerRef.current.dispose();
        keysoundPlayerRef.current = null;
      }
    };
    // notes 는 진단용이라 deps 에서 제외 (keysounds/keysoundBaseUrl 변경 시만 재초기화)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysounds, keysoundBaseUrl]);

  // -------------------------------------------------------------------------
  // Volume sync
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (keysoundPlayerRef.current) {
      const effectiveVolume = keysoundMuted ? 0 : keysoundVolume / 100;
      keysoundPlayerRef.current.setVolume(effectiveVolume);
    }
  }, [keysoundVolume, keysoundMuted]);

  // -------------------------------------------------------------------------
  // Equalizer sync
  // -------------------------------------------------------------------------
  useEffect(() => {
    const player = keysoundPlayerRef.current;
    if (!player) return;
    player.setEqualizerEnabled(localEqualizer.enabled);
    if (localEqualizer.enabled) {
      if (localEqualizer.preset !== 'custom') {
        player.setEqualizerPreset(localEqualizer.preset);
      } else {
        localEqualizer.bands.forEach((band, index) => {
          player.setEqualizerBand(index, band.gain);
        });
      }
    }
  }, [localEqualizer]);

  // -------------------------------------------------------------------------
  // Effector sync
  // -------------------------------------------------------------------------
  useEffect(() => {
    const player = keysoundPlayerRef.current;
    if (!player) return;

    player.setCompressorEnabled(localEffector.compressor.enabled);
    if (localEffector.compressor.enabled) {
      player.setCompressorSettings({
        threshold: localEffector.compressor.threshold,
        ratio: localEffector.compressor.ratio,
        attack: localEffector.compressor.attack,
        release: localEffector.compressor.release,
      });
    }

    player.setReverbEnabled(localEffector.reverb.enabled);
    if (localEffector.reverb.enabled) {
      player.setReverbMix(localEffector.reverb.mix);
      player.setReverbDecay(localEffector.reverb.decay);
    }

    player.setStereoEnabled(localEffector.stereo.enabled);
    if (localEffector.stereo.enabled) {
      player.setStereoWidth(localEffector.stereo.width);
    }
  }, [localEffector]);

  // -------------------------------------------------------------------------
  // Playback speed sync
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (keysoundPlayerRef.current) {
      keysoundPlayerRef.current.setPlaybackRate(playbackSpeed);
    }
  }, [playbackSpeed]);

  return { keysoundPlayerRef, keysoundLoading, keysoundReady, keysoundProgress };
}
