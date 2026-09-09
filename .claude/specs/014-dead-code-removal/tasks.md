# Tasks: 014-dead-code-removal

**Baseline:** `main` @ `08ed383` — **1417 tests across 71 files, all green**; `typecheck` + `lint` clean
**Branch:** `chore/dead-code-removal`, cut from `main` (see spec § *Branching*)
**Total:** 6 tasks — 4 deletions, 1 optional prose fix, 1 final gate
**Legend:** `[P]` = parallelisable with its siblings · every task ends in a runnable VALIDATE

> **No TDD here — there is no new behaviour to drive.** The inverse discipline applies instead:
> **no test file is edited in Tasks 1-4, and the test count must not move.** 1417 before, 1417
> after. A different number is a regression wearing a green tick.
>
> **One commit per task.** Each is independently revertible, which is the whole point of splitting
> six one-line deletions across four commits.
>
> **The keep-list is as important as the delete-list.** `hasVoiceFor` (kept) sits one line from
> `useHasVoice` (deleted) and is used by `App.tsx`. Read plan § A and § B before touching `src/speech/`.

---

## Phase 1 — Deletions (Tasks 1-3, all `[P]`)

### Task 1: DELETE two exports from `src/speech/tts.ts` [P]
- **IMPLEMENT:** `plan.md` § A — remove `isSupported()` (lines 23-26) and `getCachedVoices()`
  (lines 60-63), each with its doc comment. Satisfies **FR-1, FR-2**.
- **KEEP:** `let cachedVoices` (line 17), `synth()` (lines 19-21), the 13-line module header
  (lines 3-15), and every other export — `loadVoices`, `pickVoice`, `hasVoiceFor`, `cancel`, `speak`.
- **GOTCHA:** `cachedVoices` looks orphaned once its only *getter* goes. It is not — `loadVoices`
  writes it at lines 40 and 51, `effectiveVoices()` reads it at line 73. Deleting it makes every
  default-argument call site (`speak`, `pickVoice`, `hasVoiceFor`) silently lose Chrome's cached
  voice list, which is the exact bug the module header's item 1 exists to prevent.
- **GOTCHA:** Do not touch the header comment. Its three workarounds are all about `getVoices()`
  timing, queue cancellation and iOS gestures — none about capability detection.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/speech/tts.test.ts
  ```

### Task 2: DELETE `useHasVoice` from `src/speech/useVoices.ts` [P]
- **IMPLEMENT:** `plan.md` § B — remove `useHasVoice()` and its doc comment (lines 34-38), **and**
  drop the two imports it strands: `LangCode` (line 2) and `hasVoiceFor` (line 3). The import
  becomes `import { loadVoices } from './tts'`. Satisfies **FR-3, FR-3a**.
- **KEEP:** `useVoices()`, the `VoicesState` interface, and the `loadVoices` import.
- **GOTCHA — this is the one task in the change that is not a pure delete.** `noUnusedLocals: true`
  means removing the function *alone* fails `npm run typecheck` with two unused-import errors.
  Both edits are one task because neither compiles without the other (plan **R1**).
- **GOTCHA:** Delete `useHasVoice`, **not** `hasVoiceFor`. `hasVoiceFor` lives in `tts.ts`, stays
  exported, and is used by [App.tsx:608](src/App.tsx#L608) plus four assertions in `tts.test.ts`
  (plan **R3**). This task removes `useVoices.ts`'s *import* of it, nothing more.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/speech/tts.test.ts src/App.test.tsx
  ```

### Task 3: DELETE the two confidence flags from `src/parse/normalize.ts` [P]
- **IMPLEMENT:** `plan.md` § C — remove `LOW_CONFIDENCE` (lines 3-4) and `isLowConfidence()`
  (lines 43-46), each with its doc comment. Satisfies **FR-4**.
- **KEEP:** the `RawRow` type import (line 1), `EDGE_ARTIFACTS`, `cleanCell`, `normalizeRows`,
  `isComplete`, `countComplete`.
- **GOTCHA — do not follow the thread to `RawRow.conf`.** After this task nothing *consumes* a
  `conf` value; it is pure passthrough, and it will read as the next obvious deletion. It is not.
  `stripUndefined` names `RawRow.conf` in its own doc comment as the reason it exists
  ([firestoreListStore.ts:9-16](src/storage/firestoreListStore.ts#L9-L16)), and two tests pin the
  passthrough. **FR-4a**, plan **R2**.
- **GOTCHA:** `normalizeRows`'s line 29 conditional spread is not dead either — it is what keeps
  `conf` absent rather than `undefined` under `exactOptionalPropertyTypes`, and
  [normalize.test.ts:63-65](src/parse/normalize.test.ts#L63-L65) asserts exactly that.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/parse/normalize.test.ts src/parse/textParse.test.ts
  ```

---

## Phase 2 — The compile-time guard (Task 4)

### Task 4: REPLACE the unreachable `default:` in `src/state/appMachine.ts`
- **IMPLEMENT:** `plan.md` § D — insert `action satisfies never` above `return state` in the
  `default:` branch (`main`: line ~509). Satisfies **FR-5**.
- **KEEP `return state`.** This edit must be a zero-runtime-change edit; `satisfies` erases to
  nothing and leaves `action;`. Removing the `return` would also discard the reducer's documented
  "an illegal transition is a no-op rather than a corrupt state" contract (plan **R4**).
- **GOTCHA:** Not `const _exhaustive: never = action` — that declares a local nothing reads and
  trips `noUnusedLocals: true`. `satisfies` binds nothing. It is also erasable, so
  `erasableSyntaxOnly: true` is satisfied.
- **VERIFY THE GUARD ACTUALLY FIRES** — a guard nobody has seen fail is not yet a guard. Temporarily
  add `| { type: 'TMP_UNHANDLED' }` to `AppAction`, run `npm run typecheck`, and confirm:
  ```
  error TS1360: Type '{ type: "TMP_UNHANDLED"; }' does not satisfy the expected type 'never'.
  ```
  pointing at the `satisfies` line. **Then remove the temporary variant** and re-run typecheck
  clean. Do not commit the variant.
- **VALIDATE:**
  ```bash
  npm run typecheck && npm run lint && npx vitest run src/state/appMachine.test.ts
  ```

---

## Phase 3 — Prose and final gate (Tasks 5-6)

### Task 5 *(OPTIONAL)*: refresh two stale test comments
- **IMPLEMENT:** `plan.md` § E — spec **D-1**. Two comments name the helper Task 3 deleted:
  - [normalize.test.ts:61-62](src/parse/normalize.test.ts#L61-L62) — reword to describe the `conf`
    field's absence rather than "low-confidence" flagging.
  - [textParse.test.ts:112](src/parse/textParse.test.ts#L112) — the test **name** ends
    "…so v1 rows are never flagged low-confidence". Drop that clause.
- **CONSTRAINT:** **comments and test names only.** Not one `expect` may change. Both tests pass
  before and after Task 3 regardless — they assert on `conf`, which stays.
- **WHY IT IS LAST AND OPTIONAL:** it is the only task that opens a test file. Keeping it in its own
  commit is what lets a reviewer confirm Tasks 1-4 touched no test at all.
- **VALIDATE:**
  ```bash
  npx vitest run src/parse/normalize.test.ts src/parse/textParse.test.ts
  ```

### Task 6: full gate
- **IMPLEMENT:** nothing. Run every gate and check the count.
- **VALIDATE:**
  ```bash
  npm run typecheck && npm run lint && npm test && npm run check:bundle
  ```
- **ACCEPTANCE:**
  - `npm test` reports **71 test files, 1417 tests, all passed** — the baseline number, unchanged (**NFR-2**).
  - `typecheck` and `lint` clean (**NFR-1**).
  - `check:bundle` within 150 KB JS / 220 KB assets (**NFR-4**). Expect **no meaningful change** —
    these exports were already tree-shaken out of `dist`, so this is a regression check, not a saving.
  - `git diff --stat main` touches exactly **4 files**, or **6** with Task 5 (it edits *two* test
    files — `normalize.test.ts` and `textParse.test.ts`). No delete commit adds a line; the only
    insertions are `appMachine.ts`'s guard and Task 5's reworded prose.
- **GOTCHA:** A test count *below* 1417 means a file stopped loading — most likely an import that
  Tasks 1-3 removed was still being resolved somewhere. Above 1417 means a test was added, which
  nothing here calls for. Either way, stop and read the diff.
- **NOT REQUIRED:** `npm run test:rules`. It needs the Firestore emulator and a JRE, and nothing
  here touches `firestore.rules` or any storage adapter.

---

## Task → requirement map

| Task | File | Requirements | Test files edited |
|---|---|---|---|
| 1 | `src/speech/tts.ts` | FR-1, FR-2, FR-6 | none |
| 2 | `src/speech/useVoices.ts` | FR-3, FR-3a | none |
| 3 | `src/parse/normalize.ts` | FR-4, FR-4a | none |
| 4 | `src/state/appMachine.ts` | FR-5 | none |
| 5 *(opt)* | 2 test files | D-1 | comments + 1 name only |
| 6 | — | NFR-1 … NFR-4 | none |
