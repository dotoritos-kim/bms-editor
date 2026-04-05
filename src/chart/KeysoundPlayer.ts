/**
 * KeysoundPlayer
 *
 * BMS 키사운드를 로드하고 재생하는 커스텀 AudioPreloader 기반 플레이어
 * AudioWorklet을 사용하여 저지연 오디오 재생을 제공합니다.
 * Worker에서 .wav/.ogg 확장자 자동 폴백을 지원합니다.
 */

import { AudioPreloader, type FileMap, type WorkerFactory, type AudioPreloaderOptions } from '@rhythm-archive/bms-player';

/**
 * 모니터 프레임 주기를 측정하여 초 단위로 반환
 * rAF 10프레임 샘플링 → 평균 프레임 간격
 */
function detectFrameDuration(): Promise<number> {
  return new Promise((resolve) => {
    const deltas: number[] = [];
    let prev = 0;
    const measure = (ts: number) => {
      if (prev > 0) deltas.push(ts - prev);
      prev = ts;
      if (deltas.length < 10) {
        requestAnimationFrame(measure);
      } else {
        const avgMs = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        resolve(avgMs / 1000); // ms → seconds
      }
    };
    requestAnimationFrame(measure);
  });
}

export interface KeysoundPlayerOptions {
  /** 기본 URL (BMS 파일이 있는 디렉토리) */
  baseUrl: string;
  /** 키사운드 매핑 (ID -> 파일명) */
  keysounds: Record<string, string>;
  /** 볼륨 (0.0 ~ 1.0) */
  volume?: number;
  /** 로드 진행 콜백 */
  onProgress?: (loaded: number, total: number) => void;
  /** 로드 완료 콜백 */
  onReady?: () => void;
  /** 에러 콜백 */
  onError?: (error: string) => void;
  /** 성능 최적화 옵션 (기본: 활성화) */
  performanceMode?: boolean;
  /** 간소화된 이펙트 사용 (기본: false) */
  simplifiedEffects?: boolean;
  /** Worker 팩토리 (AudioLoader Worker 인스턴스를 생성하는 함수) */
  workerFactory?: WorkerFactory;
}


export class KeysoundPlayer {
  private preloader: AudioPreloader | null = null;
  private options: Required<KeysoundPlayerOptions>;
  private isLoading = false;
  private _isReady = false;
  private fileMap: FileMap = {};
  private _contextStateHandler: (() => void) | null = null;
  private _isRecovering = false;
  private preloaderOptions: AudioPreloaderOptions;

  // 디버깅용: 로드 실패한 키사운드 추적
  private _failedKeysounds: Map<string, string> = new Map(); // key -> error message
  private _loadedKeysounds: Set<string> = new Set();

  // 키사운드별 재생 레이턴시 측정
  private _playLatencies: number[] = [];
  private readonly _maxLatencySamples = 100;

  constructor(options: KeysoundPlayerOptions) {
    this.options = {
      volume: options.volume ?? 0.8,
      onProgress: options.onProgress ?? (() => {}),
      onReady: options.onReady ?? (() => {}),
      onError: options.onError ?? (() => {}),
      baseUrl: options.baseUrl,
      keysounds: options.keysounds,
      performanceMode: options.performanceMode ?? true,
      simplifiedEffects: options.simplifiedEffects ?? false,
      workerFactory: options.workerFactory ?? (() => { throw new Error('workerFactory is required for KeysoundPlayer'); }),
    };

    // 성능 최적화 옵션 설정
    this.preloaderOptions = {
      progressiveDecode: this.options.performanceMode,
      simplifiedEffects: this.options.simplifiedEffects,
      useCache: true, // 글로벌 캐시 항상 사용
    };

    // 키사운드 맵 생성 (ID -> 전체 URL)
    this.buildFileMap();
  }

  private buildFileMap(): void {
    // 커스텀 AudioPreloader의 Worker는 baseUrl + fileMap 값을 조합하여 fetch
    // 또한 .wav/.ogg 확장자 폴백을 자동 지원
    for (const [id, filename] of Object.entries(this.options.keysounds)) {
      const file = filename.replace(/^\//, '');
      this.fileMap[id.toLowerCase()] = file;
    }
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get loadProgress(): { loaded: number; total: number } {
    if (!this.preloader) {
      return { loaded: 0, total: Object.keys(this.fileMap).length };
    }
    return {
      loaded: this.preloader.downloadedCount,
      total: this.preloader.downloadedTotal,
    };
  }

  /**
   * AudioContext 초기화 (사용자 상호작용 후 호출 필요)
   */
  async init(): Promise<void> {
    if (this.preloader) return;

    try {
      // 모니터 프레임 주기 측정 → latencyHint로 사용
      const frameDuration = await detectFrameDuration();
      console.log(`[KeysoundPlayer] Detected frame duration: ${(frameDuration * 1000).toFixed(2)}ms → latencyHint: ${frameDuration.toFixed(5)}s`);

      // Worker 인스턴스 생성 (consumer-provided factory)
      const worker = this.options.workerFactory();

      // AudioPreloader 인스턴스 생성
      // Worker에서 baseUrl + fileMap 값을 조합하여 fetch하고
      // .wav/.ogg 확장자 폴백을 자동 지원
      this.preloader = new AudioPreloader(
        this.options.baseUrl.replace(/\/$/, ''), // trailing slash 제거
        this.fileMap,
        worker,
        (type: string, payload: unknown) => {
          if (type === 'PROGRESS') {
            const loaded = this.preloader?.downloadedCount ?? 0;
            const total = this.preloader?.downloadedTotal ?? Object.keys(this.fileMap).length;
            this.options.onProgress(loaded, total);
          } else if (type === 'LOADED') {
            // 성공적으로 로드된 키사운드 추적
            const loadedPayload = payload as { key?: string } | undefined;
            if (loadedPayload?.key) {
              this._loadedKeysounds.add(loadedPayload.key.toLowerCase());
            }
          } else if (type === 'ERROR') {
            // 로드 실패한 키사운드 추적
            const errorPayload = payload as { key?: string; fileName?: string; message?: string } | undefined;
            if (errorPayload?.key) {
              this._failedKeysounds.set(
                errorPayload.key.toLowerCase(),
                `${errorPayload.fileName || 'unknown'}: ${errorPayload.message || 'Unknown error'}`
              );
            }
            console.warn('[KeysoundPlayer] Load failed:', errorPayload?.key, errorPayload?.fileName, errorPayload?.message);
          }
        },
        { ...this.preloaderOptions, latencyHint: frameDuration } // 프레임 주기 기반 레이턴시
      );
      // AudioContext 상태 변화 감지 (suspended 등)
      this._contextStateHandler = () => {
        const ctx = this.preloader?.context;
        if (!ctx) return;

        // suspended 상태면 자동 복구 시도
        if (ctx.state === 'suspended') {
          console.warn('[KeysoundPlayer] AudioContext suspended, attempting resume');
          if (!this._isRecovering) {
            this._isRecovering = true;
            ctx.resume().then(() => {
              this._isRecovering = false;
              console.log('[KeysoundPlayer] AudioContext resumed successfully');
            }).catch(() => {
              this._isRecovering = false;
            });
          }
        }
      };

      // 상태 변화 리스너 등록
      const ctx = this.preloader.context;
      if (ctx) {
        ctx.addEventListener('statechange', this._contextStateHandler);
      }
    } catch (error: unknown) {
      this.options.onError('Failed to initialize AudioPreloader');
      throw error;
    }
  }

  /**
   * 모든 키사운드 로드
   */
  async load(): Promise<void> {
    if (this.isLoading) return;
    if (!this.preloader) {
      await this.init();
    }

    if (!this.preloader) {
      throw new Error('Preloader not initialized');
    }

    const totalCount = Object.keys(this.fileMap).length;
    if (totalCount === 0) {
      this._isReady = true;
      this.options.onReady();
      return;
    }

    this.isLoading = true;

    try {
      if (this.options.performanceMode) {
        // 성능 모드: 로드, 디코딩, AudioWorklet 초기화를 병렬로 수행
        await this.preloader.loadAndInitParallel();
      } else {
        // 기존 방식: 순차 실행
        // 1. 모든 파일 로드 (Worker를 통해 병렬 다운로드)
        await this.preloader.loadAll();

        // 2. 디코딩
        await this.preloader.decodeAll();

        // 3. AudioWorklet 초기화 (내장된 AudioProcessorWorkletUrl 사용)
        await this.preloader.initAudioWorklet();
      }

      // 4. 마스터 볼륨 설정
      this.preloader.setMasterVolume(this.options.volume);

      this._isReady = true;
      this.isLoading = false;
      this.options.onReady();
    } catch (error: unknown) {
      this.isLoading = false;
      const message = error instanceof Error ? error.message : 'Failed to load keysounds';
      this.options.onError(message);
      throw error;
    }
  }

  /**
   * 키사운드 재생
   * @param keysoundId - 키사운드 ID
   * @param offset - 재생 시작 위치 (초 단위, 기본: 0)
   * @param scheduledTime - AudioContext 예약 시간 (0이면 즉시 재생)
   * @param volume - 볼륨 (0-1, 기본: 1)
   */
  play(keysoundId: string, offset = 0, scheduledTime = 0, volume = 1): void {
    if (!this.preloader || !this._isReady) {
      return; // 조용히 무시 (재생 중 로딩이 완료되지 않은 경우)
    }

    // AudioContext 상태 확인 및 자동 복구
    const ctx = this.preloader.context;
    if (ctx && ctx.state !== 'running') {
      // suspended 상태면 자동 복구 시도 (비동기, 결과 무시)
      if (!this._isRecovering) {
        this._isRecovering = true;
        ctx.resume().finally(() => { this._isRecovering = false; });
      }
      return; // 이번 프레임은 재생 스킵 (다음 프레임에 재생됨)
    }

    const id = keysoundId.toLowerCase();

    try {
      // playAudioSync로 저지연 재생, uniquePlay=true로 동시 재생 지원
      const t0 = performance.now();
      const result = this.preloader.playAudioSync(id, false, true, offset, scheduledTime, volume);
      const delta = performance.now() - t0;
      this._playLatencies.push(delta);
      if (this._playLatencies.length > this._maxLatencySamples) {
        this._playLatencies.shift();
      }
      if (!result && !this._loggedMissingKeys?.has(id)) {
        if (!this._loggedMissingKeys) this._loggedMissingKeys = new Set();
        if (this._loggedMissingKeys.size < 10) {
          this._loggedMissingKeys.add(id);
          console.warn('[KeysoundPlayer] No audio for keysound:', id);
        }
      }
    } catch (error: unknown) {
      // 버퍼 오류 등 예외 발생 시 조용히 무시 (프레임 드랍 방지)
      if (!this._loggedMissingKeys?.has('_playError')) {
        if (!this._loggedMissingKeys) this._loggedMissingKeys = new Set();
        this._loggedMissingKeys.add('_playError');
        console.warn('[KeysoundPlayer] Play error (subsequent errors will be suppressed):', error);
      }
    }
  }

  private _loggedMissingKeys?: Set<string>;

  /**
   * 여러 키사운드 동시 재생
   * @param keysoundIds - 키사운드 ID 배열
   */
  playMultiple(keysoundIds: string[]): void {
    for (const id of keysoundIds) {
      this.play(id);
    }
  }

  /**
   * 여러 키사운드를 offset과 함께 재생
   * @param keysounds - { id, offset } 형태의 배열
   */
  playMultipleWithOffset(keysounds: Array<{ id: string; offset: number }>): void {
    for (const { id, offset } of keysounds) {
      this.play(id, offset);
    }
  }

  /**
   * 모든 사운드 정지
   */
  stopAll(): void {
    if (!this.preloader) return;
    this.preloader.stopAllAudio();
  }

  /**
   * 볼륨 설정
   */
  setVolume(volume: number): void {
    this.options.volume = Math.max(0, Math.min(1, volume));
    // AudioWorklet이 초기화된 후에만 볼륨 설정
    if (this.preloader && this._isReady) {
      this.preloader.setMasterVolume(this.options.volume);
    }
  }

  /**
   * 재생 속도 설정 (0.25 ~ 4.0)
   * 키사운드의 피치와 속도가 함께 변경됩니다.
   */
  setPlaybackRate(rate: number): void {
    if (this.preloader && this._isReady) {
      this.preloader.setPlaybackRate(rate);
    }
  }

  /**
   * 특정 키사운드의 duration 조회 (초 단위)
   * @returns duration (초) 또는 버퍼가 없으면 0
   */
  getKeysoundDuration(keysoundId: string): number {
    if (!this.preloader || !this._isReady) return 0;
    const id = keysoundId.toLowerCase();
    return this.preloader.getAudioDuration(id);
  }

  /**
   * 특정 키사운드 버퍼가 존재하는지 확인
   */
  hasKeysound(keysoundId: string): boolean {
    if (!this.preloader || !this._isReady) return false;
    const id = keysoundId.toLowerCase();
    return this.preloader.hasAudioBuffer(id);
  }

  // ============ Diagnostic Methods ============

  /**
   * 로드 실패한 키사운드 목록 반환
   * @returns Map<keysoundId, errorMessage>
   */
  getFailedKeysounds(): Map<string, string> {
    return new Map(this._failedKeysounds);
  }

  /**
   * 성공적으로 로드된 키사운드 목록 반환
   */
  getLoadedKeysounds(): Set<string> {
    return new Set(this._loadedKeysounds);
  }

  /**
   * 노트에서 참조되지만 WAV 정의가 없는 키사운드 찾기
   * @param referencedKeysoundIds - 노트에서 참조된 키사운드 ID 목록
   * @returns { missingDefinitions, failedLoads, loaded } 분류된 결과
   */
  diagnoseKeysounds(referencedKeysoundIds: string[]): {
    missingDefinitions: string[];  // WAV 정의 자체가 없음
    failedLoads: Array<{ id: string; error: string }>;  // 정의는 있지만 로드 실패
    loaded: string[];  // 정상 로드됨
    notReferenced: string[];  // 로드됐지만 사용되지 않음
  } {
    const uniqueRefs = [...new Set(referencedKeysoundIds.map(id => id.toLowerCase()))];
    const definedIds = new Set(Object.keys(this.fileMap).map(k => k.toLowerCase()));

    const missingDefinitions: string[] = [];
    const failedLoads: Array<{ id: string; error: string }> = [];
    const loaded: string[] = [];

    for (const id of uniqueRefs) {
      if (!definedIds.has(id)) {
        // WAV 정의 자체가 없음 (BMS 파일에 #WAVxx 헤더 없음)
        missingDefinitions.push(id);
      } else if (this._failedKeysounds.has(id)) {
        // 정의는 있지만 파일 로드 실패
        failedLoads.push({ id, error: this._failedKeysounds.get(id) || 'Unknown' });
      } else if (this._loadedKeysounds.has(id)) {
        // 정상 로드됨
        loaded.push(id);
      } else {
        // 정의는 있지만 로드/실패 기록 없음 (아직 로드 중이거나 버그)
        missingDefinitions.push(id);
      }
    }

    // 로드됐지만 노트에서 참조되지 않는 키사운드
    const notReferenced = [...this._loadedKeysounds].filter(id => !uniqueRefs.includes(id));

    return { missingDefinitions, failedLoads, loaded, notReferenced };
  }

  /**
   * 디버깅 정보를 콘솔에 출력
   * @param referencedKeysoundIds - 노트에서 참조된 키사운드 ID 목록
   */
  logDiagnostics(referencedKeysoundIds: string[]): void {
    const diagnosis = this.diagnoseKeysounds(referencedKeysoundIds);
    const definedIds = Object.keys(this.fileMap);
    const uniqueRefs = [...new Set(referencedKeysoundIds.map(id => id.toLowerCase()))];

    console.group('[KeysoundPlayer] Diagnostics');
    console.log(`Total WAV definitions (#WAVxx headers): ${definedIds.length}`);
    console.log(`Total unique IDs referenced in notes: ${uniqueRefs.length}`);
    console.log(`Successfully loaded: ${diagnosis.loaded.length}`);

    // 샘플 ID 비교 출력 (문제 진단에 유용)
    if (definedIds.length > 0 || uniqueRefs.length > 0) {
      console.log('--- ID Comparison ---');
      console.log(`Sample WAV definition IDs: [${definedIds.slice(0, 15).join(', ')}]${definedIds.length > 15 ? '...' : ''}`);
      console.log(`Sample note keysound IDs: [${uniqueRefs.slice(0, 15).join(', ')}]${uniqueRefs.length > 15 ? '...' : ''}`);

      // ID 형식 분석 (숫자만 vs 알파벳 포함)
      const numericDefs = definedIds.filter(id => /^\d+$/.test(id));
      const alphaDefs = definedIds.filter(id => /[a-zA-Z]/.test(id));
      const numericRefs = uniqueRefs.filter(id => /^\d+$/.test(id));
      const alphaRefs = uniqueRefs.filter(id => /[a-zA-Z]/.test(id));

      console.log(`WAV defs: ${numericDefs.length} numeric, ${alphaDefs.length} alphanumeric`);
      console.log(`Note refs: ${numericRefs.length} numeric, ${alphaRefs.length} alphanumeric`);
    }

    if (diagnosis.missingDefinitions.length > 0) {
      console.warn(`❌ Missing WAV definitions (no #WAVxx header): ${diagnosis.missingDefinitions.length}`);
      console.warn('Missing IDs:', diagnosis.missingDefinitions.slice(0, 20).join(', '),
        diagnosis.missingDefinitions.length > 20 ? `... and ${diagnosis.missingDefinitions.length - 20} more` : '');

      // 가장 가능성 높은 원인 추측
      if (diagnosis.missingDefinitions.length > 100 && diagnosis.loaded.length < 50) {
        console.warn('⚠️ Possible cause: BMS file may have #RANDOM blocks with WAV definitions in unexecuted branches');
        console.warn('⚠️ Or the BMS file uses a format not yet supported (bmson, extended channels, etc.)');
      }
    }

    if (diagnosis.failedLoads.length > 0) {
      console.warn(`⚠️ Failed to load (file not found or error): ${diagnosis.failedLoads.length}`);
      diagnosis.failedLoads.slice(0, 10).forEach(({ id, error }) => {
        console.warn(`  ${id}: ${error}`);
      });
      if (diagnosis.failedLoads.length > 10) {
        console.warn(`  ... and ${diagnosis.failedLoads.length - 10} more`);
      }
    }

    if (diagnosis.notReferenced.length > 0) {
      console.log(`ℹ️ Loaded but not used by any note: ${diagnosis.notReferenced.length}`);
      console.log(`Not referenced IDs: [${diagnosis.notReferenced.slice(0, 15).join(', ')}]${diagnosis.notReferenced.length > 15 ? '...' : ''}`);
    }

    console.groupEnd();
  }

  // ============ Equalizer Methods ============

  /**
   * 이퀄라이저 활성화/비활성화
   */
  setEqualizerEnabled(enabled: boolean): void {
    if (this.preloader && this._isReady) {
      this.preloader.setEqualizerEnabled(enabled);
    }
  }

  /**
   * 이퀄라이저 밴드 게인 설정
   */
  setEqualizerBand(index: number, gain: number): void {
    if (this.preloader && this._isReady) {
      this.preloader.setEqualizerBand(index, gain);
    }
  }

  /**
   * 이퀄라이저 프리셋 적용
   */
  setEqualizerPreset(preset: string): void {
    if (this.preloader && this._isReady) {
      this.preloader.setEqualizerPreset(preset);
    }
  }

  /**
   * 현재 이퀄라이저 밴드 값 가져오기
   */
  getEqualizerBands(): number[] {
    if (this.preloader && this._isReady) {
      return this.preloader.getEqualizerBands();
    }
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  // ============ Compressor Methods ============

  /**
   * 컴프레서 활성화/비활성화
   */
  setCompressorEnabled(enabled: boolean): void {
    if (this.preloader && this._isReady) {
      this.preloader.setCompressorEnabled(enabled);
    }
  }

  /**
   * 컴프레서 설정 변경
   */
  setCompressorSettings(settings: { threshold?: number; ratio?: number; attack?: number; release?: number }): void {
    if (this.preloader && this._isReady) {
      this.preloader.setCompressorSettings(
        settings.threshold ?? -24,
        settings.ratio ?? 12,
        settings.attack ?? 0.003,
        settings.release ?? 0.25
      );
    }
  }

  // ============ Reverb Methods ============

  /**
   * 리버브 활성화/비활성화
   */
  setReverbEnabled(enabled: boolean): void {
    if (this.preloader && this._isReady) {
      this.preloader.setReverbEnabled(enabled);
    }
  }

  /**
   * 리버브 믹스 (Dry/Wet) 설정
   */
  setReverbMix(mix: number): void {
    if (this.preloader && this._isReady) {
      this.preloader.setReverbMix(mix);
    }
  }

  /**
   * 리버브 디케이 시간 설정
   */
  setReverbDecay(decay: number): void {
    if (this.preloader && this._isReady) {
      this.preloader.setReverbDecay(decay);
    }
  }

  // ============ Stereo Methods ============

  /**
   * 스테레오 확장 활성화/비활성화
   */
  setStereoEnabled(enabled: boolean): void {
    if (this.preloader && this._isReady) {
      this.preloader.setStereoEnabled(enabled);
    }
  }

  /**
   * 스테레오 폭 설정
   */
  setStereoWidth(width: number): void {
    if (this.preloader && this._isReady) {
      this.preloader.setStereoWidth(width);
    }
  }

  /**
   * AudioContext 재개 (사용자 상호작용 후 호출)
   * 브라우저 정책상 AudioContext는 사용자 상호작용 후에만 재생 가능
   */
  async resume(): Promise<void> {
    if (!this.preloader) return;
    const context = this.preloader.context;
    if (context && context.state === 'suspended') {
      await context.resume();
    }
  }

  /**
   * 리소스 해제
   */
  dispose(): void {
    this.stopAll();

    // AudioContext 상태 리스너 제거
    if (this._contextStateHandler && this.preloader?.context) {
      this.preloader.context.removeEventListener('statechange', this._contextStateHandler);
      this._contextStateHandler = null;
    }

    if (this.preloader) {
      this.preloader.releaseAllResources();
      this.preloader = null;
    }
    this._isReady = false;
    this._isRecovering = false;
  }

  /**
   * AudioContext 상태 확인
   */
  getContextState(): AudioContextState | null {
    return this.preloader?.context?.state ?? null;
  }

  /**
   * AudioContext가 재생 가능한 상태인지 확인
   */
  isContextReady(): boolean {
    const state = this.getContextState();
    return state === 'running';
  }

  /**
   * AudioContext의 현재 시간 반환 (초 단위)
   * Web Audio API의 고정밀 타이밍 소스 - HTML Audio보다 정확함
   */
  getContextTime(): number {
    return this.preloader?.context?.currentTime ?? 0;
  }

  /**
   * 오디오 파이프라인 레이턴시 반환 (밀리초 단위)
   * baseLatency(AudioContext 처리) + outputLatency(하드웨어/드라이버)
   * @returns 레이턴시 (ms) 또는 AudioContext가 없으면 null
   */
  getPipelineLatency(): number | null {
    const ctx = this.preloader?.context;
    if (!ctx) return null;
    let total = ctx.baseLatency ?? 0;
    if ('outputLatency' in ctx) {
      total += (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    }
    return total * 1000;
  }

  /**
   * 키사운드별 평균 스케줄링 오버헤드 반환 (밀리초 단위)
   * playAudioSync 호출의 실측 처리 시간 평균 (최근 100회)
   * @returns 평균 오버헤드 (ms) 또는 샘플이 없으면 null
   */
  getSchedulingOverhead(): number | null {
    if (this._playLatencies.length === 0) return null;
    const sum = this._playLatencies.reduce((a, b) => a + b, 0);
    return sum / this._playLatencies.length;
  }

  /**
   * 레이턴시 샘플 초기화
   */
  resetLatencySamples(): void {
    this._playLatencies = [];
  }
}

/**
 * 키사운드 플레이어를 생성하고 로드하는 헬퍼 함수
 */
export async function createKeysoundPlayer(
  options: KeysoundPlayerOptions
): Promise<KeysoundPlayer> {
  const player = new KeysoundPlayer(options);
  await player.init();
  await player.load();
  return player;
}
