/**
 * Layer system — Composite Pattern foundation.
 *
 * Editor notes are organised into 4 logical layers (`playable`, `invisible`,
 * `landmine`, `bgm`). Each layer carries the same per-layer state shape
 * (`visible` / `locked` / `opacity`), and downstream consumers
 * (`bms-electron-app`'s `editorStore`) already use the same structure.
 *
 * Before this module:
 *   - `LayerConfig` was inlined as an anonymous object literal in 3+ places
 *     (`NoteChartEditorProps`, `EditorToolbarProps`, `NotesRenderer` props,
 *     `BgmLabels` props), with each occurrence forced to repeat the same
 *     `{ visible: boolean; locked: boolean; opacity: number }` shape.
 *   - Locked/hidden layer checks were copy-pasted as
 *     `layerConfig?.[layer]?.visible === false || layerConfig?.[layer]?.locked`.
 *
 * This module centralises the type definitions (`LayerKey`, `LayerSettings`,
 * `LayerConfig`) plus a small set of pure helpers (`isLayerInteractable`,
 * `isLayerVisible`, `getLayerOpacity`) so future tools (P8 EditorTool Strategy)
 * can rely on a single source of truth.
 *
 * Structural shape is identical to the previous inline literals — this is a
 * pure refactor with **no breaking changes** for existing callers.
 */

/** All editor layer identifiers (matches `BMSNote.noteType` minus `'longNote'`). */
export type LayerKey = 'playable' | 'invisible' | 'landmine' | 'bgm';

/** Per-layer toggleable state. */
export interface LayerSettings {
  /** When `false`, notes on this layer are hidden from the canvas. */
  visible: boolean;
  /** When `true`, notes on this layer cannot be selected/moved/deleted. */
  locked: boolean;
  /** Render opacity multiplier (`0`..`1`). */
  opacity: number;
}

/** Layer configuration map covering all four editor layers. */
export type LayerConfig = Record<LayerKey, LayerSettings>;

/**
 * Default per-layer settings used when no explicit `LayerConfig` is supplied.
 * Visible + unlocked + fully opaque.
 */
export const DEFAULT_LAYER_SETTINGS: LayerSettings = {
  visible: true,
  locked: false,
  opacity: 1,
};

/**
 * Opaque-everything default config (downstream consumers may override per
 * layer — e.g. electron-app dims `invisible` to 0.4 and `bgm` to 0.6).
 */
export const DEFAULT_LAYER_CONFIG: LayerConfig = {
  playable: { ...DEFAULT_LAYER_SETTINGS },
  invisible: { ...DEFAULT_LAYER_SETTINGS },
  landmine: { ...DEFAULT_LAYER_SETTINGS },
  bgm: { ...DEFAULT_LAYER_SETTINGS },
};

/**
 * Returns `true` when notes on `layer` should respond to pointer hits.
 *
 * A layer is interactable iff it is visible AND unlocked. This collapses the
 * common `if (!ls.visible || ls.locked) return false` pattern into a single
 * predicate so future tool handlers (P8 Strategy) can share it.
 */
export function isLayerInteractable(
  layer: LayerKey,
  config: LayerConfig | undefined
): boolean {
  const settings = config?.[layer] ?? DEFAULT_LAYER_SETTINGS;
  return settings.visible && !settings.locked;
}

/**
 * Returns `true` when notes on `layer` are rendered. When `config` is omitted
 * (no layer config provided), all layers default to visible.
 */
export function isLayerVisible(
  layer: LayerKey,
  config: LayerConfig | undefined
): boolean {
  return (config?.[layer] ?? DEFAULT_LAYER_SETTINGS).visible;
}

/**
 * Returns the render opacity for `layer` (clamped to `0`..`1` by callers).
 * Defaults to `1` when no config is supplied.
 */
export function getLayerOpacity(
  layer: LayerKey,
  config: LayerConfig | undefined
): number {
  return (config?.[layer] ?? DEFAULT_LAYER_SETTINGS).opacity;
}
