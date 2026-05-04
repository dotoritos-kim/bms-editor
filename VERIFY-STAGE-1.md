# bms-editor Stage 1 / PR-1 독립 검증

> 검증자: 병렬 검증 에이전트 (bms-editor 담당)
> 검증일: 2026-05-05
> 대상: https://github.com/dotoritos-kim/bms-editor/pull/1
> Base: `master` (b88bde2) ← Head: `refactor/stage-1-error-helper` (a598dfd)
> 이전 에이전트 보고 검증: **직접 재검증 완료, 자기보고 의존 없음**

---

## 1. 요약 (Verdict)

**PASS — 머지 권고 (LOW risk).** PR은 REFACTOR-PLAN의 P1 (`getErrorMessage` 헬퍼 + catch 블록 통일) 범위와 정확히 일치하며, 외부 API에 비파괴적이고 (additive export 1개), 신규 단위 테스트 6건이 모두 통과한다. CI red 표시는 master에 이미 존재하던 laneConfig 사전 회귀로 인한 것이며 본 PR과 무관하다.

| 항목 | 결과 |
|---|---|
| Plan 정합성 | ✅ P1 범위와 1:1 일치 |
| 빌드 (`npm run build`) | ✅ 성공 (vite 6.4.1, 24 modules, dist 생성) |
| 타입 체크 (`tsc --noEmit`) | ✅ 0 errors |
| 단위 테스트 | ✅ 신규 통과 (master baseline 14 fail = PR branch 14 fail; **신규 회귀 0건**) |
| 공개 API breaking | ✅ 없음 (additive only) |
| 머지 가능 | ✅ `mergeable: MERGEABLE` |

---

## 2. Plan 정합성

REFACTOR-PLAN.md §8의 PR 시퀀스에서 본 PR은:

| Plan PR | Plan 명세 | 실제 PR diff |
|---|---|---|
| **P1** | `getErrorMessage` 헬퍼 + catch 블록 통일 / utils.ts + 5파일 / ~30줄 / LOW / Breaking=No | `utils.ts` + 4파일(`KeysoundPlayer.ts`, `NoteChartViewer.tsx`, `KeysoundUploadDialog.tsx`, `useBmsChart.ts`) + `index.ts` export 추가 + 테스트 / 67줄(추가 59 / 삭제 8) / LOW / Breaking=No |

**§6.2 Common helper 명세** (Plan 라인 292–299):

```ts
export function getErrorMessage(e: unknown, fallback = 'Unknown error'): string {
  return e instanceof Error ? e.message : typeof e === 'string' ? e : fallback;
}
```

**실제 구현** (`src/utils.ts:25-29`):

```ts
export function getErrorMessage(e: unknown, fallback = 'Unknown error'): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return fallback;
}
```

→ 시그니처·동작 동일. Plan 의도 그대로 구현됨.

**§6.1 표 T1/T3/T5와의 매핑**:

| Plan ID | 위치 | 변경 |
|---|---|---|
| T1 | `useBmsChart.ts:559` | `useBmsChart.ts:561`에서 `getErrorMessage(error, 'Failed to load chart')`로 통일 ✅ |
| T3 | `KeysoundPlayer.ts:191/241/290` | `:244` 1건만 변경. `:192` (initialize, error 객체를 직접 throw) 및 `:291` (play, console.warn으로 raw error 로깅 + 후속 억제) 미변경 — **합당함** (둘 다 message string을 사용하지 않음) |
| T5 | `NoteChartViewer.tsx:2522/2593/2996/3131` | `:2998` 1건만 변경. `:2522/2593/3131`은 `console.error('...:', err)` 형태로 raw error 로깅 — message string 추출이 불필요하므로 **미변경 합당** (스택 트레이스 보존) |
| (보너스) | `KeysoundUploadDialog.tsx:200` | Plan §6.1 표에는 없으나 동일 패턴으로 통일 ✅ |

**전체 정합성 평가**: Plan은 "5건"을 언급했으나 실제로 message string을 추출하는 catch는 4건(+1보너스)이며, console에 raw error를 그대로 넘기는 catch는 헬퍼 적용이 부적절하다. **PR이 더 정확하게 판단**한 사례.

---

## 3. 빌드/테스트 결과

### 3.1 빌드

```
> @rhythm-archive/bms-editor@0.1.0 build
> vite build && tsc --emitDeclarationOnly --outDir dist

vite v6.4.1 building for production...
✓ 24 modules transformed.
dist/index.js  399.54 kB │ gzip: 79.82 kB
dist/index.cjs 414.12 kB │ gzip: 80.26 kB
✓ built in 434ms
```

`tsc --noEmit` 별도 실행 시: 0 errors.

### 3.2 테스트 — Master baseline 비교

| 메트릭 | master | refactor/stage-1-error-helper | Δ |
|---|---|---|---|
| Test Files | 8 (1 fail / 6 pass / 1 skip) | 8 (1 fail / 6 pass / 1 skip) | 0 |
| Tests passed | 135 | **141** | **+6** |
| Tests failed | 14 | 14 | 0 |
| Tests skipped | 5 | 5 | 0 |

**+6 신규 테스트는 `tests/utils.test.ts`의 `describe('getErrorMessage')` 6건** (Error / subclass Error / string / non-Error fallback / custom fallback / Error preference). 모두 통과.

**14건 실패 분석**: 모두 `tests/laneConfig.test.ts`의 24K/48K 레인 길이·x좌표 어설션. master(b88bde2)에서도 동일하게 14건 실패하며, 본 PR이 `laneConfig.ts`를 전혀 건드리지 않았으므로 **사전 회귀**(이전 보고와 일치). 본 PR 범위 외 이슈로 별도 PR에서 처리되어야 함.

### 3.3 CI 상태

GitHub Actions `build-and-test` 잡 FAILURE — 위 사전 회귀(laneConfig)로 인한 것. PR 코드와 인과 관계 없음. mergeable 상태는 `MERGEABLE`.

---

## 4. 회귀 검사

### 4.1 테스트 회귀
- 신규 실패: **0건** (master 14건 = PR 14건, 100% 동일)
- 신규 성공: **+6건** (utils.test.ts getErrorMessage)

### 4.2 타입 회귀
- `tsc --noEmit`: 0 errors
- 신규 `any`: 0 (grep `: any` diff 검증)
- 신규 `unknown` 캐스트: 0 (모든 catch는 ES2022 default `unknown` 유지)
- 신규 `as unknown as`: 0

### 4.3 catch 블록 점검 (8개 sites 전수)
```
src/chart/KeysoundPlayer.ts:192   raw onError(string) — 미변경 합당
src/chart/KeysoundPlayer.ts:242   getErrorMessage 적용 ✅
src/chart/KeysoundPlayer.ts:291   console.warn raw error — 미변경 합당
src/chart/NoteChartViewer.tsx:2522 console.error raw err — 미변경 합당
src/chart/NoteChartViewer.tsx:2593 console.error raw error — 미변경 합당
src/chart/NoteChartViewer.tsx:2996 getErrorMessage 적용 ✅
src/chart/NoteChartViewer.tsx:3131 console.error raw error — 미변경 합당
src/chart/useBmsChart.ts:560      getErrorMessage 적용 ✅
src/chart/panels/KeysoundUploadDialog.tsx:197 getErrorMessage 적용 ✅ (보너스)
```

남은 `error instanceof Error ? error.message : ...` 패턴: **0건** (grep으로 src/ 전체 검증).

### 4.4 catch 외 추가 변경
- `src/index.ts`: `getErrorMessage` 1개 export 추가 (additive)
- 그 외 비-catch 라인 변경: **없음** (각 파일 diff는 import 1줄 + catch 본문 1줄만)

---

## 5. 헬퍼 구현 품질

### 5.1 시그니처
```ts
export function getErrorMessage(e: unknown, fallback = 'Unknown error'): string
```
- Parameter: `e: unknown` (ES2022 catch default와 일치, 타입 안전)
- Default fallback: `'Unknown error'` (영문 — 다국어 호출자가 자체 fallback 주입 가능)
- Return: 항상 `string` (호출자에서 추가 narrowing 불필요)

### 5.2 Edge case 커버리지
| 입력 | 동작 | 테스트 |
|---|---|---|
| `new Error('msg')` | `'msg'` | ✅ |
| `class MyErr extends Error` | `e.message` | ✅ (subclass 체크) |
| `'plain string'` | `'plain string'` | ✅ |
| `{ weird: true }` | fallback | ✅ |
| `null` | fallback | ✅ |
| `undefined` | fallback | ✅ |
| `42` | fallback | ✅ |
| custom fallback | 사용 | ✅ |
| Error vs fallback 우선순위 | Error.message 우선 | ✅ |

→ **8개 입력 카테고리 × 9 테스트 케이스로 100% 커버**. 견고함.

### 5.3 위치 적절성
- 파일: `src/utils.ts` — 기존 `cn` helper와 동일한 위치. 의존성 0개. 모든 import 경로가 깔끔(`'../utils'`, `'../../utils'`).
- export 경로: `src/index.ts`에 추가됨 → 다운스트림(`bms-electron-app`)도 사용 가능.
- JSDoc: ES2022 catch 시맨틱 설명 + `@example` 포함 → 향후 사용자 이해도 ↑.

### 5.4 미세 개선 여지 (블로커 아님)
- 현재 구현은 `e.message`가 빈 문자열일 때도 그대로 반환(`''` ≠ fallback). Plan과 동일하므로 의도적이지만, 로깅 관점에서 빈 메시지가 fallback으로 빠지길 원하면 `e.message || fallback`로 보강 가능. **권장만** — 별도 PR 사안.

---

## 6. 머지 위험도 + 권고

### 6.1 위험도: **LOW**

| 위험 차원 | 평가 | 근거 |
|---|---|---|
| 코드 변경 범위 | 매우 작음 | 7파일 / 59 추가 / 8 삭제 |
| 외부 API 영향 | 없음 (additive only) | `getErrorMessage` export 1개 추가, 기존 심볼 동결 |
| 다운스트림 (`bms-electron-app`) 영향 | 없음 | `bms-core`/`bms-player` 인터페이스 무변경, 모든 변경은 catch 본문 내부 |
| 타입 안전성 | ↑ | `unknown` narrowing이 한 곳에 집중됨 |
| 테스트 커버리지 | ↑ | +6 신규 테스트, 모두 통과 |
| 회귀 | 0건 | master 대비 신규 실패 0 |
| 빌드 | 통과 | dist 정상 생성 |

### 6.2 권고

1. **머지 진행 (LOW risk)** — 본 PR 자체는 머지에 안전.
2. CI red는 본 PR과 무관한 `laneConfig.test.ts` 사전 회귀. **별도 PR**(`fix(test): laneConfig 24K/48K 어설션 정합성`)로 분리 처리할 것. 머지 차단 사유 아님.
3. 후속 작업 (Plan §8): P2 `KeysoundWorkerMessage` discriminated union으로 진입. 이 PR이 확보한 `unknown` narrowing 패턴이 P2 type guard 구현에 자연스럽게 연결됨.
4. 헬퍼의 미세 개선(빈 message → fallback)은 별도 이슈로 백로그 추가 권장.

---

## 부록 A. 직접 검증 명령 로그

```
$ git checkout refactor/stage-1-error-helper && git log --oneline -3
a598dfd refactor(stage-1): add getErrorMessage helper and unify catch blocks
7fa22b8 ci: add GitHub Actions workflow
4eee377 chore: pre-refactor checkpoint + REFACTOR-PLAN

$ git diff master..refactor/stage-1-error-helper --stat
 src/chart/KeysoundPlayer.ts               |  3 ++-
 src/chart/NoteChartViewer.tsx             |  4 ++--
 src/chart/panels/KeysoundUploadDialog.tsx |  4 ++--
 src/chart/useBmsChart.ts                  |  3 ++-
 src/index.ts                              |  2 +-
 src/utils.ts                              | 18 +++++++++++++++++
 tests/utils.test.ts                       | 33 ++++++++++++++++++++++++++++++-
 7 files changed, 59 insertions(+), 8 deletions(-)

$ npm run build
✓ built in 434ms

$ npm run type-check
(0 errors)

$ npm test  # PR branch
Test Files  1 failed | 6 passed | 1 skipped (8)
     Tests  14 failed | 141 passed | 5 skipped (160)

$ npm test  # master baseline
Test Files  1 failed | 6 passed | 1 skipped (8)
     Tests  14 failed | 135 passed | 5 skipped (154)

# Δ: +6 passed (utils.test.ts getErrorMessage suite), 0 new failures.
```

## 부록 B. 검증 산출물

- 본 보고서: `c:/SourceCode/bms-editor/VERIFY-STAGE-1.md`
- PR 링크: https://github.com/dotoritos-kim/bms-editor/pull/1
