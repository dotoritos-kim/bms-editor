# `@rhythm-archive/bms-editor`

React components and hooks for editing BMS charts. Provides
`NoteChartEditor`, `NoteChartViewer`, panels (Keysounds, Header, Minimap,
Note Info, Status Bar, Note Search), and a chart-diff visualiser.

## Highlights

- Tick-based note model (960 ticks per beat) with undo/redo.
- 4K to 48K + 4SC key modes via `generateLaneConfig` / `getLaneIds`.
  4K / 6K / 8K follow Qwilight (U_E / Yuipack) and are selected only by a
  value-less `#4K` / `#6K` / `#8K` (`detectKeyMode`, ranked above
  `#KEYMODE`); without the command the same channels read as 5K / 7K.
  10K 2P lanes use columns 8-12 like bms-core.
- Note editing: notes are hit-tested where they are drawn and hit boxes follow
  the note thickness setting. Drag a short note's top edge (or Alt+drag) to
  make a long note, drag a long note's end back to its head to make it short,
  or use "Convert to Long / Short Note" in the context menu.
  `dragAxisLock` (`'free' | 'auto' | 'horizontal' | 'vertical'`) keeps the
  timing or the lane of dragged notes; `onNotesConvert` moves a selection
  between key lanes and BGM in one undo step.
- Keysound-heavy charts: every note is drawn (no instance caps), BGM lane
  width adapts to the lane count, and `bgmLanesInView` fits a number of BGM
  lanes on screen and scrolls the rest sideways (Shift+wheel or the scrollbar
  under the canvas).
- `KeysoundPanel`: double-click previews a keysound; with
  `onSelectNotesByKeysounds` Ctrl+click / Shift+click / folder Ctrl+click
  pick several keysounds and select their BGM notes or all their notes.
- `#EXBPMxx` resolves channel-08 BPM changes (`#BPMxx` wins); `#STOP` values
  are shown in beats (1/48); `#BASE 62` charts keep the typed case of
  `#WAV` / `#BMP` ids.
- Headless playback engine: `EditorPlayback` schedules note onsets so the
  editor can preview the chart without dragging in the player package. It
  accepts any `PlaybackKeysoundPlayer` (`isReady`, `play`, `stopAll`,
  `getContextTime`), including bms-player's `KeysoundPlayer`.
- React Context-based **i18n**: consumers inject a translator. See
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
| `useBmsChart`, `detectKeyMode` | Load + manage a chart from buffer; key mode detection |
| `generateLaneConfig`, `getLaneIds` | Lane layouts per key mode |
| `EditorPlayback` | Headless playback scheduler |
| `KeysoundPlayer` | Keysound preview helper (default loader worker from bms-player) |
| `KeysoundPanel`, `HeaderEditorPanel`, `Minimap`, `NoteSearchDialog`, ... | Editor panels |
| `I18nProvider`, `useI18n` | i18n contract (see I18N.md) |

## Development

```bash
npm install       # on Windows use `npm install --include=dev` if devDeps are skipped
npm run build     # vite build + .d.ts emit
npm test          # vitest
npm run lint      # eslint (flat config: eslint.config.js)
npm run format    # prettier (config: .prettierrc.json)
```

This package is **vendored** by `bms-electron-app` as a git submodule at
`vendor/bms-editor/` and linked through npm workspaces. When changing the
public API, update the submodule pointer in the app in the same change.

## Versioning

- Adding a key to `defaultMessages` is a **minor** bump.
- Removing or renaming a key is a **major** bump.
- Component prop changes follow standard semver.

## Related

- [`bms-core`](https://github.com/dotoritos-kim/bms-core): parser
- [`bms-player`](https://github.com/dotoritos-kim/bms-player): runtime
- [`bms-electron-app`](https://github.com/dotoritos-kim/bms-electron-app): shell
