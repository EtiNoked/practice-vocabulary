# Tasks: 017-word-first-columns

**Baseline:** `main` @ `6db3b98`
**Branch:** `claude/word-first-columns`
**Total:** 11 tasks across 4 phases
**Legend:** `[P]` = parallelisable with its siblings · every task ends in a runnable VALIDATE

> **TDD is mandatory**, as in every spec before this one. Failing test (RED), minimal code (GREEN),
> refactor green.
>
> **Phase 1 is a pure refactor and must stay GREEN throughout.** It rebuilds the safety net before
> the net is needed. Do not start phase 2 until `npm run test` passes with phase 1 applied and
> **zero** production files modified.
>
> **Invariant for the whole feature:** nothing under `src/game/`, `src/state/`, `src/storage/`,
> `src/share/`, `src/speech/`, `src/lang/` is modified, and `StudyCard.tsx`, `TestCard.tsx`,
> `GameCloud.tsx`, `ReadyScreen.tsx`, `TestSetup.tsx`, `GameSetup.tsx`, `sortRows.ts` and
> `firestore.rules` are not modified. Task 11 proves it with `git diff --name-only`.
>
> **If `tests/rules/` or `npm run test:rules` needs any change, stop.** This feature touches no
> stored data; a rules failure means the flip has escaped the editor.

---

## Phase 1: Rebuild the safety net (Tasks 1-3)

*The suite must be green at the OLD order at the end of this phase. No production file is touched.*

### Task 1: REPLACE ordinal cell addressing in `ListEditor.test.tsx`
- **IMPLEMENT:** add the field-addressed helper beside the existing `cells()` at `ListEditor.test.tsx:21`:
  ```ts
  /**
   * One cell, named by the FIELD it writes rather than by where it sits.
   *
   * Addressing cells by DOM position is what made 017 risky: two JSX siblings swap and every
   * `cells()[n]` in the suite quietly comes to mean the other column. `data-cell` is the field,
   * and the field is the thing a test actually has an opinion about.
   */
  const cell = (row: number, field: 'col1' | 'col2'): HTMLInputElement => {
    const all = [...document.querySelectorAll<HTMLInputElement>(`[data-cell="${field}"]`)]
    const found = all[row]
    if (!found) throw new Error(`no ${field} cell in row ${row + 1}`)
    return found
  }
  ```
- **IMPLEMENT:** convert all **11** `cells()[n]` call sites. The arithmetic is `n = row * 2 + side`, where `side` is 0 for `col1` and 1 for `col2` **at the current order**: `cells()[0]` → `cell(0, 'col1')`, `cells()[1]` → `cell(0, 'col2')`, `cells()[3]` → `cell(1, 'col2')`.
- **KEEP** `cells()` itself. Two assertions legitimately care about the input *count* and not about any field: `toHaveLength(2)` (`:26`) and `cells().length).toBeGreaterThan(2)` (`:34`).
- **GOTCHA:** `cells()[3]` at `:449`, `:457` and `:458` is the site that would survive the phase-3 flip while asserting the opposite of its intent — it is row 2's `col2` today and row 2's `col1` after. Convert it deliberately and re-read the surrounding `it()` name to confirm which field it meant.
- **MUST NOT:** change a single assertion, `it()` name or fixture. This task is a pure substitution.
- **VALIDATE:** `npx vitest run src/components/ListEditor.test.tsx`

### Task 2: REPLACE ordinal cell addressing in `App.test.tsx` [P]
- **IMPLEMENT:** the same helper and the same substitution at the three `cells()` definitions (`App.test.tsx:49`, `:921`, `:1529`) and their **6** index call sites. Hoist one shared helper to module scope rather than defining it three times.
- **MUST NOT:** change an assertion. Same rule as Task 1.
- **VALIDATE:** `npx vitest run src/App.test.tsx`

### Task 3: VERIFY the net holds
- **IMPLEMENT:** nothing. This is a gate.
- **VALIDATE:** `git diff --name-only -- src | grep -v '\.test\.' ; echo "^ must be EMPTY"` then `npm run typecheck && npm run lint && npm run test`
- **GATE:** all green, and no non-test source file in the diff. Do not proceed otherwise.
- **COMMIT:** `test: address editor cells by field rather than by position`

---

## Phase 2: Pin the new order, in RED (Tasks 4-5)

*Every test added here must FAIL against the current code. A test that passes here is testing
nothing.*

### Task 4: WRITE the editor-order tests
- **RED FIRST** (`src/components/ListEditor.test.tsx`), a new `describe('column order')`:
  - the first `[data-cell]` input in row 1 carries `data-cell="col2"` — the word that gets spoken (FR1)
  - its `aria-label` is `Row 1 word`; the second is `Row 1 meaning` (FR2)
  - the header strip renders `Word — spoken aloud` before `Meaning — the answer` (FR3)
  - the badge on a Dutch/English list reads `Dutch → English 🔊`, not `English → Dutch` (FR4)
  - `getByLabelText('Word language')` has value `nl` and `getByLabelText('Meaning language')` has value `en` for a list stored `col1Lang: 'en', col2Lang: 'nl'` (FR5)
  - the word selector renders before the meaning selector in DOM order (FR5)
  - **end to end:** type into the left box, confirm, start a drill → the left box's text is what `speak` is called with (Story 1)
  - **existing list:** render in `update` mode with `initialRows: [{ col1: 'daughter', col2: 'dochter' }]` → the left box reads `dochter` (Story 2)
  - `Swap columns ⇄` still exchanges contents and languages together, asserted by field (FR12)
- **GOTCHA:** assert DOM order with `compareDocumentPosition` or by reading `[...container.querySelectorAll('[data-cell]')][0].dataset.cell`, never by re-introducing an ordinal `cells()[0]` — that is the habit this feature exists to break.
- **VALIDATE:** `npx vitest run src/components/ListEditor.test.tsx` — **expect failures**, and read each one to confirm it fails for the stated reason rather than a typo.

### Task 5: WRITE the ingest-order tests [P]
- **RED FIRST** (`src/parse/textParse.test.ts`): `parseDelimited('dochter\tdaughter', 'tab')` → `{ col2: 'dochter', col1: 'daughter' }`; a single-field line → `{ col2: 'hond', col1: '' }`; a quoted CSV line keeps everything after the first comma in `col1` (FR6).
- **RED FIRST** (`src/parse/languageDetect.test.ts`): `detectLanguages(parseDelimited('Dutch\\tEnglish\\ndochter\\tdaughter', 'tab'))` yields `col2Lang: 'nl', col1Lang: 'en'`, `source: 'header'`, `headerConsumed: true` (FR7). **Compose it through `parseDelimited`, never from a hand-built `{col1, col2}`** — a hand-built row cannot see a double flip (plan § *The double flip*).
- **RED FIRST** (`src/components/PastePanel.test.tsx`): pasting `dochter\tdaughter` and clicking **Add to list** hands `onAdd` a row whose `col2` is `dochter` (FR6 end to end); the placeholder shows the word first (FR9).
- **MUST NOT:** add a test to `sortRows.test.ts` or `duplicates.test.ts`. Those modules do not change, and a new test there would be asserting a behaviour this feature does not own.
- **VALIDATE:** `npx vitest run src/parse src/components/PastePanel.test.tsx` — **expect failures**.

---

## Phase 3: Flip (Tasks 6-8)

### Task 6: FLIP the editor row and its labels
- **IMPLEMENT** (`src/components/ListEditor.tsx`, `Row` at `:92-105`): move the `data-cell="col2"` input above the `data-cell="col1"` one. `aria-label` becomes `Row ${index + 1} word` on the `col2` input and `Row ${index + 1} meaning` on the `col1` one. **`data-cell` values are unchanged** (D-4).
- **IMPLEMENT:** header strip (`:373-379`) → `Word — spoken aloud` then `Meaning — the answer`.
- **IMPLEMENT:** badge (`:335`) → `{LANG_NAMES[effective.col2Lang]} → {LANG_NAMES[effective.col1Lang]} 🔊`.
- **IMPLEMENT:** selector loop (`:345-362`) → iterate `(['col2', 'col1'] as const)`, label `column === 'col2' ? 'Word language' : 'Meaning language'`, keep ids `lang-col2` / `lang-col1`, keep `chooseLang(column, …)` unchanged.
- **MUST NOT:** touch `handleSwap`, `handleSort`, `resolveLangs`, `handleChange` or `handleConfirm` bodies. Only JSX and label strings move in this task.
- **VALIDATE:** `npx vitest run src/components/ListEditor.test.tsx src/App.test.tsx`

### Task 7: FLIP `parseDelimited`
- **IMPLEMENT** (`src/parse/textParse.ts:151-163`): quoted branch → `{ col2: (quoted[0] ?? '').trim(), col1: quoted.slice(1).join(',').trim() }`; split branch → `{ col2: split[0].trim(), col1: split[1].trim() }`; fallback → `{ col2: line.trim(), col1: '' }`.
- **IMPLEMENT:** doc comment at `:146-150` — "a line that yields only one field becomes a row with an empty **meaning** cell".
- **WHY the fallback flips too:** a bare word list is a list of words, so the words belong in the word column, with the meaning cell left blank and flagged `Incomplete` (spec § Edge cases).
- **VALIDATE:** `npx vitest run src/parse/textParse.test.ts src/components/PastePanel.test.tsx`

### Task 8: FLIP the header-row mapping and the paste placeholder [P]
- **IMPLEMENT** (`src/parse/languageDetect.ts:160-176`): **rename the locals only** — `left`/`right` → `meaning`/`word`, keeping `meaning = matchHeaderCell(first.col1)` and `word = matchHeaderCell(first.col2)` exactly as they were.
- **DO NOT FLIP THIS.** It reads a ROW, not a screen: by the time a row arrives the first field is already in `col2`, put there by Task 7 or by the editor's first input. Flipping it cancels Task 7, and a `Dutch<TAB>English` header then labels the list backwards and reads every Dutch word in an English voice — **with the whole unit suite still green**, because every header test states its rows as `{col1, col2}` and cannot see two cancelling flips. This was got wrong on the first pass and caught only by opening the app (plan § *The double flip*).
- **MUST NOT:** touch `DEFAULT_DETECTION` (`:12-17`) or the joint-scoring block (`:176-205`). The default renders Dutch-first after the flip, which is correct; the heuristic scores field *content* and is position-independent. Changing either one reverses a correct behaviour.
- **IMPLEMENT** (`src/components/PastePanel.tsx:69`): placeholder → `'dochter\tdaughter\ndoodgaan\tto die'`.
- **VALIDATE:** `npx vitest run src/parse/languageDetect.test.ts src/components/PastePanel.test.tsx`

---

## Phase 4: Tell the truth, then prove the blast radius (Tasks 9-11)

### Task 9: UPDATE the comments that now read backwards [P]
- **IMPLEMENT** (`src/parse/types.ts`, `RawRow`): record that `col2` is the word — spoken, tested, rendered **first** — and `col1` is its meaning, rendered second; that the names are historical and no longer track position; and that 017 deliberately did not rename them (spec D-3).
- **IMPLEMENT** (`src/components/ListEditor.tsx`): `handleSwap` doc (`:221-227`); the `Sort A to Z` comment (`:411-414`) — it now sorts by the first column, which is the word read aloud.
- **IMPLEMENT** (`src/parse/duplicates.ts:4-17`): re-read it. Its rule — warn when the practised word repeats, stay quiet when the meaning does — is unchanged and still right. Reword "column 2" / "column 1" to "the word column" / "the meaning column" only if the numbers now mislead. **Do not change its code.**
- **CONSIDER, do not act:** `normalize.ts:3-5` claims column 2 holds whole sentences, which is now the other column. `cleanCell` is applied to both cells identically, so there is nothing to fix. Leave it and note it for `015-stale-comment-repair` (spec § Out of scope).
- **VALIDATE:** `npm run lint && npm run typecheck`

### Task 10: VERIFY the stored shape is untouched
- **IMPLEMENT:** nothing. This is the regression gate for D-1 and D-6.
- **VALIDATE:**
  ```bash
  git diff --name-only -- src/state src/storage src/share src/game src/speech src/lang firestore.rules
  # ^ must be EMPTY
  npm run test:rules
  ```
- **MANUAL:** build, open a list saved before the change, confirm the spoken word is on the left and the drill speaks it; confirm no write is made on open (Network tab, or re-check `updatedAt` is unchanged after opening and cancelling).
- **GATE:** an empty diff and green rules. A non-empty diff means the flip escaped the editor.

### Task 11: VERIFY the whole blast radius and ship
- **VALIDATE:**
  ```bash
  npm run typecheck && npm run lint && npm run test && npm run check:bundle
  git diff --name-only -- src | grep -v '\.test\.'
  # ^ expect EXACTLY: ListEditor.tsx  PastePanel.tsx  textParse.ts  languageDetect.ts  types.ts
  #   (duplicates.ts only if Task 9 reworded it)
  ```
- **MANUAL** (`npm run dev`): type a new list word-first and drill it; paste `dochter<TAB>daughter`; paste with a `Dutch<TAB>English` header row and check the Word language selector says Dutch; press **Sort A to Z** and confirm it sorts the first column; press **Swap columns ⇄** twice and confirm the rows and languages both return.
- **COMMIT:** `feat: the word you practise is the first column in the editor`

---

## Execution status

| Phase | Tasks | Status |
|---|---|---|
| 1 — Rebuild the safety net | 1-3 | **DONE** — `020dca4`, 17 ordinal sites converted, suite green at the old order |
| 2 — Pin the new order (RED) | 4-5 | **DONE** — 15 tests, all RED for the stated reason |
| 3 — Flip | 6-8 | **DONE** — Task 8 was got wrong first (plan § *The double flip*) and corrected |
| 4 — Comments and blast radius | 9-11 | **DONE** — 1606 unit + 153 rules green, manual pass in a real browser |

**Deviations from the plan, both deliberate:**

1. `normalize.ts:3-5` was listed Out of scope ("flagged for 015, not edited blind"). It was edited — not blind: `cleanCell` was read and confirmed to apply to both cells identically, and the comment now says so. Leaving it would have left a comment claiming the short word column holds sentences.
2. The `cell(row, field)` helper went to a shared `src/test/cells.ts` rather than being copied into each test file, so the reason it exists is written once.
