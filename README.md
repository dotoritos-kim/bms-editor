# `@rhythm-archive/bms-editor`

React components and hooks for editing BMS charts. Provides
`NoteChartEditor`, `NoteChartViewer`, panels (Keysounds, Header, Minimap,
Note Info, Status Bar, Note Search), and a chart-diff visualiser.

🇰🇷 한국어 README는 추후 추가 예정입니다 <!-- Phase 4 follow-up -->

## Highlights

- Tick-based note model (960 ticks per beat) with undo/redo.
- 4K to 48K + 4SC key modes via `generateLaneConfig` / `getLaneIds`.
- Headless playback engine: `EditorPlayback` schedules note onsets so the
  editor can preview the chart without dragging in the player package.
- React Context-based **i18n** — consumers inject a translator. See
  [`I18N.md`](./I18N.md).

## Quick start

```tsx
import {
  NoteChartEditor,
  I18nProvider,
  type Translator,
  type NoteChartEditorProps,
} from '@rhythm-archive/bms-editor';

function ChartEditorScreen(props: NoteChartEditorProps) {
  const { t, i18n } = useTranslation('bms-editor');
  const provider = useMemo(
    () => ({ t: t as Translator, locale: i18n.language }),
    [t, i18n.language],
  );
  return (
    <I18nProvider value={provider}>
      <NoteChartEditor {...props} />
    </I18nProvider>
  );
}
```

If you skip `I18nProvider` the editor falls back to bundled English defaults
(`src/i18n/defaults.ts`).

## Public API

See [`src/index.ts`](src/index.ts) for the full export list. Highlights:

| Export | Purpose |
| --- | --- |
| `NoteChartEditor` | Full editor canvas + toolbar |
| `NoteChartViewer` | Read-only chart visualisation |
| `BmsChartDiff` | Visual diff between two charts |
| `useBmsChart` | Hook to load + manage a chart from buffer |
| `EditorPlayback` | Headless playback scheduler |
| `KeysoundPlayer` | Keysound preview helper |
| `I18nProvider`, `useI18n` | i18n contract — see I18N.md |

## Versioning

- Adding a key to `defaultMessages` is a **minor** bump.
- Removing or renaming a key is a **major** bump.
- Component prop changes follow standard semver.

## Related

- [`bms-core`](https://github.com/dotoritos-kim/bms-core) — parser
- [`bms-player`](https://github.com/dotoritos-kim/bms-player) — runtime
- [`bms-electron-app`](https://github.com/dotoritos-kim/bms-electron-app) — shell
