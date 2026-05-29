/**
 * useKeysoundLifecycle — KeysoundPlayer init + dispose + audio settings hook
 *
 * Keysound lifecycle logic extracted from NoteChartViewer.tsx.
 * Disposes the previous player and reinitializes a new one (init → load)
 * whenever keysounds or keysoundBaseUrl changes.
 * Volume, EQ, effector, and playback speed changes are handled in separate useEffects.
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
      // Dispose previous player
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
          volume: 0.8, // Actual volume is applied in a separate effect after load
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

        // Print diagnostics
        const referencedKeysoundIds = notes
          .filter(note => note.keysound)
          .map(note => note.keysound as string);
        player.logDiagnostics(referencedKeysoundIds);

        // Only NOW set the ref, after all async operations complete successfully
        keysoundPlayerRef.current = player;

        // Apply audio settings after load completes
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
    // notes is excluded from deps as it is only used for diagnostics (reinit only on keysounds/keysoundBaseUrl change)
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
