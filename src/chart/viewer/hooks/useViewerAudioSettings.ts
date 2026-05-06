/**
 * useViewerAudioSettings — 뷰어 오디오 설정 상태 훅
 *
 * NoteChartViewer.tsx 에서 추출된 오디오 관련 설정 상태 묶음.
 * 키사운드 on/off, 볼륨, 뮤트, 이퀄라이저, 이펙터, 다이얼로그 표시,
 * 파이프라인 레이턴시 측정값 등을 관리합니다.
 *
 * 실제 KeysoundPlayer 라이프사이클(초기화/dispose)은 useKeysoundLifecycle 이 담당하며,
 * 이 훅은 그 설정 상태만을 제공합니다.
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
