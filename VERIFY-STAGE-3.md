# Stage 3 검증 보고서 — bms-editor PR #5

> 작성일: 2026-05-05 (PR open 상태 / 머지 전 검증)
> 검증자: 독립 reviewer (Claude Opus 4.7, 자기보고 신뢰 금지)
> 대상: `refactor(stage-3): extract shared LayerConfig type (Composite foundation)` (#5)
> Base: `master` ← Head: `refactor/stage-3-layer-config`
> 머지 가능 상태: `MERGEABLE` / `CLEAN`
> 베이스라인: laneConfig pre-regression(#3), ZoomControl re-export(#4)이 이미 master에 머지된 상태

---

## 1. 검증 결론 (TL;DR)

**Verdict: PASS (with one minor note) — 안전하고 정확한 작은 refactor PR. 머지 권고.**

- 모든 핵심 자기보고 항목 **재현 성공**:
  - `npm test -- --run` → **180 passed / 0 failed / 5 skipped** (REPRODUCED, +15 신규는 모두 `tests/layers.test.ts`)
  - `npm run build` → vite **26 modules transformed, ✓ built in ~440ms**, `dist/index.d.ts` 8개 신규 export 포함하여 정확히 emit됨
  - 인라인 `{ visible; locked; opacity }` literal 3곳 (`NoteChartEditorProps`, `EditorToolbarProps`, `NotesRenderer`, `BgmLabels`) 모두 제거 → grep 결과 doc-comment(layers.ts:13)만 남음
  - `if (!ls.visible || ls.locked)` 인라인 predicate → `isLayerInteractable` 호출로 대체 (NoteChartEditor.tsx:393)
- **공개 API 비파괴** 확인: `src/index.ts` master 대비 8개 신규 export 추가만 발생, 기존 export 전부 보존
- **Cross-package 무영향** 확인: `bms-electron-app` `npm run type-check` 0 errors / `npm run build` 성공 (renderer 2248 modules OK). electron-app 자체 `LayerConfig`(editorStore.ts:97)는 PR의 새 `LayerConfig`와 **구조적으로 1:1 동일** — 향후 import 교체로 통합 가능
- 머지 위험도: **LOW**

> ⚠️ **자기보고 정정 1건**: PR description은 "`npm run type-check` → 0 errors"라 주장하나, **master 베이스라인에서도 동일 errors**가 발생. 원인은 `@rhythm-archive/bms-core/dist/index.d.ts` 누락(bms-core가 `--declaration` 없이 빌드된 환경 이슈)으로, **PR이 도입한 회귀 아님**. PR diff 자체는 타입 오류를 도입하지 않음 (vite + d.ts emit OK 확인). 베이스라인 동치이므로 검증 결과에 영향 없음.

---

## 2. PR 메타데이터

| 항목 | 값 |
|---|---|
| PR | https://github.com/dotoritos-kim/bms-editor/pull/5 |
| 상태 | OPEN / MERGEABLE / CLEAN |
| Base / Head | `master` ← `refactor/stage-3-layer-config` |
| 변경 라인 | +287 / -32 |
| 변경 파일 | 7 (신규 2 + 수정 5) |
| 신규 파일 | `src/chart/editor/layers.ts` (+98), `tests/layers.test.ts` (+114) |
| 수정 파일 | `NoteChartEditor.tsx` (+23/-5), `editor/noteRenderers.tsx` (+4/-12), `editor/types.ts` (+14/-12), `chart/index.ts` (+13/-1), `index.ts` (+21/-2) |
| 제약 충족 | LOC ≤500 ✅, 파일 ≤20 ✅ |

---

## 3. Plan(P6) 의도 vs 구현 매핑

REFACTOR-PLAN.md P6 spec: *"LayerConfig 공유 타입 추출 (Composite) — editor/layers.ts + 2파일, ~80줄, LOW, no breaking"*

| Plan 항목 | 구현 | 평가 |
|---|---|---|
| `editor/layers.ts` 신규 | ✅ 98줄 (plan 대비 +18줄, 헬퍼 3개와 doc-comment 포함) | ✅ |
| 2파일에 적용 | ✅ 4파일 (`NoteChartEditorProps`/`EditorToolbarProps` in `types.ts`, `NotesRenderer`/`BgmLabels` in `noteRenderers.tsx`) — plan 추정보다 약간 광범위 | ✅ 더 철저함 |
| LOW 위험 | ✅ 추가 export only, 기존 시그니처 보존 | ✅ |
| no breaking | ✅ 본 검증에서 cross-package 빌드/타입체크로 확인 | ✅ |

**P8 (EditorTool Strategy) 빌딩 블록**: `isLayerInteractable`이 도구별 interaction 게이팅의 표준 진입점이 됨 — plan의 foundation 의도 부합.

---

## 4. 검증 항목별 상세

### 4.1 PR diff vs Plan 의도

- 새 모듈 `layers.ts`는 `LayerKey`/`LayerSettings`/`LayerConfig` + `DEFAULT_LAYER_SETTINGS`/`DEFAULT_LAYER_CONFIG` + 3 헬퍼(`isLayerInteractable`/`isLayerVisible`/`getLayerOpacity`)를 정의.
- `LayerKey = 'playable' | 'invisible' | 'landmine' | 'bgm'`은 `BMSNote.noteType`의 4-way subset과 정확히 일치 (longNote 제외 — note는 longNote도 playable의 sub-type이므로 의도 정확).
- `types.ts`에서 `layers.ts` 모든 심볼을 re-export → 호출자가 `from './editor/types'`로 그대로 사용 가능 (호환성 우선).

### 4.2 빌드/테스트/타입체크 (PR head: pr5-verify checkout 후)

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm test -- --run` | ✅ 10 files / **180 passed** / 5 skipped (1 file skipped) | 자기보고 일치 (165→180, +15 신규는 layers.test.ts) |
| `npm run build` (vite) | ✅ 26 modules transformed, dist/index.{js,cjs,d.ts} OK | dist/index.d.ts에 8개 신규 export 정확히 emit |
| `npm run type-check` | ⚠️ master와 **동일 errors** (`@rhythm-archive/bms-core` d.ts 누락) | PR이 도입한 신규 error 없음 — bms-core dist에 .d.ts 미존재(환경 이슈) |

**베이스라인 비교**: master에서 동일 명령 실행 시 동일 에러 출력. 즉 PR diff는 type-check 결과를 **악화시키지 않음**. d.ts emit은 `--emitDeclarationOnly` 동작 특성상 에러와 무관하게 성공.

### 4.3 인라인 literal 3곳 통일 + 누락 검사

`grep -E 'visible:\s*boolean;\s*locked:\s*boolean;\s*opacity:\s*number'`:
- master: **14건** (types.ts 8건, noteRenderers.tsx 6건)
- PR head: **1건** (layers.ts:13 doc-comment) — **모두 제거됨** ✅

`grep -E '!ls\.visible \|\| ls\.locked|visible === false'`:
- PR head 코드 출현: 0건. layers.ts doc-comment 2건만 잔존.

**Minor note (가벼운 스코프 미달성, 회귀 아님)**:
- `noteRenderers.tsx:139-140`의 렌더 루프 visibility 체크: `const layerSettings = layerConfig?.[noteLayer]; if (layerSettings && !layerSettings.visible) continue;` — 이 부분은 `isLayerVisible(noteLayer, layerConfig)` 헬퍼로 치환 가능했으나 그대로 유지됨.
- `noteRenderers.tsx:418`의 `BgmLabels`: `const bgmVisible = layerConfig?.bgm?.visible ?? true;` — 헬퍼 미사용.
- PR description은 "1 predicate collapsed" (findNoteAtPosition만)이라 명시했으므로 약속 위반 아님. 다만 plan P6의 *"공통 헬퍼 도입"* 정신 관점에서 5줄 정도 더 정리 여지 존재. 후속 PR에서 처리해도 무방.

### 4.4 Additive export 비파괴 확인

`src/index.ts` master vs PR diff: 기존 export(NoteChartEditor, EditorToolbar, GRID_SNAP_OPTIONS, NoteChartEditorProps, EditorTool, SelectedNoteType, GridSnap, CustomNoteColors, ZoomControl) **9개 모두 보존**, 신규 8개 추가 (5 value + 3 type).

`src/chart/index.ts`도 동일 패턴 — barrel re-export 일관성 유지.

`dist/index.d.ts` 검사: 신규 8개 export 모두 정확히 emit됨.

### 4.5 Helper 시맨틱 정확성

원본 코드 (NoteChartEditor.tsx pre-PR, line 393 부근):
```ts
const ls = layerConfig?.[noteLayer];
if (ls && (!ls.visible || ls.locked)) return false;
```
- `ls` undefined일 때 → 조건 false → fall-through (interactable로 취급)
- `ls` 존재하고 hidden 또는 locked → return false

PR 후:
```ts
if (!isLayerInteractable(noteLayer, layerConfig)) return false;
```
- `config?.[layer] ?? DEFAULT_LAYER_SETTINGS` (={visible:true, locked:false}) → undefined일 때 `true && !false = true` → interactable
- 정의되어 있으면 `visible && !locked`

**시맨틱 동치 확인** ✅. 단, 두 가지 subtle한 강화:
1. `DEFAULT_LAYER_SETTINGS` fallback 덕분에 partial config (예: `{playable: ..., bgm: ...}` only)도 안전하게 처리 — 원본은 `ls`가 truthy일 때만 검사하므로 `bgm: undefined`인 부분 config에서도 동작 동일.
2. `isLayerVisible`/`getLayerOpacity`는 일관된 default 전략을 따름 — `noteRenderers.tsx:140`의 `layerSettings && !layerSettings.visible`(undefined → 통과)은 `isLayerVisible`(undefined → true) 와 동일 결과.

`tests/layers.test.ts` 15 케이스가 위 동작을 모두 명시적으로 검증 (independent reference 테스트, undefined config 처리, locked != hidden 분리 등).

### 4.6 Cross-package (bms-electron-app)

| 명령 | 결과 |
|---|---|
| `npm run type-check` (tsc --noEmit, node + web) | ✅ **0 errors** |
| `npm run build` (electron-vite) | ✅ preload + renderer 2248 modules transformed, ~7.8s |

`bms-electron-app/src/renderer/stores/editorStore.ts:90-109`이 정의하는 `LayerSettings`/`LayerConfig`/`DEFAULT_LAYER_CONFIG`는 PR의 새 타입과 **구조적으로 1:1 동일**:
- `LayerSettings`: `{ visible: boolean; locked: boolean; opacity: number }` ✅ 동일
- `LayerConfig`: `{ playable, invisible, landmine, bgm }` 4-key Record ✅ 동일
- `DEFAULT_LAYER_CONFIG`: 값만 다름(electron-app은 `invisible: 0.4`, `bgm: 0.6` 디밍) — PR의 `DEFAULT_LAYER_CONFIG`(전부 1.0)와 의도적 차이, breaking 아님

**향후 후속 PR (P6 후속)** 에서 electron-app이 자체 정의를 제거하고 `import type { LayerConfig } from '@rhythm-archive/bms-editor'`로 교체하는 마이그레이션이 가능 — 이번 PR은 그 단계에 도달하지 않았지만 정확히 그 길을 열어둠.

### 4.7 머지 위험도 평가

| Risk Vector | 평가 | 근거 |
|---|---|---|
| 공개 API 회귀 | None | 기존 9 export 보존, 신규 8 추가 only |
| 런타임 동작 변화 | None | helper 시맨틱 동치, 테스트 180 pass |
| Cross-package 깨짐 | None | electron-app type-check + build 통과 |
| LOC/파일 제약 | OK | +287/-32 (≤500), 7 files (≤20) |
| 베이스 컨플릭트 | None | mergeStateStatus: CLEAN |
| 자기보고 정확성 | 1 minor 정정 | type-check 0-errors 주장은 환경 의존 (master 동치) |

**Overall: LOW** — 즉시 머지 가능.

---

## 5. 권고 (후속)

1. **선택적 미세 cleanup (별도 PR)**: `noteRenderers.tsx:139-140` 및 `BgmLabels:418`의 인라인 visibility 체크를 `isLayerVisible`로 전환 (≈5줄, 동치 변환).
2. **electron-app 통합 (P6 후속)**: `editorStore.ts:90-102`의 자체 `LayerSettings`/`LayerConfig` 정의를 `@rhythm-archive/bms-editor` import로 교체. `DEFAULT_LAYER_CONFIG`는 electron-app 고유 디밍 값을 유지하므로 type만 import.
3. **bms-core .d.ts 환경 이슈**: 본 PR과 무관하지만 type-check 베이스라인 노이즈 제거를 위해 `cd ../bms-core && npm run build` 또는 tsc `--declaration` 활성화 필요. 별도 인프라 작업.
4. **P8 (EditorTool Strategy)** 진행 시 `isLayerInteractable`을 단일 진입점으로 채택 — 이 PR이 그 빌딩 블록 역할을 정확히 수행함.

---

## 6. 검증 절차 재현

```bash
cd c:/SourceCode/bms-editor
git fetch origin pull/5/head:pr5-verify
git checkout pr5-verify

# 1) 인라인 literal grep
grep -rE 'visible:\s*boolean;\s*locked:\s*boolean;\s*opacity:\s*number' src/
# expected: 1 match (layers.ts:13 doc-comment only)

# 2) 테스트
npm test -- --run
# expected: 180 passed / 5 skipped

# 3) 빌드
npm run build
# expected: vite 26 modules + dist/index.d.ts emit OK

# 4) Cross-package
cd ../bms-electron-app
npm run type-check  # expected: 0 errors
npm run build       # expected: success

# 5) 베이스라인 비교
cd ../bms-editor
git checkout master && npm run type-check  # 동일 errors → PR 회귀 아님 확인
```

---

**최종 판정: PASS — 즉시 머지 권고. minor cleanup은 후속 PR로.**
