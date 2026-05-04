# bms-editor 리팩토링 계획

> 작성일: 2026-05-05
> 대상: `@rhythm-archive/bms-editor` (v0.1.0)
> 범위: src/ 24 파일 / 약 12,971 라인 (TS strict ✅)
> 다운스트림: `bms-electron-app` (공개 API 변경 시 영향)

---

## 1. Executive Summary

- `NoteChartViewer.tsx`(4,660줄)·`NoteChartEditor.tsx`(852줄)에 **상태/렌더/오디오/입력/효과**가 모두 혼재되어 거대한 "갓 컴포넌트"가 형성됨 — HIGH 우선순위로 분해가 필요.
- `any`/`unknown` 14건 / 5파일은 **외부 boundary**(`AudioPreloader` 콜백, `BMSHeaderData` 동적 키, `Blob`/`Uint8Array` 청크, fullscreen API)에 집중되어 있어 **Type Guard + Discriminated Union**으로 안전하게 정리 가능.
- 에디터 도메인은 자연스럽게 **Command(Undo/Redo)** · **Strategy(EditorTool)** · **Observer(Zustand store)** · **Composite(Layer)** · **Renderer 분리** 패턴이 어울림.
- Breaking 변경은 **재익스포트 경로 정리 정도**로 최소화 가능 (실제 클래스/타입 시그니처는 유지). 대부분의 작업은 내부 리팩토링.
- 검증은 기존 vitest 8개 스위트 + `tsc --noEmit` + 시각적 스모크(에디터 클릭/드래그/스크롤)로 충분.

---

## 2. 현재 구조 매핑

### 2.1 폴더 트리 + 라인수 + 책임

```
src/
├── index.ts                                  53   (라이브러리 공개 API barrel)
├── utils.ts                                  12   (cn() helper)
└── chart/
    ├── index.ts                              57   (chart 서브 barrel)
    ├── useBmsChart.ts                       580   ★ BMS fetch+parse hook + detectKeyMode()
    ├── EditorPlayback.ts                    220   재생 엔진 클래스(rAF), beat<->time
    ├── KeysoundPlayer.ts                    699   ★ AudioPreloader wrapper, 진단/EQ/리버브
    ├── laneConfig.ts                        264   키모드별 레인 좌표/색
    ├── NoteChartViewer.tsx                4,660  ★★ 갓 컴포넌트 (뷰어 전체)
    ├── NoteChartEditor.tsx                  852   ★ 에디터 컨테이너 + EditorCanvas
    ├── BmsChartDiff.tsx                     613   차트 diff 시각화
    ├── EditorContextMenu.tsx                282   우클릭 메뉴
    ├── editor/
    │   ├── types.ts                         191   에디터 타입/상수
    │   ├── editorUtils.ts                   145   순수 유틸(snap/color)
    │   ├── EditorToolbar.tsx                450   툴바 UI
    │   ├── gridRenderers.tsx                524   레인/마디/BPM 렌더러
    │   └── noteRenderers.tsx                885   ★ 노트/고스트/이펙트 렌더러
    └── panels/
        ├── HeaderEditorPanel.tsx            506   헤더 편집(탭형)
        ├── KeysoundPanel.tsx                328
        ├── KeysoundUploadDialog.tsx         331
        ├── Minimap.tsx                      359
        ├── NoteInfoPanel.tsx                403
        ├── NoteSearchDialog.tsx             280
        ├── StatusBar.tsx                    121
        └── FilePickerCombobox.tsx           159
```

### 2.2 컴포넌트/훅/유틸 분리 상태

- **유틸 레이어**: `editorUtils.ts`, `laneConfig.ts`, `EditorPlayback.ts` 의 순수 함수(`buildBeatToTimeMap`/`beatToTime`/`timeToBeat`)는 매우 깔끔. ✅
- **훅 레이어**: 단 1개 (`useBmsChart`). 에디터 상태(undo/redo, 선택, 도구, 그리드)는 모두 부모(=bms-electron-app)에 위임되어 있어 — Editor 자체에는 훅이 거의 없음.
- **컴포넌트 레이어**: Viewer는 거의 모든 로직(오디오·BGM·키사운드·셋팅·풀스크린·키 입력·렌더 모드 3종·이펙트)을 한 파일에서 처리. **Strategy/Composition으로 분해 필요**.
- **클래스 레이어**: `KeysoundPlayer`, `EditorPlayback`은 OOP로 책임이 잘 분리됨. ✅

---

## 3. 공개 API 표면 (변경 시 다운스트림 영향)

`src/index.ts`가 다음을 export:

| 카테고리 | 심볼 |
|---|---|
| 컴포넌트 | `NoteChartViewer`, `NoteChartEditor`, `EditorToolbar`, `BmsChartDiff`, `EditorContextMenu` |
| 패널 | `HeaderEditorPanel`, `KeysoundPanel`, `KeysoundUploadDialog`, `Minimap`, `NoteInfoPanel`, `NoteSearchDialog`, `StatusBar`, `FilePickerCombobox` |
| 클래스/팩토리 | `KeysoundPlayer`, `createKeysoundPlayer`, `EditorPlayback` |
| 훅/유틸 | `useBmsChart`, `detectKeyMode`, `generateLaneConfig`, `getLaneIds`, `getDpSplitIndex`, `buildBeatToTimeMap`, `beatToTime`, `cn` |
| 상수 | `KEY_MODE_DISPLAY`, `GRID_SNAP_OPTIONS` |
| 타입 | `NoteChartViewerProps`, `NoteChartEditorProps`, `KeyMode`, `NoteTypeFilter`, `ViewMode`, `BpmChange`, `StopEvent`, `ScrollSpeedChange`, `EditorTool`, `SelectedNoteType`, `GridSnap`, `CustomNoteColors`, `BmsChartDiffProps`, `BmsChartDiffInfo`, `KeysoundPlayerOptions`, `BmsChartInfo`, `UseBmsChartOptions`, `UseBmsChartState`, `UseBmsChartControls`, `UseBmsChartReturn`, `LaneConfig`, `EditorPlaybackOptions`, `BpmEvent`, `MinimapDensityEntry`, `MinimapBookmark` |

> 리팩토링 제약: **이 심볼들의 시그니처/이름/모듈 경로는 v0.x에서는 유지**. 내부 구현(분할/이동)은 자유.

---

## 4. 식별된 이슈

### HIGH

| # | 위치 | 이슈 | 영향 |
|---|---|---|---|
| H1 | `NoteChartViewer.tsx` (4,660줄) | 단일 컴포넌트가 BGM 오디오 로딩, 키사운드 초기화, 뷰모드 3종, 풀스크린, 카메라, 효과기, 카드 스크롤, 미니맵 게이트, EQ/리버브 등을 모두 담당. **갓 컴포넌트 안티패턴** | 유지보수성·테스트 작성 거의 불가능 |
| H2 | `NoteChartEditor.tsx` `EditorCanvas` (700줄+) | `useState` 11개·`useRef` 13개·`useCallback` 의존성 배열 30+ 항목·`useEffect` 7개. **상태 누수 위험** + `pointerUpProcessedRef` 같은 임시 플래그가 산재 | 회귀 발생 빈도 ↑, 동시성 버그 가능 |
| H3 | Undo/Redo가 라이브러리 외부에 위치 | `selectedNotes`, `notes`, `bpmChanges` 모두 props로 받아 부모가 관리 → **동일 로직을 두 호스트(electron-app)가 재구현해야 함** | 중복 + 일관성 깨짐 위험 |
| H4 | View ↔ Domain 결합 | `EditorCanvas`에 `findNoteAtPosition`, `findNotesInRect`, `findLongNoteEndAtPosition` 등 도메인 검색이 직접 구현되어 R3F 컴포넌트와 묶여있음 | 비주얼 변경이 비즈니스 로직 회귀로 이어짐 |
| H5 | `KeysoundPlayer` 콜백 타입 (`payload: unknown`) | 외부 boundary지만 내부에서 `as { key?: string; fileName?: string; message?: string }` 캐스트 반복 | 타입 안전성 ↓ + 메시지 종류 추가 시 누락 가능성 |

### MID

| # | 위치 | 이슈 |
|---|---|---|
| M1 | `useBmsChart.ts` 313줄 `load` 콜백 | BMS fetch + 파싱 + BPM 추출 + STOP 추출 + 스크롤 추출 + 키사운드 매핑 + 디버그 로그 + 통계 — **단일 함수에 8개 책임** |
| M2 | `EditorToolbar.tsx` `gridSnap as any` 2건 | `GRID_SNAP_OPTIONS.includes()`의 readonly tuple 좁히기 문제 — `as any` 대신 type predicate로 가능 |
| M3 | `HeaderEditorPanel.tsx` `chart.headers as unknown as Record<...>` | `BMSHeaderData`의 동적 키 접근 — 헤더 키가 유한 union이라면 keyof + 매핑 타입으로 해결 |
| M4 | Layer 설정 타입 중복 정의 | `EditorToolbarProps`와 `NoteChartEditorProps`에 `layerConfig` 동일 인라인 객체가 두 번 정의됨 |
| M5 | Renderer 파일 `noteRenderers.tsx` (885줄) | 일반 노트, 고스트, LN body, 이펙트, 판정선이 한 파일에 — Composite Pattern으로 분해 가능 |
| M6 | `KeysoundPlayer` `_loggedMissingKeys` lazy init | `private _loggedMissingKeys?: Set<string>` 후 매번 null 체크. 생성자에서 초기화하는 편이 깔끔 |
| M7 | `Blob(chunks as unknown as BlobPart[])` | `Uint8Array<ArrayBufferLike>` ↔ `BlobPart` 호환성 — TS lib 업데이트 후 `Uint8Array[]`는 직접 `BlobPart[]`에 할당 가능. 캐스트 제거 가능 |
| M8 | `outputLatency` 캐스트 (`KeysoundPlayer.ts:665`) | `'outputLatency' in ctx`로 가드 후에도 `as AudioContext & { outputLatency?: number }` — `lib.dom`의 `AudioContext.outputLatency`(이미 정의됨)로 충분 |

### LOW

| # | 위치 | 이슈 |
|---|---|---|
| L1 | `NoteChartViewer.tsx` 풀스크린 `catch (err: unknown)` | catch 블록은 `unknown`이 ES2022 default — 정상이지만 통일된 헬퍼 (`getErrorMessage(e)`)가 있으면 좋음 |
| L2 | `console.log` 다수 | dev에서만 출력하도록 가드되어 있으나, `[NoteChartViewer]` 같은 prefix가 산재 — 단일 logger 추상화 권장 |
| L3 | `defaultBeatScaleForKeyMode` 가 `NoteChartEditor.tsx` 안에 정의 | `editorUtils.ts`로 이동 가능 |
| L4 | `EditorJudgmentLine`/`NotePassEffect` import는 `noteRenderers.tsx` 인데 그래프상 "에디터 전용" — 폴더 의도와 일치 |
| L5 | `chart/index.ts`와 `src/index.ts` 둘 다 동일 심볼 재export — chain이 너무 깊음 |

---

## 5. 디자인 패턴 적용 계획

### 5.1 Command Pattern — Undo/Redo 내장화 (HIGH)

**문제**: 현재 라이브러리는 `notes`/`bpmChanges`를 props로 받고 변경은 `onNoteAdd` 콜백으로만 알림. 부모(electron-app)가 undo 스택을 직접 관리.

**해결**: 선택적 `useChartHistory(initialNotes)` 훅 + 명령 객체 정의.

```ts
// 새 파일: src/chart/history/commands.ts
export type EditorCommand =
  | { type: 'addNote'; note: EditableBMSNote }
  | { type: 'deleteNotes'; ids: string[]; before: EditableBMSNote[] }
  | { type: 'moveNotes'; ids: string[]; delta: { beat?: number; columnDelta?: number }; before: Map<string, EditableBMSNote> }
  | { type: 'updateNote'; id: string; before: EditableBMSNote; after: EditableBMSNote }
  | { type: 'addBpmChange'; change: BMSBpmChange }
  | { type: 'addStop'; stop: BMSStopEvent };

export interface CommandHandler {
  apply(state: ChartState): ChartState;
  invert(state: ChartState): ChartState;
}
```

**전 (electron-app 측 중복)**:
```ts
// 부모가 매번 작성
const [history, setHistory] = useState<HistoryEntry[]>([]);
const onNoteAdd = (note) => { setNotes(prev => [...prev, ...]); setHistory(prev => [...prev, {type:'add',...}]); };
const undo = () => { /* 직접 구현 */ };
```

**후 (라이브러리 제공)**:
```ts
const [chart, dispatch] = useChartHistory(initialNotes);
dispatch({ type: 'addNote', note: { ... } });
dispatch({ type: 'undo' });
dispatch({ type: 'redo' });
```

우선순위: **HIGH** — 가장 큰 가치.

### 5.2 Strategy Pattern — EditorTool (HIGH)

**문제**: `handlePointerDown`의 `switch (activeTool)` 7케이스 (140줄) 안에 도구별 로직이 인라인.

**전**:
```tsx
switch (activeTool) {
  case 'select': { /* 30줄 */ break; }
  case 'addNote': { /* 25줄 */ break; }
  case 'delete': { /* 15줄 */ break; }
  // ... 4개 더
}
```

**후**:
```ts
// src/chart/editor/tools/index.ts
export interface ToolHandler {
  onPointerDown(ctx: ToolContext, ev: PointerWorldEvent): void;
  onPointerMove?(ctx: ToolContext, ev: PointerWorldEvent): void;
  onPointerUp?(ctx: ToolContext, ev: PointerWorldEvent): void;
  cursor: string;
}

export const TOOL_REGISTRY: Record<EditorTool, ToolHandler> = {
  select: SelectTool,
  addNote: AddNoteTool,
  delete: DeleteTool,
  move: MoveTool,
  bpm: BpmTool,
  stop: StopTool,
  keysound: KeysoundTool,
};
```

`EditorCanvas`는 `TOOL_REGISTRY[activeTool].onPointerDown(ctx, ev)`만 호출. 각 Tool은 단일 파일에 격리되어 단위 테스트 가능.

우선순위: **HIGH**.

### 5.3 Observer/Store — Zustand (MID)

`zustand`는 이미 peerDependency로 선언됨. 사용처는 없음 → 도입 여지.

**적용처**: `useChartHistory` 내부 + `useEditorUI`(activeTool, gridSnap, layerConfig) 같은 부수 상태.

**효과**: 부모 컴포넌트의 props 폭증을 줄이고, 패널들이 `useEditorStore(s => s.activeTool)`로 selector 구독 가능 → 불필요한 리렌더 제거.

우선순위: **MID** (Command/Strategy 후 도입).

### 5.4 Composite Pattern — Layer 시스템 (MID)

**문제**: `layerConfig: { playable, invisible, landmine, bgm }` 인라인 타입을 두 곳에 중복 정의. `findNoteAtPosition`이 `layerConfig?.[noteLayer]?.locked` 같은 옵셔널 체이닝을 매번 작성.

**전**:
```ts
layerConfig?: {
  playable: { visible: boolean; locked: boolean; opacity: number };
  invisible: { ... };
  landmine: { ... };
  bgm: { ... };
};
```

**후**:
```ts
// src/chart/editor/layers.ts
export type LayerKey = 'playable' | 'invisible' | 'landmine' | 'bgm';
export interface LayerState { visible: boolean; locked: boolean; opacity: number; }
export type LayerConfig = Record<LayerKey, LayerState>;
export const DEFAULT_LAYER: LayerState = { visible: true, locked: false, opacity: 1 };
export function isInteractable(layer: LayerKey, cfg?: LayerConfig): boolean {
  const s = cfg?.[layer] ?? DEFAULT_LAYER;
  return s.visible && !s.locked;
}
```

우선순위: **MID** (간단하지만 누수 방지에 유효).

### 5.5 Renderer 분해 (HIGH)

**문제**: `NoteChartViewer.tsx` 4,660줄에 모든 `function XxxRenderer({ ... })`가 같은 파일에 있음.

**제안 분해**:
```
chart/viewer/
├── index.tsx                  (NoteChartViewer 컨테이너 - 200줄 이하)
├── ViewerCanvas.tsx           (R3F Canvas + 카메라 모드 전환)
├── modes/
│   ├── ScrollMode.tsx
│   ├── PlaybackMode.tsx
│   └── ColumnsMode.tsx
├── hooks/
│   ├── useBgmAudio.ts         (BGM HTMLAudio 로딩 + cancel + revoke)
│   ├── useKeysoundLifecycle.ts (KeysoundPlayer 초기화 + dispose)
│   ├── useFullscreen.ts
│   ├── useViewerCamera.ts
│   └── useTimingMarkerSettings.ts
├── renderers/
│   ├── JudgmentLine.tsx
│   ├── HitEffectBeam.tsx
│   ├── TimingMarkers.tsx
│   ├── NotesRenderer.tsx
│   ├── BackgroundLayer.tsx
│   └── SceneInvalidator.tsx
└── controls/
    ├── PlayControls.tsx
    ├── VolumeControls.tsx
    └── EqualizerPanel.tsx
```

우선순위: **HIGH** — Viewer 갓 컴포넌트 해결.

---

## 6. 타입 안전성 정리 계획

### 6.1 위치별 표

| # | 파일 | 라인 | 현재 | 원인 | 권장 전략 | 영향 |
|---|---|---|---|---|---|---|
| T1 | `useBmsChart.ts` | 559 | `catch (error: unknown)` | 정상(ES2022 default) | 유지 — `getErrorMessage(error)` 헬퍼로 통일 | 없음 |
| T2 | `KeysoundPlayer.ts` | 141 | `(type: string, payload: unknown) =>` | bms-player의 worker→main 콜백 boundary | **Discriminated Union + Type Guard** 정의: `WorkerMsg = { type:'PROGRESS' } \| { type:'LOADED'; key:string } \| { type:'ERROR'; key:string; fileName:string; message:string }` | 내부만, breaking 없음 |
| T3 | `KeysoundPlayer.ts` | 191/241/290 | `catch (error: unknown)` | 정상 | `getErrorMessage` 헬퍼 도입 | 없음 |
| T4 | `NoteChartViewer.tsx` | 415, 417 | `deps: unknown[]`, `useRef<unknown[]>(deps)` | 임의 deps 비교 — generic으로 해결 가능 | `<Deps extends readonly unknown[]>` 제네릭 | 없음 |
| T5 | `NoteChartViewer.tsx` | 2522, 2593, 2996, 3131 | `catch (e: unknown)` | 정상 | 동일하게 헬퍼 통일 | 없음 |
| T6 | `NoteChartViewer.tsx` | 2958 | `Blob(chunks as unknown as BlobPart[])` | TS lib `Uint8Array<ArrayBufferLike>` 호환성 | `Uint8Array[]`는 `BlobPart[]`에 직접 할당 — `as` 제거 후 `tsc` 확인. 호환 안 되면 `chunks.map(c => c.buffer)` | 없음 |
| T7 | `EditorToolbar.tsx` | 166, 189 | `gridSnap as any` | `readonly tuple.includes()` narrow | type predicate `function isPresetGridSnap(v: number): v is typeof GRID_SNAP_OPTIONS[number] { return (GRID_SNAP_OPTIONS as readonly number[]).includes(v); }` | 없음 |
| T8 | `HeaderEditorPanel.tsx` | 25 | `[string, unknown][]` | 다양한 헤더 타입 union | `[string, string \| number \| undefined][]` (실제로 `BMSHeaderData`의 union) | 없음 |
| T9 | `HeaderEditorPanel.tsx` | 279 | `chart.headers as unknown as Record<string,...>` | 동적 키 접근 | bms-core의 `BMSHeaderData`에 `getValue(key: keyof BMSHeaderData)` 추가 또는 로컬 `keyof BMSHeaderData` 활용. 안 되면 `Pick<BMSHeaderData, KnownKeys>`로 좁힘 | bms-core 협조 필요(없으면 type-narrow로 대체) |

### 6.2 공통 헬퍼 추가

```ts
// src/utils.ts
export function getErrorMessage(e: unknown, fallback = 'Unknown error'): string {
  return e instanceof Error ? e.message : typeof e === 'string' ? e : fallback;
}
```

이로 `error: unknown` 5건이 모두 깔끔하게 해결.

### 6.3 외부 boundary Type Guard

```ts
// src/chart/keysound/workerMessages.ts (신규)
export type KeysoundWorkerMessage =
  | { type: 'PROGRESS' }
  | { type: 'LOADED'; key: string }
  | { type: 'ERROR'; key: string; fileName: string; message: string };

export function isKeysoundWorkerMessage(type: string, payload: unknown): payload is KeysoundWorkerMessage {
  if (typeof payload !== 'object' || payload === null) return type === 'PROGRESS';
  const p = payload as Record<string, unknown>;
  if (type === 'LOADED') return typeof p.key === 'string';
  if (type === 'ERROR') return typeof p.key === 'string' && typeof p.fileName === 'string' && typeof p.message === 'string';
  return false;
}
```

→ `KeysoundPlayer` 콜백 내 `as` 제거.

---

## 7. 폴더/파일 재구성 제안

### 7.1 제안 구조

```
src/
├── index.ts                        (barrel — 외부 API만 노출)
├── utils.ts                        (cn, getErrorMessage)
├── domain/                         (★ 도메인 — UI 비의존)
│   ├── chart/useBmsChart.ts
│   ├── chart/detectKeyMode.ts      (분리)
│   ├── chart/keysoundExtraction.ts (분리: keysound/wav 추출)
│   ├── chart/bpmStopExtraction.ts  (분리: BPM/STOP 추출)
│   ├── timing/EditorPlayback.ts
│   ├── timing/beatTime.ts          (buildBeatToTimeMap, beatToTime, timeToBeat)
│   ├── lanes/laneConfig.ts
│   └── history/                    (★ 새 패턴 — Command)
│       ├── commands.ts
│       ├── reducer.ts
│       └── useChartHistory.ts
├── audio/
│   ├── KeysoundPlayer.ts
│   ├── workerMessages.ts           (Type Guard)
│   └── frameDuration.ts            (detectFrameDuration 분리)
├── viewer/                         (NoteChartViewer 분해 — 5.5 참조)
│   ├── index.tsx
│   ├── ViewerCanvas.tsx
│   ├── modes/, hooks/, renderers/, controls/
├── editor/
│   ├── index.tsx                   (NoteChartEditor 컨테이너)
│   ├── EditorCanvas.tsx
│   ├── EditorToolbar.tsx
│   ├── EditorContextMenu.tsx
│   ├── tools/                      (★ 새 패턴 — Strategy)
│   │   ├── index.ts (TOOL_REGISTRY)
│   │   ├── SelectTool.ts, AddNoteTool.ts, DeleteTool.ts, MoveTool.ts,
│   │   ├── BpmTool.ts, StopTool.ts, KeysoundTool.ts
│   ├── layers.ts                   (LayerConfig, isInteractable)
│   ├── coords.ts                   (screenToWorld, worldToLane)
│   ├── grid/snap.ts
│   ├── renderers/
│   │   ├── grid/                   (LanesRenderer, MeasureLines, BpmMarkers, StopMarkers)
│   │   └── notes/                  (NotesRenderer, HoverPreview, RubberBandRect, DragGhost, NotePassEffect, JudgmentLine)
│   └── types.ts                    (EditorTool, GridSnap, etc.)
├── diff/
│   └── BmsChartDiff.tsx
└── panels/
    └── (현행 유지)
```

### 7.2 변경 매핑 (요약)

- `chart/NoteChartViewer.tsx` (4,660) → `viewer/*` 분해 + `audio/`로 BGM 로직 이동
- `chart/NoteChartEditor.tsx` (852) → `editor/index.tsx` + `editor/EditorCanvas.tsx` + `editor/tools/*`
- `chart/editor/*` → `editor/*` (한 단계 평탄화)
- `chart/index.ts`와 `src/index.ts` 중 하나로 통합 (Low priority)

---

## 8. 단계별 실행 계획 (작은 PR 단위)

| PR | 제목 | 범위 | LOC 영향 | 위험도 | Breaking? |
|---|---|---|---|---|---|
| P1 | chore: `getErrorMessage` 헬퍼 + catch 블록 통일 | utils.ts + 5파일 | ~30 줄 | LOW | No |
| P2 | types: `KeysoundWorkerMessage` discriminated union | KeysoundPlayer.ts + 신규 1파일 | ~50 줄 | LOW | No |
| P3 | types: `gridSnap as any` 제거 (type predicate) | EditorToolbar.tsx | ~10 줄 | LOW | No |
| P4 | types: `HeaderEditorPanel`의 `unknown` 캐스트 정리 | HeaderEditorPanel.tsx | ~15 줄 | LOW | No |
| P5 | types: `Blob(chunks as unknown ...)` 제거 검증 | NoteChartViewer.tsx | ~5 줄 | LOW | No |
| P6 | refactor: `LayerConfig` 공유 타입 추출 (Composite) | editor/layers.ts + 2파일 | ~80 줄 | LOW | No |
| P7 | refactor: `useBmsChart.load` 함수 분해 (M1) | useBmsChart.ts → 4파일 | ~250 줄 | MID | No (시그니처 유지) |
| P8 | refactor: EditorTool **Strategy Pattern** 도입 | editor/tools/* (신규 7파일) + EditorCanvas.tsx | ~600 줄 이동 | MID | No |
| P9 | refactor: `EditorCanvas` 입력 핸들러 분해 (5.5) | EditorCanvas.tsx 분할 | ~700 줄 이동 | MID | No |
| P10 | feat: `useChartHistory` Command Pattern (선택적) | history/* (신규 3파일) | +400 줄 | MID | **No** (추가 export, 기존 props도 유지) |
| P11 | refactor: `NoteChartViewer` 분해 (1/3) — BGM 오디오 훅 | viewer/hooks/useBgmAudio.ts | ~200 줄 이동 | MID | No |
| P12 | refactor: `NoteChartViewer` 분해 (2/3) — 키사운드/풀스크린 훅 | viewer/hooks/* | ~400 줄 이동 | MID | No |
| P13 | refactor: `NoteChartViewer` 분해 (3/3) — 모드별 컴포넌트 | viewer/modes/* | ~1500 줄 이동 | HIGH | No |
| P14 | refactor: 폴더 평탄화 (chart/editor → editor) | 파일 이동 + 재export | LOW (경로만) | LOW | No (barrel 유지) |
| P15 | docs: 신규 패턴 가이드 + 아키텍처 README | docs/* | +200 줄 | LOW | No |

> 각 PR은 독립적으로 빌드·테스트 통과, 외부 API 시그니처 동결을 강제. P10·P14는 옵션. P13가 가장 위험.

---

## 9. 외부 호환성 영향

### 9.1 현 단계 Breaking 변경 — **없음** (주의해서 작업하면)

모든 작업은 내부 분할/재구성이며, `src/index.ts`의 export 시그니처를 유지한다.

### 9.2 잠재적 Breaking (확인 필요)

| 항목 | 검토 필요 |
|---|---|
| `NoteChartEditorProps.layerConfig` | 인라인 → `LayerConfig` 타입 alias 변경. **구조는 동일** → 호환 ✅ |
| `EditorTool` union | 새 도구 추가는 호환, 제거는 breaking. 현행 유지 |
| `KeysoundPlayer` 클래스 시그니처 | private 멤버는 자유, public 메서드 21개는 동결 |
| `useBmsChart` 반환 튜플 | `[state, controls]` 구조 동결 |

### 9.3 다운스트림 (`bms-electron-app`) 확인 항목

- P10에서 `useChartHistory` 도입 시 — 부모가 기존 undo/redo를 유지할 수도 있으므로 **기존 props도 그대로 두고 신규 훅을 부가 옵션**으로 제공.

---

## 10. 검증 계획

### 10.1 자동화

| 단계 | 명령 | 통과 조건 |
|---|---|---|
| 타입 체크 | `npm run type-check` | 0 errors |
| 단위 테스트 | `npm test` | 8개 스위트 모두 pass (adversarial-editor / detectKeyMode / editorPlayback × 2 / integration-bms-core / laneConfig / timeToBeat / utils) |
| 빌드 | `npm run build` | dist 생성 + d.ts 일치 |
| (있다면) lint | `eslint src` | 0 errors — 현 워크스페이스에 lint 설정 없음 → PR1에서 추가 검토 |

### 10.2 회귀 스위트 추가 (PR8/P10/P11~13에서 권장)

| 영역 | 신규 테스트 |
|---|---|
| Strategy(Tool) | 각 ToolHandler에 대한 `onPointerDown` 시뮬레이션 (mock context) |
| Command(History) | apply/invert가 항등 (state == invert(apply(state))) |
| Type Guard | `isKeysoundWorkerMessage`의 5개 분기 |
| `getErrorMessage` | Error / string / object / null / undefined |
| LayerConfig | `isInteractable` 정의 8케이스 (visible × locked × hasConfig) |

### 10.3 시각적/인터랙션 스모크 (수동)

`bms-electron-app`을 띄워서 다음을 체크:

1. **에디터 입력**
   - select/addNote/delete/move/bpm/stop/keysound 각각 클릭 1회 + 드래그 1회 동작
   - LN 드래그 생성 (addNote + longNote)
   - Rubber band 다중 선택
   - Ctrl+Z / Ctrl+Y (P10 도입 후)
2. **에디터 줌/스크롤**
   - 휠 스크롤, Ctrl+휠 줌(커서 고정), Home/End/PageUp/PageDown
   - zoomIn/Out/fitToChart 버튼
3. **뷰어**
   - scroll/playback/columns 3 모드 전환
   - 풀스크린 토글
   - BGM 재생 + 키사운드 토글
   - EQ/리버브/컴프레서 활성화
4. **드래그 앤 드롭**: keysound panel → editor 캔버스
5. **다운스트림(electron)** 빌드 후 패키징 정상

### 10.4 성능 회귀 체크

- `_playLatencies` 평균: 변경 전후 비교 (P8 도입 후 +0.5ms 이내 허용)
- `MAX_VISIBLE_EDITOR_NOTES = 3000` 시 60fps 유지 확인 (Chrome perf tab)

---

## 11. 위험 요소

| # | 위험 | 완화 |
|---|---|---|
| R1 | P13 (Viewer 분해)에서 useEffect 순서 변경으로 키사운드 race 재발생 | dispose 가드(`cancelled`)와 `keysoundPlayerRef.current = null` 시점을 변경하지 않음. 단위 테스트가 어려우니 수동 회귀 체크리스트 필수 |
| R2 | P8 Strategy 도입 시 `useCallback` 의존성 폭증으로 리렌더 증가 | ToolContext를 `useRef`로 캡슐화하고 핸들러는 closure-free 객체로 |
| R3 | P10 Command가 부모의 기존 undo와 충돌 | 기본값 비활성, props로 명시적 opt-in (`enableInternalHistory: true`) |
| R4 | bms-core의 `BMSHeaderData` 타입 변경 가능성 | T9 작업 전 bms-core 분석 결과 확인. 안전한 fallback은 `Pick<BMSHeaderData, KnownKey>` |
| R5 | three.js `Line2`/`LineSegments2` 같은 three-stdlib 타입은 R3F 버전과 결합도 높음 | type-only import 유지, 분해 시 별도 파일에 격리 |
| R6 | electron-app이 `chart/EditorContextMenu` 등 deep import를 사용 중일 가능성 | 폴더 평탄화(P14) 전 grep으로 deep-import 사용처 확인 + barrel 양쪽 모두 한동안 유지 |
| R7 | 파일 이동 PR이 git history에서 diff로 인식되지 않을 수 있음 | `git mv`만으로 분리 PR 작성, 내용 변경은 후속 PR로 분리 |

---

## 부록 A. 핵심 메트릭

| 지표 | 값 |
|---|---|
| 총 파일 | 24 (TS/TSX) |
| 총 라인 | 12,971 |
| 갓 컴포넌트 | 2 (NoteChartViewer 4,660 / NoteChartEditor 852) |
| any 사용 | 2 (EditorToolbar 동일 패턴) |
| unknown 사용 | 12 (대부분 catch / 외부 boundary — 정당) |
| 캐스트 (`as unknown as`) | 2 (NoteChartViewer, HeaderEditorPanel) |
| 중복 타입 정의 | 1쌍 (LayerConfig) |
| 공개 API 심볼 | 38 (값 14 + 타입 24) |
| 단위 테스트 스위트 | 8 |

## 부록 B. 권장 PR 순서 (Top 5 가성비)

1. **P1** (`getErrorMessage`) — 5분 작업, unknown 5건 정리
2. **P2** (`KeysoundWorkerMessage`) — 30분, 가장 위험한 boundary 안전화
3. **P3 + P4 + P5** (any/cast 잔여 정리) — 30분
4. **P6** (LayerConfig 공유) — 1시간, 미래 변경 비용 ↓
5. **P8** (Strategy/Tool) — 4시간, EditorCanvas 의존성 폭 50% 축소

위 5개만으로 코드 품질이 크게 향상되며, P10/P13은 점진적으로 도입.
