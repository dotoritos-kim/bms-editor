import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAYER_SETTINGS,
  DEFAULT_LAYER_CONFIG,
  isLayerInteractable,
  isLayerVisible,
  getLayerOpacity,
  type LayerConfig,
  type LayerKey,
} from '../src/chart/editor/layers';

const FULL_LAYERS: LayerKey[] = ['playable', 'invisible', 'landmine', 'bgm'];

const makeConfig = (overrides: Partial<Record<LayerKey, Partial<typeof DEFAULT_LAYER_SETTINGS>>>): LayerConfig => {
  const cfg: LayerConfig = {
    playable: { ...DEFAULT_LAYER_SETTINGS },
    invisible: { ...DEFAULT_LAYER_SETTINGS },
    landmine: { ...DEFAULT_LAYER_SETTINGS },
    bgm: { ...DEFAULT_LAYER_SETTINGS },
  };
  for (const key of FULL_LAYERS) {
    if (overrides[key]) cfg[key] = { ...cfg[key], ...overrides[key]! };
  }
  return cfg;
};

describe('LayerConfig defaults', () => {
  it('DEFAULT_LAYER_SETTINGS is visible + unlocked + opacity 1', () => {
    expect(DEFAULT_LAYER_SETTINGS).toEqual({ visible: true, locked: false, opacity: 1 });
  });

  it('DEFAULT_LAYER_CONFIG covers all four layers with default settings', () => {
    for (const key of FULL_LAYERS) {
      expect(DEFAULT_LAYER_CONFIG[key]).toEqual(DEFAULT_LAYER_SETTINGS);
    }
  });

  it('DEFAULT_LAYER_CONFIG entries are independent (no shared reference)', () => {
    // Mutating one layer must not affect another.
    const cfg: LayerConfig = {
      playable: { ...DEFAULT_LAYER_CONFIG.playable },
      invisible: { ...DEFAULT_LAYER_CONFIG.invisible },
      landmine: { ...DEFAULT_LAYER_CONFIG.landmine },
      bgm: { ...DEFAULT_LAYER_CONFIG.bgm },
    };
    cfg.playable.opacity = 0.5;
    expect(cfg.invisible.opacity).toBe(1);
    expect(DEFAULT_LAYER_CONFIG.playable.opacity).toBe(1);
  });
});

describe('isLayerInteractable', () => {
  it('returns true for visible + unlocked layers', () => {
    expect(isLayerInteractable('playable', DEFAULT_LAYER_CONFIG)).toBe(true);
  });

  it('returns false for hidden layers', () => {
    const cfg = makeConfig({ playable: { visible: false } });
    expect(isLayerInteractable('playable', cfg)).toBe(false);
  });

  it('returns false for locked layers', () => {
    const cfg = makeConfig({ landmine: { locked: true } });
    expect(isLayerInteractable('landmine', cfg)).toBe(false);
  });

  it('returns false when both hidden and locked', () => {
    const cfg = makeConfig({ bgm: { visible: false, locked: true } });
    expect(isLayerInteractable('bgm', cfg)).toBe(false);
  });

  it('treats undefined config as fully interactable (opt-in semantics)', () => {
    for (const key of FULL_LAYERS) {
      expect(isLayerInteractable(key, undefined)).toBe(true);
    }
  });
});

describe('isLayerVisible', () => {
  it('returns true when visible', () => {
    expect(isLayerVisible('playable', DEFAULT_LAYER_CONFIG)).toBe(true);
  });

  it('returns false when hidden', () => {
    const cfg = makeConfig({ invisible: { visible: false } });
    expect(isLayerVisible('invisible', cfg)).toBe(false);
  });

  it('ignores locked state (locked != hidden)', () => {
    const cfg = makeConfig({ landmine: { locked: true } });
    expect(isLayerVisible('landmine', cfg)).toBe(true);
  });

  it('defaults to true when config is undefined', () => {
    for (const key of FULL_LAYERS) {
      expect(isLayerVisible(key, undefined)).toBe(true);
    }
  });
});

describe('getLayerOpacity', () => {
  it('returns the configured opacity', () => {
    const cfg = makeConfig({ bgm: { opacity: 0.6 } });
    expect(getLayerOpacity('bgm', cfg)).toBe(0.6);
  });

  it('returns 1 when config is undefined', () => {
    expect(getLayerOpacity('playable', undefined)).toBe(1);
  });

  it('returns 1 for unmodified default config', () => {
    expect(getLayerOpacity('invisible', DEFAULT_LAYER_CONFIG)).toBe(1);
  });
});
