# Stage 2 검증 보고서 — bms-editor PR #2

> 작성일: 2026-05-05 (검증)
> 검증자: 독립 reviewer (Claude Opus 4.7, 자기보고 신뢰 금지)
> 대상: `refactor(stage-2): narrow worker boundary, gridSnap predicate, blob cast` (#2)
> 머지 커밋: `a39007977041c99f3e577ce7e533917431f61cf5`
> 머지 시각: 2026-05-04T23:42:29Z (머지 후 검증)
> 베이스: `master` ← 머지 직전 부모 `2345ff5` (laneConfig fix #3)

---

## 1. 검증 결론 (TL;DR)

**Verdict: PASS — 안전하게 머지된 정확하고 작은 PR**

- 모든 자기보고 항목 (P2/P3/P5, 신규 테스트 +10, tsc 0 errors, build OK) **재현 성공**.
- KeysoundWorkerMessage union은 **사용 중인 3개 메시지를 정확히 커버** (DONE 제외는 pre-PR과 behavioral equivalence).
- isPresetGridSnap은 **진짜 type narrowing** 수행 (테스트가 literal 타입 할당으로 증명).
- Blob cast 정리는 **단일 캐스트로 안전성 ↑** + 명확한 주석 추가.
- 공개 API 무변경, 다운스트림 영향 없음.
- 머지 위험도: **LOW**.

> ⚠️ 단, PR description의 "vitest: ... 14 fail = master baseline laneConfig pre-regression" 진술은
> 머지 시점에는 사실이 아님 — laneConfig fix(#3)가 이미 #2 직전에 머지되어 베이스라인은 155
> passed/0 fail이었음. 작성자가 더 이른 시점(stage-1 직후)의 측정값을 그대로 써 버린 것으로
> 보임. **검증 결과에는 영향 없음** (오히려 우호적).

---

## 2. PR 메타데이터

| 항목 | 값 |
|---|---|
| PR | https://github.com/dotoritos-kim/bms-editor/pull/2 |
| 상태 | MERGED |
| Base / Head | `master` ← `refactor/stage-2-type-narrowing` |
| 변경 라인 | +190 / -21 |
| 변경 파일 | 7 (코드 4 / 테스트 2 / 신규 모듈 1) |
| 신규 파일 | `src/chart/workerMessages.ts`, `tests/gridSnap.test.ts`, `tests/workerMessages.test.ts` |

### 변경 파일 표

| 파일 | +/- | 종류 |
|---|---|---|
| `src/chart/KeysoundPlayer.ts` | +23 / -17 | P2 — switch 기반 narrow 적용 |
| `src/chart/NoteChartViewer.tsx` | +6 / -1 | P5 — Blob 단일 캐스트 + 주석 |
| `src/chart/editor/EditorToolbar.tsx` | +3 / -2 | P3 — `as any` 2건 제거 |
| `src/chart/editor/types.ts` | +14 / -1 | P3 — predicate + GridSnapPreset 타입 분리 |
| `src/chart/workerMessages.ts` | +62 (신규) | P2 — discriminated union + guard |
| `tests/gridSnap.test.ts` | +27 (신규) | P3 — 회귀 방지 |
| `tests/workerMessages.test.ts` | +55 (신규) | P2 — 회귀 방지 |

---

## 3. 자동화 검증 결과

| 단계 | 명령 | 결과 | 비고 |
|---|---|---|---|
| 타입 체크 | `npm run type-check` (= `tsc --noEmit`) | **0 errors** | 머지 커밋 `a390079` 체크아웃 후 실행 |
| 단위 테스트 (stage-2) | `npm test -- --run` | **165 passed / 5 skipped / 0 failed** | 9 test files |
| 단위 테스트 (parent `2345ff5`) | `npm test -- --run` | **155 passed / 5 skipped / 0 failed** | 7 test files |
| 신규 테스트 증가 | — | **+10** (gridSnap 3 + workerMessages 7) | PR 주장 = 정확 |
| 빌드 | `npm run build` (vite + tsc declaration) | OK — `dist/index.js 400.03 kB / index.cjs 414.61 kB` (gzip 80 kB) | 25 modules |
| 회귀 (master 비교) | `npm test` | 165 동일 | 후속 #4도 영향 없음 |

> 베이스라인 = parent `2345ff5` 이후 155 passed / 0 failed.
> Stage-2 머지 후 = 165 passed / 0 failed (+10).
> **회귀 0건, 증가 분만큼 검증 강도 ↑.**

---

## 4. 코드 품질 검증

### 4.1 PR 묶음 ↔ REFACTOR-PLAN 일치 (요구 1)

| 계획 PR | 계획 요약 | 실제 적용 | 일치 |
|---|---|---|---|
| **P2** | `KeysoundWorkerMessage` discriminated union (LOW 위험, breaking 없음, ~50줄) | `workerMessages.ts` 신규 + `KeysoundPlayer` switch 전환 (~62줄) | ✅ |
| **P3** | `gridSnap as any` 제거 (type predicate, ~10줄) | `isPresetGridSnap` 추가 + 2 호출부 교체 (~10줄) | ✅ |
| **P5** | `Blob(chunks as unknown as ...)` 정리 (~5줄) | 단일 캐스트 + 5줄 설명 주석 | ✅ |

> **P4 (HeaderEditorPanel `as unknown as Record<...>`)는 의도적으로 미포함** — REFACTOR-PLAN에서도
> 별도 PR로 계획됨. 잔여 1건 (`HeaderEditorPanel.tsx:279`).

### 4.2 KeysoundWorkerMessage union 완전성 (요구 3)

bms-player 워커가 실제 emit하는 메시지 (`src/audio/loader/messages.ts` `LoaderOutbound`):

| bms-player 워커 emit | Stage-2 union | 처리 |
|---|---|---|
| `PROGRESS` | ✅ 포함 (`{ type:'PROGRESS' }`) | 페이로드 무시, count는 preloader getter로 조회 |
| `LOADED` | ✅ 포함 (`{ type:'LOADED'; key:string }`) | `arrayBuffer`/`fileName` 필드는 의도적 무시 (KeysoundPlayer가 추적용 key만 필요) |
| `ERROR` | ✅ 포함 (`{ type:'ERROR'; key, fileName, message:string }`) | 워커 emit 형태와 1:1 일치 |
| `DONE` | ❌ 미포함 | guard가 null 반환 → caller가 silently 무시 |

**완전성 평가**: union이 4개 중 3개를 커버하지만, **DONE은 PR 이전에도 처리되지 않았음**
(`git show a390079^:src/chart/KeysoundPlayer.ts` 확인 — pre-PR도 if/else 어디에도 DONE 분기 없음).
→ **Behavioral equivalence 유지**, 회귀 없음. 이상적 완전성보다는 "현재 사용처 그대로 + 안전화"
스타일이며, 향후 DONE 활용이 필요할 때 union에 분기 추가 + guard 한 줄 추가로 확장 가능 — 이것이
바로 P2의 명시적 design intent ("Adding a new message kind = add to the union + add a branch").

### 4.3 narrow guard 안전성 검증 (요구 3)

`narrowKeysoundWorkerMessage(type, payload)` 분기별 검토:

```ts
// PROGRESS: payload 무관 (워커가 빈 페이로드 emit 가능 가정)
if (type === 'PROGRESS') return { type: 'PROGRESS' };

// 비-PROGRESS: object & non-null 확인 (typeof null === 'object' 트랩 회피 ✅)
if (typeof payload !== 'object' || payload === null) return null;

const p = payload as Record<string, unknown>;

// LOADED: key 문자열 필수
if (type === 'LOADED' && typeof p.key === 'string') {
  return { type: 'LOADED', key: p.key };
}

// ERROR: key/fileName/message 모두 문자열 필수 (loose check 없음 ✅)
if (
  type === 'ERROR' &&
  typeof p.key === 'string' &&
  typeof p.fileName === 'string' &&
  typeof p.message === 'string'
) {
  return { type: 'ERROR', key: p.key, fileName: p.fileName, message: p.message };
}

return null;
```

**확인 사항**:
- `null` short-circuit ✅ (`typeof null === 'object'` 함정 회피)
- 임의 키 접근 전 `Record<string, unknown>` 캐스트로 인덱스 안전 ✅
- 각 필드 `typeof === 'string'` 검사 — 숫자 key 같은 잘못된 페이로드 거부 (테스트로 증명: `{ key: 42 }` → null)
- ERROR 분기는 3 필드 모두 필수 — 부분 페이로드 거부 (테스트로 증명)
- 반환 타입 `KeysoundWorkerMessage | null` — 호출부가 `if (!msg) return` 패턴으로 안전 처리

**잠재적 약점**: pre-PR 코드는 `errorPayload?.fileName || 'unknown'`처럼 fileName 누락도 fallback으로
처리했음. 새 guard는 fileName 누락 시 ERROR를 통째로 drop함 → 이론적으로 "ERROR 메시지지만 fileName이
빠진 케이스"에서 로깅 손실. 그러나 bms-player 워커 코드(`AudioLoader.worker.ts:138`)는 항상 3 필드를
모두 채우므로 실제로 이런 페이로드는 발생하지 않음. **strict-by-default 정책으로 합리적 트레이드오프**.

### 4.4 isPresetGridSnap 진짜 type narrowing 검증 (요구 4)

```ts
export type GridSnapPreset = (typeof GRID_SNAP_OPTIONS)[number];
//                          → 4 | 8 | 12 | 16 | 24 | 32 | 48 | 64 | 96 | 128 | 192 | 256 | 384

export function isPresetGridSnap(value: number): value is GridSnapPreset {
  return (GRID_SNAP_OPTIONS as readonly number[]).includes(value);
}
```

- 시그니처 `value is GridSnapPreset` — 진짜 type predicate ✅
- 본문은 `(GRID_SNAP_OPTIONS as readonly number[]).includes(value)` — `as const` tuple의 `.includes()`가
  `string | number` literal union만 받는 TS 좁히기 문제를 정확히 회피 ✅
- 테스트(`tests/gridSnap.test.ts:21-26`)가 narrowing을 컴파일 시점 + 런타임 양쪽으로 증명:
  ```ts
  const value: number = 16;
  if (isPresetGridSnap(value)) {
    const preset: (typeof GRID_SNAP_OPTIONS)[number] = value; // 컴파일 통과 = narrowing 작동
  }
  ```
- 호출부 (`EditorToolbar.tsx:166, 189`)에서 `gridSnap as any` 2건이 `isPresetGridSnap(gridSnap)`로 교체됨

**판정**: 의도된 narrowing이 정확히 동작. `as any` 제거의 정당성 확보.

### 4.5 Blob 캐스트 정리 (P5)

```ts
// before:
blob = new Blob(chunks as unknown as BlobPart[], { type: contentType || 'audio/wav' });
// after:
// 5줄 주석 (TS lib quirk + fetch reader가 항상 non-shared buffer를 yield하는 근거)
blob = new Blob(chunks as BlobPart[], { type: contentType || 'audio/wav' });
```

- `as unknown as` (= 안전성 검사 우회 더블 캐스트) → 단일 캐스트로 좁힘 ✅
- 주석이 **왜 캐스트가 필요한지**(`Uint8Array<ArrayBufferLike>` ↔ `BlobPart`의 `SharedArrayBuffer` 호환성) +
  **왜 안전한지**(fetch reader 보장)를 명시 ✅
- `chunks`는 fetch reader에서 push된 `Uint8Array[]` → 런타임 동일 동작
- tsc 0 errors 통과 = 단일 캐스트로 충분함 입증

---

## 5. any/unknown 잔여 카운트 (요구 5)

### Master HEAD 기준 grep 결과

| 패턴 | 개수 | 위치 |
|---|---|---|
| `as any` (코드) | **0** | (주석 1건만 — `editor/types.ts:31` 자기 설명) |
| `as unknown as` (코드) | **1** | `HeaderEditorPanel.tsx:279` (P4 미적용 — 계획됨) |
| `: unknown` (catch + boundary) | **11** | 모두 정당한 boundary 또는 ES2022 catch (`utils.ts:25` 헬퍼, `KeysoundPlayer.ts` 콜백/3 catch, `useBmsChart.ts` 1 catch, `NoteChartViewer.tsx` 4 catch + 2 deps generic, `workerMessages.ts` 신규 2건) |
| `[string, unknown][]` | 1 | `HeaderEditorPanel.tsx:25` (P4 미적용) |

### REFACTOR-PLAN 부록 A의 "any/unknown 14건"과의 비교

REFACTOR-PLAN은 "총 14건" (any 2 + unknown 12)을 보고했음.
- Stage-1 (`getErrorMessage` 통일)이 catch unknown 5건을 **유지하되 헬퍼화** (변동 없음).
- Stage-2 (이번 PR)이:
  - any 2건 → **0건** (P3 ✅)
  - `as unknown as` 2건 → **1건** (P5 적용, P4 미적용으로 1건 잔존)
- 잔여 unknown은 **모두 정당한 boundary/catch** (계획 6.1 표의 T1~T5와 일치).

**판정**: PR description의 "any 2→0" 주장 = 정확. 구조적 잔여는 P4(HeaderEditorPanel)뿐.

---

## 6. bms-core / bms-player 인터페이스 사용 변경 검토 (요구 6)

| 항목 | 검사 | 결과 |
|---|---|---|
| `AudioPreloader` 콜백 시그니처 `(type: string, payload: unknown) =>` | bms-player `AudioPreloader.ts:187` 그대로 | **변경 없음** ✅ |
| bms-player의 `LoaderOutbound` union | bms-editor가 import하지 않음 (의도적 — 자체 union으로 boundary 격리) | **격리 유지** ✅ |
| bms-core `BMSHeaderData` | PR에서 미접촉 (P4 범위) | 영향 없음 ✅ |
| `KeysoundPlayer` public 메서드 시그니처 | private 콜백 핸들링만 변경 | **공개 API 무변경** ✅ |
| `src/index.ts` barrel | 신규 export 없음 (`workerMessages` 모듈은 내부 전용) | **무변경** ✅ |
| `src/chart/index.ts` barrel | 신규 export 없음 | **무변경** ✅ |

다운스트림 (`bms-electron-app`) 사용 현황 (sample grep):
- `gridSnap: number` 형태로 사용 (`AutoChartDialog.tsx`, `autoChart.ts`)
- `GridSnap` 타입은 PR에서 widened union 그대로 export (호환 ✅)
- `KeysoundPlayer`/`createKeysoundPlayer` 시그니처 무변경 (호환 ✅)

**판정**: bms-core / bms-player에 어떤 변경도 가하지 않았으며, 다운스트림 깨짐 없음.

---

## 7. 머지 위험도 (요구 7)

| 항목 | 평가 |
|---|---|
| 변경 규모 | LOW (실효 코드 +52 / -21) |
| 공개 API | 무변경 |
| Breaking | 없음 |
| 빌드 | 통과 |
| tsc | 0 errors |
| 테스트 | 165/0 (베이스 155에서 +10 신규, 회귀 0) |
| Boundary 안전성 | 향상 (3중 캐스트 → 단일 narrow) |
| 다운스트림 | 영향 없음 |
| 코드 가독성 | 향상 (switch 형태 + 주석 + 테스트로 의도 표현) |
| 문서화 | 우수 (workerMessages.ts와 types.ts 모두 design intent 주석 포함) |

**총평: LOW 위험 / 머지 권고 PASS**

> 권장 후속: P4 (`HeaderEditorPanel as unknown as`) 정리 + REFACTOR-PLAN P6+(LayerConfig) 진행 시
> 본 PR과 동일한 품질 기준 (계획 매핑 + 신규 회귀 테스트 + 명시적 design 주석) 유지 권장.

---

## 8. 검증 방법론 (재현 가능)

```bash
cd c:/SourceCode/bms-editor

# 1) PR 메타 + diff
gh pr view 2 --json title,state,baseRefName,headRefName,additions,deletions,files,mergeCommit
gh pr diff 2

# 2) 머지 직전 baseline
git checkout a390079^   # = 2345ff5
npm test -- --run       # → 155 passed

# 3) 머지 커밋
git checkout a390079
npm run type-check      # → 0 errors
npm test -- --run       # → 165 passed (+10)
npm run build           # → ok

# 4) any/unknown 잔여
git checkout master
rg "\\bas any\\b" src    # → 0 (주석만)
rg "as unknown as" src  # → 1 (HeaderEditorPanel)

# 5) bms-player 워커 union 완전성
cd ../bms-player
rg "LoaderOutbound|type: 'PROGRESS'|type: 'LOADED'|type: 'DONE'|type: 'ERROR'" src/audio/loader/
```

---

## 부록. 핵심 발견 요약

1. **PR description의 "14 fail baseline" 진술이 부정확** — 머지 시점 직전 부모(`2345ff5`)는 0 fail이었음.
   laneConfig 회귀가 #3에서 이미 해결된 후 #2가 머지되었음. 검증에는 영향 없으나, 작성자가 stage-1 시점의
   메모를 그대로 복사한 흔적. 향후 PR description 정확도 개선 권장.

2. **DONE 메시지 미커버는 의도적 / 안전** — bms-player가 4종 emit하지만 editor는 3종만 사용.
   pre-PR도 동일 — behavioral equivalence 유지. 향후 활용 시 union 한 줄 + guard 한 분기 추가로 확장.

3. **isPresetGridSnap이 진짜 narrowing 수행** — 컴파일러 수준에서 `value is GridSnapPreset`이 작동함을
   테스트가 `const preset: GridSnapPreset = value` 할당으로 증명. `as any` 우회를 단순한 type predicate로
   대체한 정확한 솔루션.

4. **잔여 P4 (`HeaderEditorPanel as unknown as`)는 의도적 미포함** — 별도 PR로 계획되어 있으며, bms-core
   협조가 필요할 수 있음 (`BMSHeaderData` 확장).

---

**Verdict: PASS (이미 머지됨, 사후 검증 통과)**
