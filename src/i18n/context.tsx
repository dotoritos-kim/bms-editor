/**
 * React Context wiring for the bms-editor i18n contract.
 *
 * The consumer wraps the editor with `<I18nProvider value={...}>` from this
 * file. Internal components call `useI18n()` to obtain `t()`. When no
 * provider is mounted the hook returns a translator backed by
 * `defaultMessages` (English) so the library stays usable standalone.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { defaultMessages } from './defaults';
import type { BmsEditorI18nKey, I18nProvider as I18nProviderValue, Translator } from './types';

const I18nContext = createContext<I18nProviderValue | null>(null);

interface I18nProviderProps {
  value: I18nProviderValue;
  children: ReactNode;
}

export function I18nProvider({ value, children }: I18nProviderProps) {
  // Memoize so that consumers passing a stable `t` reference avoid forcing a
  // re-render of the entire subtree on every parent render.
  const memoized = useMemo<I18nProviderValue>(
    () => ({ t: value.t, locale: value.locale }),
    [value.t, value.locale],
  );
  return <I18nContext.Provider value={memoized}>{children}</I18nContext.Provider>;
}

/**
 * Resolve a key against the bundled English defaults. Used by the fallback
 * translator and by direct callers that explicitly want a non-translated
 * baseline (e.g., test fixtures).
 */
export function fallbackTranslate(
  key: BmsEditorI18nKey,
  _params?: Record<string, string | number>,
): string {
  const parts = key.split('.');
  let cursor: unknown = defaultMessages;
  for (const part of parts) {
    if (cursor && typeof cursor === 'object' && part in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return key; // missing — surface the raw key as a last-resort signal
    }
  }
  return typeof cursor === 'string' ? cursor : key;
}

const fallbackProvider: I18nProviderValue = {
  t: fallbackTranslate as Translator,
  locale: 'en',
};

/**
 * Access the active i18n provider, falling back to the bundled English
 * defaults when no `<I18nProvider>` is mounted above.
 */
export function useI18n(): I18nProviderValue {
  return useContext(I18nContext) ?? fallbackProvider;
}
