import { describe, it, expect } from 'vitest';
import { fallbackTranslate, defaultMessages } from '../../src/i18n';

describe('bms-editor fallback translator', () => {
  it('resolves a top-level toolbar key', () => {
    expect(fallbackTranslate('toolbar.save')).toBe('Save');
    expect(fallbackTranslate('toolbar.zoomIn')).toBe('Zoom In');
  });

  it('resolves a deeply nested key', () => {
    expect(fallbackTranslate('panels.keysound.uploadDialog.title')).toBe('Upload Keysounds');
    expect(fallbackTranslate('panels.statusBar.beat')).toBe('Beat');
  });

  it('returns the raw key when missing', () => {
    // @ts-expect-error -- intentional unknown key to exercise fallback
    expect(fallbackTranslate('does.not.exist')).toBe('does.not.exist');
  });

  it('every key in defaultMessages resolves to a non-empty string', () => {
    const walk = (obj: Record<string, unknown>, prefix = ''): void => {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'string') {
          expect(v).toBeTruthy();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime exhaustiveness
          expect(fallbackTranslate(key as any)).toBe(v);
        } else if (v && typeof v === 'object') {
          walk(v as Record<string, unknown>, key);
        }
      }
    };
    walk(defaultMessages as unknown as Record<string, unknown>);
  });
});
