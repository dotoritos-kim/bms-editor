/**
 * useViewerAudioSettings — viewer audio settings state hook
 *
 * Bundle of audio-related settings state extracted from NoteChartViewer.tsx.
 * Manages keysound on/off, volume, mute, equalizer, effector, dialog visibility,
 * pipeline latency measurements, etc.
 *
 * The actual KeysoundPlayer lifecycle (init/dispose) is handled by useKeysoundLifecycle;
 * this hook only provides the settings state.
 */
import { useState } from 'react';
import type { EqualizerSettings, EffectorSettings } from './useKeysoundLifecycle';

const DEFAULT_EQUALIZER: EqualizerSettings = {
  enabled: false,
  preset: 'flat',
  bands: [
    { frequency: 31, gain: 0 },
    { frequency: 63, gain: 0 },
    { frequency: 125, gain: 0 },
    { frequency: 250, gain: 0 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: 0 },
    { frequency: 2000, gain: 0 },
    { frequency: 4000, gain: 0 },
    { frequency: 8000, gain: 0 },
    { frequency: 16000, gain: 0 },
  ],
};

const DEFAULT_EFFECTOR: EffectorSettings = {
  compressor: { enabled: false, threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
  reverb: { enabled: false, mix: 0.3, decay: 1.5 },
  stereo: { enabled: false, width: 1 },
};

export interface UseViewerAudioSettingsOptions {
  initialKeysoundEnabled: boolean;
}

export interface UseViewerAudioSettingsReturn {
  keysoundEnabled: boolean;
  setKeysoundEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  keysoundVolume: number;
  setKeysoundVolume: React.Dispatch<React.SetStateAction<number>>;
  keysoundMuted: boolean;
  setKeysoundMuted: React.Dispatch<React.SetStateAction<boolean>>;
  audioDialogOpen: boolean;
  setAudioDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  localEqualizer: EqualizerSettings;
  setLocalEqualizer: React.Dispatch<React.SetStateAction<EqualizerSettings>>;
  localEffector: EffectorSettings;
  setLocalEffector: React.Dispatch<React.SetStateAction<EffectorSettings>>;
  pipelineLatency: number | null;
  setPipelineLatency: React.Dispatch<React.SetStateAction<number | null>>;
  schedulingOverhead: number | null;
  setSchedulingOverhead: React.Dispatch<React.SetStateAction<number | null>>;
}

export function useViewerAudioSettings({
  initialKeysoundEnabled,
}: UseViewerAudioSettingsOptions): UseViewerAudioSettingsReturn {
  const [keysoundEnabled, setKeysoundEnabled] = useState(initialKeysoundEnabled);
  const [keysoundVolume, setKeysoundVolume] = useState(50);
  const [keysoundMuted, setKeysoundMuted] = useState(false);
  const [audioDialogOpen, setAudioDialogOpen] = useState(false);
  const [localEqualizer, setLocalEqualizer] = useState<EqualizerSettings>(DEFAULT_EQUALIZER);
  const [localEffector, setLocalEffector] = useState<EffectorSettings>(DEFAULT_EFFECTOR);
  const [pipelineLatency, setPipelineLatency] = useState<number | null>(null);
  const [schedulingOverhead, setSchedulingOverhead] = useState<number | null>(null);

  return {
    keysoundEnabled, setKeysoundEnabled,
    keysoundVolume, setKeysoundVolume,
    keysoundMuted, setKeysoundMuted,
    audioDialogOpen, setAudioDialogOpen,
    localEqualizer, setLocalEqualizer,
    localEffector, setLocalEffector,
    pipelineLatency, setPipelineLatency,
    schedulingOverhead, setSchedulingOverhead,
  };
}
