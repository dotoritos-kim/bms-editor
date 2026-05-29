/**
 * KeysoundPlayer
 *
 * Custom AudioPreloader-based player for loading and playing BMS keysounds.
 * Provides low-latency audio playback using AudioWorklet.
 * Supports automatic .wav/.ogg extension fallback from the Worker.
 */

import { AudioPreloader, type FileMap, type WorkerFactory, type AudioPreloaderOptions } from '@rhythm-archive/bms-player';
import { getErrorMessage } from '../utils';
import { narrowKeysoundWorkerMessage } from './workerMessages';

/**
 * Measure monitor frame duration and return it in seconds.
 * Samples 10 rAF frames and returns the average frame interval.
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
  /** Base URL (directory containing the BMS file) */
  baseUrl: string;
  /** Keysound mapping (ID -> filename) */
  keysounds: Record<string, string>;
  /** Volume (0.0 ~ 1.0) */
  volume?: number;
  /** Load progress callback */
  onProgress?: (loaded: number, total: number) => void;
  /** Load complete callback */
  onReady?: () => void;
  /** Error callback */
  onError?: (error: string) => void;
  /** Performance optimization options (default: enabled) */
  performanceMode?: boolean;
  /** Use simplified effects (default: false) */
  simplifiedEffects?: boolean;
  /** Worker factory (function that creates an AudioLoader Worker instance) */
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

  // For debugging: track keysounds that failed to load
  private _failedKeysounds: Map<string, string> = new Map(); // key -> error message
  private _loadedKeysounds: Set<string> = new Set();

  // Per-keysound play latency measurements
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

    // Apply performance optimization options
    this.preloaderOptions = {
      progressiveDecode: this.options.performanceMode,
      simplifiedEffects: this.options.simplifiedEffects,
      useCache: true, // Always use global cache
    };

    // Build keysound map (ID -> full URL)
    this.buildFileMap();
  }

  private buildFileMap(): void {
    // The custom AudioPreloader Worker fetches using baseUrl + fileMap value
    // and automatically supports .wav/.ogg extension fallback
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
   * Initialize AudioContext (must be called after user interaction)
   */
  async init(): Promise<void> {
    if (this.preloader) return;

    try {
      // Measure monitor frame duration → use as latencyHint
      const frameDuration = await detectFrameDuration();
      console.log(`[KeysoundPlayer] Detected frame duration: ${(frameDuration * 1000).toFixed(2)}ms → latencyHint: ${frameDuration.toFixed(5)}s`);

      // Create Worker instance (consumer-provided factory)
      const worker = this.options.workerFactory();

      // Create AudioPreloader instance.
      // The Worker fetches using baseUrl + fileMap value
      // and automatically supports .wav/.ogg extension fallback.
      this.preloader = new AudioPreloader(
        this.options.baseUrl.replace(/\/$/, ''), // Remove trailing slash
        this.fileMap,
        worker,
        (type: string, payload: unknown) => {
          // Centralized boundary narrowing — see ./workerMessages.ts
          const msg = narrowKeysoundWorkerMessage(type, payload);
          if (!msg) return; // Ignore unknown shapes silently
          switch (msg.type) {
            case 'PROGRESS': {
              const loaded = this.preloader?.downloadedCount ?? 0;
              const total = this.preloader?.downloadedTotal ?? Object.keys(this.fileMap).length;
              this.options.onProgress(loaded, total);
              break;
            }
            case 'LOADED':
              this._loadedKeysounds.add(msg.key.toLowerCase());
              break;
            case 'ERROR':
              this._failedKeysounds.set(
                msg.key.toLowerCase(),
                `${msg.fileName}: ${msg.message}`,
              );
              console.warn(
                '[KeysoundPlayer] Load failed:',
                msg.key,
                msg.fileName,
                msg.message,
              );
              break;
          }
        },
        { ...this.preloaderOptions, latencyHint: frameDuration } // Frame-duration-based latency hint
      );
      // Detect AudioContext state changes (e.g. suspended)
      this._contextStateHandler = () => {
        const ctx = this.preloader?.context;
        if (!ctx) return;

        // Attempt auto-recovery if suspended
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

      // Register state change listener
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
   * Load all keysounds
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
        // Performance mode: load, decode, and AudioWorklet init in parallel
        await this.preloader.loadAndInitParallel();
      } else {
        // Legacy mode: sequential execution
        // 1. Load all files (parallel download via Worker)
        await this.preloader.loadAll();

        // 2. Decode
        await this.preloader.decodeAll();

        // 3. Initialize AudioWorklet (uses built-in AudioProcessorWorkletUrl)
        await this.preloader.initAudioWorklet();
      }

      // 4. Set master volume
      this.preloader.setMasterVolume(this.options.volume);

      this._isReady = true;
      this.isLoading = false;
      this.options.onReady();
    } catch (error: unknown) {
      this.isLoading = false;
      const message = getErrorMessage(error, 'Failed to load keysounds');
      this.options.onError(message);
      throw error;
    }
  }

  /**
   * Play a keysound
   * @param keysoundId - Keysound ID
   * @param offset - Playback start position (seconds, default: 0)
   * @param scheduledTime - AudioContext scheduled time (0 = immediate)
   * @param volume - Volume (0-1, default: 1)
   */
  play(keysoundId: string, offset = 0, scheduledTime = 0, volume = 1): void {
    if (!this.preloader || !this._isReady) {
      return; // Silently ignore (loading not yet complete during playback)
    }

    // Check AudioContext state and attempt auto-recovery
    const ctx = this.preloader.context;
    if (ctx && ctx.state !== 'running') {
      // Attempt async recovery if suspended (fire-and-forget)
      if (!this._isRecovering) {
        this._isRecovering = true;
        ctx.resume().finally(() => { this._isRecovering = false; });
      }
      return; // Skip this frame (will play on next frame)
    }

    const id = keysoundId.toLowerCase();

    try {
      // Low-latency playback via playAudioSync; uniquePlay=true allows concurrent playback
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
      // Silently ignore buffer errors to prevent frame drops
      if (!this._loggedMissingKeys?.has('_playError')) {
        if (!this._loggedMissingKeys) this._loggedMissingKeys = new Set();
        this._loggedMissingKeys.add('_playError');
        console.warn('[KeysoundPlayer] Play error (subsequent errors will be suppressed):', error);
      }
    }
  }

  private _loggedMissingKeys?: Set<string>;

  /**
   * Play multiple keysounds simultaneously
   * @param keysoundIds - Array of keysound IDs
   */
  playMultiple(keysoundIds: string[]): void {
    for (const id of keysoundIds) {
      this.play(id);
    }
  }

  /**
   * Play multiple keysounds with individual offsets
   * @param keysounds - Array of { id, offset } objects
   */
  playMultipleWithOffset(keysounds: Array<{ id: string; offset: number }>): void {
    for (const { id, offset } of keysounds) {
      this.play(id, offset);
    }
  }

  /**
   * Stop all sounds
   */
  stopAll(): void {
    if (!this.preloader) return;
    this.preloader.stopAllAudio();
  }

  /**
   * Set volume
   */
  setVolume(volume: number): void {
    this.options.volume = Math.max(0, Math.min(1, volume));
    // Only set volume once AudioWorklet is initialized
    if (this.preloader && this._isReady) {
      this.preloader.setMasterVolume(this.options.volume);
    }
  }

  /**
   * Set playback rate (0.25 ~ 4.0).
   * Changes both pitch and speed of keysounds.
   */
  setPlaybackRate(rate: number): void {
    if (this.preloader && this._isReady) {
      this.preloader.setPlaybackRate(rate);
    }
  }

  /**
   * Get duration of a specific keysound (in seconds)
   * @returns Duration (seconds), or 0 if buffer not available
   */
  getKeysoundDuration(keysoundId: string): number {
    if (!this.preloader || !this._isReady) return 0;
    const id = keysoundId.toLowerCase();
    return this.preloader.getAudioDuration(id);
  }

  /**
   * Check whether a specific keysound buffer exists
   */
  hasKeysound(keysoundId: string): boolean {
    if (!this.preloader || !this._isReady) return false;
    const id = keysoundId.toLowerCase();
    return this.preloader.hasAudioBuffer(id);
  }

  // ============ Diagnostic Methods ============

  /**
   * Return the list of keysounds that failed to load
   * @returns Map<keysoundId, errorMessage>
   */
  getFailedKeysounds(): Map<string, string> {
    return new Map(this._failedKeysounds);
  }

  /**
   * Return the list of successfully loaded keysounds
   */
  getLoadedKeysounds(): Set<string> {
    return new Set(this._loadedKeysounds);
  }

  /**
   * Find keysounds referenced by notes but missing a WAV definition
   * @param referencedKeysoundIds - Keysound IDs referenced in notes
   * @returns { missingDefinitions, failedLoads, loaded } categorized results
   */
  diagnoseKeysounds(referencedKeysoundIds: string[]): {
    missingDefinitions: string[];  // No WAV definition at all
    failedLoads: Array<{ id: string; error: string }>;  // Defined but failed to load
    loaded: string[];  // Successfully loaded
    notReferenced: string[];  // Loaded but not used by any note
  } {
    const uniqueRefs = [...new Set(referencedKeysoundIds.map(id => id.toLowerCase()))];
    const definedIds = new Set(Object.keys(this.fileMap).map(k => k.toLowerCase()));

    const missingDefinitions: string[] = [];
    const failedLoads: Array<{ id: string; error: string }> = [];
    const loaded: string[] = [];

    for (const id of uniqueRefs) {
      if (!definedIds.has(id)) {
        // No WAV definition (no #WAVxx header in BMS file)
        missingDefinitions.push(id);
      } else if (this._failedKeysounds.has(id)) {
        // Defined but file failed to load
        failedLoads.push({ id, error: this._failedKeysounds.get(id) || 'Unknown' });
      } else if (this._loadedKeysounds.has(id)) {
        // Successfully loaded
        loaded.push(id);
      } else {
        // Defined but no load/fail record (still loading or bug)
        missingDefinitions.push(id);
      }
    }

    // Keysounds that are loaded but not referenced by any note
    const notReferenced = [...this._loadedKeysounds].filter(id => !uniqueRefs.includes(id));

    return { missingDefinitions, failedLoads, loaded, notReferenced };
  }

  /**
   * Print diagnostic information to the console
   * @param referencedKeysoundIds - Keysound IDs referenced in notes
   */
  logDiagnostics(referencedKeysoundIds: string[]): void {
    const diagnosis = this.diagnoseKeysounds(referencedKeysoundIds);
    const definedIds = Object.keys(this.fileMap);
    const uniqueRefs = [...new Set(referencedKeysoundIds.map(id => id.toLowerCase()))];

    console.group('[KeysoundPlayer] Diagnostics');
    console.log(`Total WAV definitions (#WAVxx headers): ${definedIds.length}`);
    console.log(`Total unique IDs referenced in notes: ${uniqueRefs.length}`);
    console.log(`Successfully loaded: ${diagnosis.loaded.length}`);

    // Print sample ID comparison (useful for diagnosing issues)
    if (definedIds.length > 0 || uniqueRefs.length > 0) {
      console.log('--- ID Comparison ---');
      console.log(`Sample WAV definition IDs: [${definedIds.slice(0, 15).join(', ')}]${definedIds.length > 15 ? '...' : ''}`);
      console.log(`Sample note keysound IDs: [${uniqueRefs.slice(0, 15).join(', ')}]${uniqueRefs.length > 15 ? '...' : ''}`);

      // Analyze ID format (numeric-only vs alphanumeric)
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

      // Guess most likely cause
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
   * Enable or disable the equalizer
   */
  setEqualizerEnabled(enabled: boolean): void {
    if (this.preloader && this._isReady) {
      this.preloader.setEqualizerEnabled(enabled);
    }
  }

  /**
   * Set an equalizer band gain
   */
  setEqualizerBand(index: number, gain: number): void {
    if (this.preloader && this._isReady) {
      this.preloader.setEqualizerBand(index, gain);
    }
  }

  /**
   * Apply an equalizer preset
   */
  setEqualizerPreset(preset: string): void {
    if (this.preloader && this._isReady) {
      this.preloader.setEqualizerPreset(preset);
    }
  }

  /**
   * Get current equalizer band values
   */
  getEqualizerBands(): number[] {
    if (this.preloader && this._isReady) {
      return this.preloader.getEqualizerBands();
    }
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  // ============ Compressor Methods ============

  /**
   * Enable or disable the compressor
   */
  setCompressorEnabled(enabled: boolean): void {
    if (this.preloader && this._isReady) {
      this.preloader.setCompressorEnabled(enabled);
    }
  }

  /**
   * Update compressor settings
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
   * Enable or disable reverb
   */
  setReverbEnabled(enabled: boolean): void {
    if (this.preloader && this._isReady) {
      this.preloader.setReverbEnabled(enabled);
    }
  }

  /**
   * Set reverb mix (Dry/Wet)
   */
  setReverbMix(mix: number): void {
    if (this.preloader && this._isReady) {
      this.preloader.setReverbMix(mix);
    }
  }

  /**
   * Set reverb decay time
   */
  setReverbDecay(decay: number): void {
    if (this.preloader && this._isReady) {
      this.preloader.setReverbDecay(decay);
    }
  }

  // ============ Stereo Methods ============

  /**
   * Enable or disable stereo widening
   */
  setStereoEnabled(enabled: boolean): void {
    if (this.preloader && this._isReady) {
      this.preloader.setStereoEnabled(enabled);
    }
  }

  /**
   * Set stereo width
   */
  setStereoWidth(width: number): void {
    if (this.preloader && this._isReady) {
      this.preloader.setStereoWidth(width);
    }
  }

  /**
   * Resume AudioContext (call after user interaction).
   * Browser policy requires user interaction before AudioContext can play.
   */
  async resume(): Promise<void> {
    if (!this.preloader) return;
    const context = this.preloader.context;
    if (context && context.state === 'suspended') {
      await context.resume();
    }
  }

  /**
   * Release resources
   */
  dispose(): void {
    this.stopAll();

    // Remove AudioContext state listener
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
   * Get AudioContext state
   */
  getContextState(): AudioContextState | null {
    return this.preloader?.context?.state ?? null;
  }

  /**
   * Check whether AudioContext is in a playable state
   */
  isContextReady(): boolean {
    const state = this.getContextState();
    return state === 'running';
  }

  /**
   * Return current AudioContext time (in seconds).
   * High-precision timing source from Web Audio API — more accurate than HTML Audio.
   */
  getContextTime(): number {
    return this.preloader?.context?.currentTime ?? 0;
  }

  /**
   * Return audio pipeline latency (in milliseconds).
   * Sum of baseLatency (AudioContext processing) + outputLatency (hardware/driver).
   * @returns Latency (ms), or null if AudioContext is unavailable
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
   * Return average scheduling overhead per keysound (in milliseconds).
   * Average measured processing time of playAudioSync calls (last 100 samples).
   * @returns Average overhead (ms), or null if no samples available
   */
  getSchedulingOverhead(): number | null {
    if (this._playLatencies.length === 0) return null;
    const sum = this._playLatencies.reduce((a, b) => a + b, 0);
    return sum / this._playLatencies.length;
  }

  /**
   * Reset latency samples
   */
  resetLatencySamples(): void {
    this._playLatencies = [];
  }
}

/**
 * Helper function to create and load a keysound player
 */
export async function createKeysoundPlayer(
  options: KeysoundPlayerOptions
): Promise<KeysoundPlayer> {
  const player = new KeysoundPlayer(options);
  await player.init();
  await player.load();
  return player;
}
