# Spec: Delete five dead exports, and make the reducer's exhaustiveness a compile error

**ID:** 014-dead-code-removal
**Status:** IMPLEMENTED — `chore/dead-code-removal`, 5 commits, all gates green
**Created:** 2026-09-09
**Baseline:** `main` @ `9d18873` — 71 test files, **1417 tests, all green**, `typecheck` and `lint` clean
**Feature Type:** Refactor (subtractive). No new behaviour, no new data, no new dependency.
**Complexity:** Low. Five edits across four files, one of which is a type-level addition.
**Depends on:** nothing. 013 merged to `main` as #14 before execution — see *Branching*.
**Branch:** `chore/dead-code-removal`, cut from `main`.

---

## The ask

> Remove the dead code: `isSupported()`, `getCachedVoices()`, `useHasVoice()`,
> `isLowConfidence()` + `LOW_CONFIDENCE`, and the unreachable `default:` in `reduce`.
> Keep `RawRow.conf`. For the reducer, don't just delete the branch — replace it with
> `action satisfies never` so a future missing case becomes a compile error.

Both judgement calls in the brief are correct, and this spec adopts them. §*Verification* records
the evidence, including the one place the brief's cost estimate is optimistic.

---

## Verification — every claim in the brief, checked

`grep` over `src/`, `tests/`, `scripts/`, `index.html` and `README.md`, plus the `.claude/specs/`
history. Each symbol appears **only at its own definition**:

| # | Symbol | Site | References found elsewhere | Verdict |
|---|---|---|---|---|
| A1 | `isSupported()` | [tts.ts:24](src/speech/tts.ts#L24) | none | dead |
| A2 | `getCachedVoices()` | [tts.ts:61](src/speech/tts.ts#L61) | none | dead |
| A3 | `useHasVoice()` | [useVoices.ts:35](src/speech/useVoices.ts#L35) | none | dead |
| A4 | `isLowConfidence()` | [normalize.ts:44](src/parse/normalize.ts#L44) | none | dead |
| A4 | `LOW_CONFIDENCE` | [normalize.ts:4](src/parse/normalize.ts#L4) | only `isLowConfidence`, which also goes | dead |
| A5 | `default:` in `reduce` | [appMachine.ts:519](src/state/appMachine.ts#L519) | — | unreachable |

`src/speech/tts.test.ts:3` imports `hasVoiceFor, loadVoices, pickVoice, speak` — **not** the two
functions being deleted. `src/test/invariants.test.ts` globs every source file and makes positive
`export function …` assertions against several modules; **none of them names any of these five.**

**A5's unreachability, counted rather than assumed.** The `AppAction` union has **35** variants
([appMachine.ts:156-219](src/state/appMachine.ts#L156-L219)) and the switch has **35** `case`
clauses, each returning. The sets are identical, so `default:` cannot be entered.

### The one thing the brief under-costs (FR-3a)

A3 is not a clean three-line delete. `useVoices.ts` imports `LangCode` (line 2) and `hasVoiceFor`
(line 3) **solely** for `useHasVoice`. `tsconfig.app.json` sets `noUnusedLocals: true`, so removing
the function alone **fails `npm run typecheck`**. Both imports must go in the same edit. This is the
only place in the change where deleting one thing obliges you to touch another.

### A4's caveat, confirmed — and `conf` stays

`RawRow.conf` is genuinely live and has a stronger claim than the brief credits it with:
`stripUndefined`'s own doc comment **names it by name** as the motivating case —
"`exactOptionalPropertyTypes` means optional fields (RawRow.conf) legitimately arrive absent"
([firestoreListStore.ts:9-16](src/storage/firestoreListStore.ts#L9-L16)). It is also carried through
[normalize.ts:29](src/parse/normalize.ts#L29) and [ListEditor.tsx:209](src/components/ListEditor.tsx#L209),
and two tests pin the passthrough ([normalize.test.ts:57-65](src/parse/normalize.test.ts#L57-L65),
[textParse.test.ts:112](src/parse/textParse.test.ts#L112)).

Deleting `conf` would orphan a rationale another module depends on for its existence. **Keep it.**
Delete only the two flag helpers.

### A5's recommendation, verified empirically

Applied `action satisfies never` on a scratch copy and ran both gates:

- **Positive:** `npm run typecheck` clean, `npm run lint` clean (exit 0).
- **Negative:** adding one unhandled variant to `AppAction` produced
  `src/state/appMachine.ts(521,14): error TS1360: Type '{ type: "TOTALLY_NEW_ACTION"; }' does not satisfy the expected type 'never'.`

So the guard demonstrably fires. It is also the **only** form that works in this repo: the
conventional `const _exhaustive: never = action` would itself trip `noUnusedLocals: true`.
`satisfies` is type-only and fully erasable, so it satisfies `erasableSyntaxOnly: true` too.

---

## User story

> **As a** maintainer of this codebase
> **I want** the five unused exports gone and the reducer's exhaustiveness enforced by the compiler
> **So that** nobody spends time reading, testing, or preserving code that no caller reaches — and
> so the next `AppAction` cannot be added without handling it.

---

## Functional requirements

| ID | Requirement |
|---|---|
| **FR-1** | `isSupported()` is removed from `src/speech/tts.ts`. |
| **FR-2** | `getCachedVoices()` is removed from `src/speech/tts.ts`. The `cachedVoices` module variable **stays** — `loadVoices` writes it and `effectiveVoices` reads it. |
| **FR-3** | `useHasVoice()` is removed from `src/speech/useVoices.ts`. |
| **FR-3a** | The `LangCode` and `hasVoiceFor` imports in `useVoices.ts`, now unused, are removed in the same edit. `useVoices`, `VoicesState` and the `loadVoices` import are untouched. |
| **FR-4** | `isLowConfidence()` and `LOW_CONFIDENCE` are removed from `src/parse/normalize.ts`. |
| **FR-4a** | `RawRow.conf` and every site that carries it are **unchanged**, including its doc comment at [types.ts:11-15](src/parse/types.ts#L11-L15). |
| **FR-5** | `reduce`'s `default:` branch gains `action satisfies never` above its `return state`. The `return state` **stays** — this is a zero-runtime-change edit. |
| **FR-6** | `hasVoiceFor`, `pickVoice`, `speak`, `cancel`, `loadVoices`, `normalizeRows`, `isComplete` and `countComplete` all remain exported. Only the six named symbols go. |

## Non-functional requirements

| ID | Requirement |
|---|---|
| **NFR-1** | `npm run typecheck`, `npm run lint` and `npm test` all pass at every task boundary. |
| **NFR-2** | **No test assertion is added, changed or removed.** The suite ends at **1417 passing tests in 71 files** — the same count it starts at. A changed count means something behavioural moved. |
| **NFR-3** | No runtime behaviour changes. The only emitted-JS difference is the absence of three unreachable function bodies. |
| **NFR-4** | `npm run check:bundle` stays within budget (150 KB JS / 220 KB assets). It already will — these exports were tree-shaken out of `dist` — so this is a regression check, not a saving. |

---

## Out of scope

Named so they are decisions rather than oversights:

- **Deleting `RawRow.conf`.** Argued above (FR-4a). It is load-bearing for `stripUndefined`'s rationale.
- **Merging App.tsx's duplicate import.** [App.tsx:19](src/App.tsx#L19) and [App.tsx:21](src/App.tsx#L21) are two
  separate `import … from './speech/tts'` statements and could be one. Real, unrelated, and it would
  put a non-dead-code edit in a subtractive PR. Its own commit, another day.
- **Hunting for further dead code.** This spec covers the six symbols in the brief and nothing else.
- **Adding an `invariants.test.ts` guard for A5.** Unnecessary: `satisfies never` is a *compile-time*
  guard, which is strictly stronger than the source-grep tests that file uses.

---

## Deviations from the brief

Two, both minor, both surfaced rather than absorbed:

- **D-1 — "delete cleanly without opening a single test file" holds for assertions, not for prose.**
  Two test files carry *comments* that name `isLowConfidence` behaviour, and one of them is a test
  **name**: `it('never sets conf, so v1 rows are never flagged low-confidence')`
  ([textParse.test.ts:112](src/parse/textParse.test.ts#L112)), plus the comment at
  [normalize.test.ts:61-62](src/parse/normalize.test.ts#L61-L62). Both keep passing untouched — they
  assert on `conf`, which stays — but they reference a helper that will no longer exist.
  Isolated as **Task 5, optional**, so the delete stays assertion-neutral and a reviewer can see that.

- **D-2 — A3 costs two extra lines.** FR-3a above; `noUnusedLocals` makes it mandatory, not tidy-up.

---

## Branching

`chore/dead-code-removal`, cut from `main` @ `9d18873`.

**This changed between planning and execution.** When planned, `main` was `08ed383` and 013 was
unmerged on `feature/home-screen`; the plan therefore recorded that the brief's line numbers were
that branch's, and that `main`'s equivalents were `App.tsx:608` and `appMachine.ts:509`. 013 then
merged to `main` as **#14** (`9d18873`), so **the brief's line numbers are `main`'s numbers** —
`App.tsx:685` and `appMachine.ts:519` — and the two-branch discrepancy the plan warned about no
longer exists. Re-verified on `9d18873` before the first edit: all six symbols present and
unreferenced, 35 `AppAction` variants against 35 `case` clauses, 1417 tests green.

The observation that made this safe either way still holds: none of the four files carrying
deletions differed between `main` and `feature/home-screen`.

---

## Outcome

| | Planned | Actual |
|---|---|---|
| Commits | 5-6 (one per task) | **5** |
| Files touched | 4, or 5 with Task 5 | **6** — Task 5 hit *two* test files, not one (plan arithmetic slip) |
| Tests | 1417 / 71 files, unchanged | **1417 / 71 files** ✓ |
| `typecheck` / `lint` | clean | clean ✓ |
| `check:bundle` | within budget, no meaningful change | 88.6 KB JS / 166.5 KB total, both within budget ✓ |
| Net lines | subtractive | **+16 / −29** ✓ |

Task 5 was optional and was **done**. Both predicted failure modes were provoked deliberately
rather than assumed, and both behaved as the plan said:

- **R1** — deleting `useHasVoice` alone produced exactly two `TS6133` unused-import errors before
  the imports were repaired in the same commit.
- **FR-5** — injecting one unhandled `AppAction` variant produced
  `appMachine.ts(531,14): error TS1360`, on the `satisfies` line. Variant then removed and
  typecheck re-run clean.

The `+16` insertions are the `satisfies` line and its 10-line comment in `appMachine.ts`, plus the
two reworded comments from Task 5. No delete commit added a line.
