/**
 * Public i18n contract for `@rhythm-archive/bms-editor`.
 *
 * The package owns ~1,000+ user-visible strings (toolbar labels, panel
 * headers, dialog text). Rather than couple the package to a specific i18n
 * runtime (react-i18next, react-intl, …), consumers inject an `I18nProvider`
 * and the package calls a thin `t()` interface.
 *
 * If no provider is supplied the package falls back to baked-in English
 * defaults (`./defaults.ts`) so the library remains usable in isolation.
 */

import type { BmsEditorMessages } from './defaults';

/**
 * Canonical key namespace. Dot-separated (`toolbar.save`,
 * `panels.keysound.uploadDialog.title`).
 */
export type BmsEditorI18nKey = NestedKeyOf<BmsEditorMessages>;

/**
 * Translator function. The interpolation params are passed through to the
 * consumer's i18n runtime — the bms-editor package never inspects them.
 */
export type Translator = (
  key: BmsEditorI18nKey,
  params?: Record<string, string | number>,
) => string;

export interface I18nProvider {
  /** Translate a key. Always returns a string (consumer is responsible for fallback). */
  t: Translator;
  /**
   * Optional active locale tag (BCP-47 prefix: `en`, `ko`, `ja`, …). The
   * package may use this for `Intl.NumberFormat` / `Intl.DateTimeFormat` —
   * never for branching strings.
   */
  locale?: string;
}

// --- helpers ---------------------------------------------------------------

type Primitive = string | number | boolean | null | undefined;

type NestedKeyOf<T> = T extends Primitive
  ? never
  : {
      [K in keyof T & string]: T[K] extends Primitive ? `${K}` : `${K}.${NestedKeyOf<T[K]>}`;
    }[keyof T & string];
