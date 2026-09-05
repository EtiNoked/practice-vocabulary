# Tasks: Multi-Language Lists (Dutch↔French and beyond)

**Feature ID:** 004-multi-language-lists
**Total:** 14 tasks across 5 phases
**Legend:** `[P]` = parallelisable with siblings · every task ends with a runnable VALIDATE

> **TDD is mandatory**, as in 001–003: failing test (RED), minimal code (GREEN), refactor green.
> **Baseline before starting: 241 tests across 18 files, all passing.**

> **Ship order matters.** Phase 2 alone makes Dutch/French work with a header row and is
> independently releasable. Phase 3 is what makes a wrong guess impossible rather than rarer.
> Do not start Phase 3 before Phase 2 is green — both touch `LangSource` and `ListEditor`.

---

## Phase 1 — Open the language table (Tasks 1–3)

### Task 1: RESTRUCTURE `src/lang/languages.ts` into per-language profiles
- **IMPLEMENT:** Add `'fr'` to `LangCode` and `LANG_CODES`. Add `BCP47.fr = 'fr-FR'` and
  `LANG_NAMES.fr = 'French'`. Introduce `LangProfile` and `PROFILES: Record<LangCode, LangProfile>`,
  folding the existing `MARKER_WORDS`, `DUTCH_DIGRAPHS` and `DUTCH_SUFFIXES` into the `en` and `nl`
  entries **verbatim** — same words, same order. Delete the three old exports.
- **IMPLEMENT:** The `fr` profile from `plan.md` § A2.
- **WHY:** Three top-level Dutch-named constants beside a general table is a shape that only works
  for two languages. Adding French next to them would cement it (`plan.md` § Pragmatic review).
- **GOTCHA:** Do not change any existing English or Dutch word while moving it. Restructuring and
  retuning at once makes a detection regression impossible to attribute (`plan.md` § Risks).
- **GOTCHA:** `en` has no `digraphs` and no `suffixes` today. Give it empty arrays rather than making
  the fields optional — an optional field means every consumer needs a `?? []`.
- **GOTCHA:** Deleting the old exports breaks `languageDetect.ts` immediately. Expected; Task 4 fixes
  it. `npm run typecheck` should fail with **only** unresolved-import errors.
- **VALIDATE:** `npm run typecheck` fails only on `languageDetect.ts` imports, no other category.

### Task 2: ADD `HEADER_ALIASES.fr` [P]
- **IMPLEMENT:** `fr: ['french', 'frans', 'francais', 'franais', 'fr']`.
- **GOTCHA:** `franais` is not a typo. `matchHeaderCell` strips everything outside `a-z`
  (`languageDetect.ts:57`), so a user typing `français` arrives as `franais`. Both spellings are
  needed because `francais` (no cedilla) is also common. Comment this in the source or the next
  person will "fix" it.
- **GOTCHA:** `fr` is two characters, so `tolerance()` (`languageDetect.ts:49`) requires an exact
  match. Correct — a budget of 1 would let `fr` match `er`, `or` and `de`. Do not widen it.
- **VALIDATE:** covered by Task 3's suite.

### Task 3: CREATE `src/lang/languages.test.ts` — the profile-integrity suite
- **TEST FIRST:** this task *is* the test.
  1. Every `LANG_CODES` member has an entry in `BCP47`, `LANG_NAMES`, `HEADER_ALIASES` and
     `PROFILES` — and none of those records has a key that is not in `LANG_CODES` (FR-5).
  2. Every `BCP47` value parses as `xx-YY` and its prefix equals the `LangCode`.
  3. `EXCLUSIVE_MARKERS` sets are pairwise disjoint (FR-9).
  4. `de` appears in at least two `PROFILES` and therefore in **no** `EXCLUSIVE_MARKERS` set — the
     named regression case.
  5. No header alias resolves to two different languages under `levenshtein <= tolerance`.
- **IMPLEMENT:** `EXCLUSIVE_MARKERS` in `languages.ts`, derived from `PROFILES` at module load
  (`plan.md` § A3).
- **WHY:** This suite is what makes "adding a language is a data change" true rather than aspirational.
  Assertion 5 is the one that will actually fire one day — `Duits`/`Deutsch` against `dutch` is a
  close call waiting to happen.
- **GOTCHA:** Assertion 1 must check **both directions**. A one-directional check passes when a
  record has a stale extra key, which is exactly the drift this file exists to prevent.
- **VALIDATE:** `npm test -- languages`

---

## Phase 2 — Generalise detection (Tasks 4–7)

### Task 4: PORT `languageDetect` to `PROFILES`, no behaviour change
- **TEST FIRST:** run the **existing** `src/parse/languageDetect.test.ts` unchanged. It is red only
  because of the deleted imports.
- **IMPLEMENT:** Replace `dutchness()` with `profileScore(text, lang)` per `plan.md` § B1 — marker
  +3 (exclusive markers only), digraph +1, suffix +0.5, divided by token count. Keep
  `detectLanguages` binary for now: `profileScore(col, 'nl') - profileScore(col, 'en')` reproduces
  the old scalar exactly.
- **WHY:** A green run here proves the scoring rewrite changed nothing, so any later failure belongs
  to Task 5's algorithm and not to the data move.
- **GOTCHA:** Do **not** edit an existing assertion to make it pass. An English/Dutch expectation
  that no longer holds is a regression (`plan.md` § Risks).
- **GOTCHA:** The old code subtracted English markers inside the Dutch score. Reproducing that as a
  difference of two independent scores is equivalent **only** because `en` has no digraphs or
  suffixes. Verify that before assuming it.
- **VALIDATE:** `npm test -- languageDetect` — all existing assertions green, none edited.

### Task 5: IMPLEMENT n-way distinct-pair detection
- **TEST FIRST:** extend `languageDetect.test.ts`:
  - A Dutch/French body with no header resolves `nl` / `fr` — **the regression test for D-1**, which
    returns `nl`/`en` today.
  - A French/Dutch body resolves `fr` / `nl`, proving the result is not positional.
  - Ambiguous input (`nation / nation`, `train / train`) returns `source: 'default'`, not a guess.
  - The result is never two of the same language, for any input.
- **IMPLEMENT:** `plan.md` § B2 — build every ordered pair of distinct languages, score jointly,
  sort, apply `MARGIN`. Export `MARGIN`.
- **WHY:** This is the defect. Until this lands there is no code path that can return `'fr'` from the
  heuristic, so a French column is spoken with an English voice (`spec.md` § D-1).
- **GOTCHA:** Score **jointly**, not per column independently. Independent argmax can return
  `fr`/`fr` for a list where both columns look vaguely French; the pairwise form cannot.
- **GOTCHA:** Compare the winner against the best **distinct-pair** runner-up, not against the
  second-best entry overall. `{nl,fr}` and `{fr,nl}` are different assignments of the same two
  languages and one of them is always the runner-up, which would make `MARGIN` unreachable.
- **GOTCHA:** Record the observed score gaps for the real fixtures in a comment. `MARGIN` picked from
  measured numbers is defensible; picked to make one test pass, it is a magic constant.
- **VALIDATE:** `npm test -- languageDetect`

### Task 6: GENERALISE `matchHeaderCell` and `DEFAULT_DETECTION` [P]
- **TEST FIRST:** a `Nederlands / Frans` header resolves `nl` / `fr` with `source: 'header'` and
  `headerConsumed: true`; a `Frans / Engels` header resolves `fr` / `en`.
- **IMPLEMENT:** Iterate `LANG_CODES` instead of the literal `['en', 'nl']` (`languageDetect.ts:59`).
  Leave `DEFAULT_DETECTION` as `en` → `nl` (FR-11) but note in a comment that it is the commonest
  case, not a structural assumption.
- **GOTCHA:** The "both cells must name a language and they must disagree" guard
  (`languageDetect.ts:108`) is still exactly right with three languages. Do not touch it.
- **VALIDATE:** `npm test -- languageDetect`

### Task 7: ADD French fixtures to `src/test/fixtures/text.ts` [P]
- **IMPLEMENT:** `NL_FR_WITH_HEADER` (`Nederlands\tFrans`), `NL_FR_NO_HEADER`, and
  `FR_FIRST_NO_HEADER`. Use real school vocabulary with the accent distribution of actual French —
  `l'été`, `la fenêtre`, `le garçon`, `déjà`.
- **GOTCHA:** Include at least one accent-free French row (`la table / de tafel`). A fixture that is
  all accents proves only that the accent rule works, and the accent rule is the easy half.
- **GOTCHA:** Mirror the existing fixtures' shape and comments (`text.ts:73`) so the file stays one
  consistent document.
- **VALIDATE:** `npm test -- languageDetect textParse`

---

## Phase 3 — Explicit selectors (Tasks 8–11)

### Task 8: EXTEND `LangSource` with `'manual'`
- **IMPLEMENT:** `src/parse/types.ts` — add `| 'manual'` to `LangSource`, documenting that it
  outranks detection and is never produced by `detectLanguages`.
- **GOTCHA:** No storage migration. `langSource` is persisted as a free string and never validated,
  so old lists carrying the three existing values keep loading (`plan.md` § C1).
- **VALIDATE:** `npm run typecheck` — passes, since every `switch` on `LangSource` is a boolean check
  today. If the compiler reports a non-exhaustive match, that is a real site to fix, not noise.

### Task 9: ADD the two selectors to `ListEditor`
- **TEST FIRST:** `src/components/ListEditor.test.tsx` —
  - Both selects render, one option per `LANG_CODES` entry, labelled with `LANG_NAMES`.
  - They are prefilled from detection.
  - Changing one turns the badge green and drops "(guessed)".
  - **After a change, typing in a row does not revert the selection** — the pinning test.
  - Confirming writes the chosen codes and `langSource: 'manual'` into the emitted `WordList`.
- **IMPLEMENT:** The `override` state and `effective` value from `plan.md` § C2. Replace the
  hardcoded hint (`ListEditor.tsx:190`) with language-neutral copy (FR-18).
- **GOTCHA:** Take `headerConsumed` from **detection**, never from the override. It answers "is row 0
  a header?", a question about the rows. Getting this wrong admits the header row as a word pair —
  one nonsense card at the end of a drill.
- **GOTCHA:** `handleConfirm` (`ListEditor.tsx:137`) re-runs `detectLanguages` on the clean rows and
  uses *that* result, not the rendered `detection`. It must use `effective` or the manual choice is
  silently discarded at the moment it matters most.
- **GOTCHA:** Keep the selects ≥ 44 px (NFR-5) and give each a real `<label htmlFor>` — the row
  inputs use `aria-label`, but a visible label is right for a control the user must read.
- **VALIDATE:** `npm test -- ListEditor`

### Task 10: ENFORCE distinct languages, and pass saved languages into the editor
- **TEST FIRST:** setting column 2 to column 1's language moves column 1 to column 2's previous
  value; the two are never equal. Separately: opening a saved list whose `langSource` is `'manual'`
  renders that list's languages, not a re-detection of its rows.
- **IMPLEMENT:** The exchange from `plan.md` § C3. Add optional `initialLangs` / `initialLangSource`
  props and pass them from `App.tsx`'s edit-list call site.
- **WHY:** Without the props, re-opening a saved list re-detects from scratch and throws away the
  choice the user made — the selectors would appear to work and then quietly forget (FR-15, A6).
- **GOTCHA:** Exchange, do not reject and do not disable the option. A user setting both to the same
  language is almost always trying to swap them.
- **VALIDATE:** `npm test -- ListEditor App`

### Task 11: ADD the Swap columns control
- **TEST FIRST:** swapping exchanges every row's `col1`/`col2` **and** the two languages; swapping
  twice returns to the original state.
- **IMPLEMENT:** `handleSwap` from `plan.md` § C4.
- **GOTCHA:** It must set the override. Swapping only the contents lets the next detection pass swap
  the languages back, and the two cancel to a visible no-op.
- **GOTCHA:** Spread the row (`{ ...r, col1: r.col2, col2: r.col1 }`) so `RawRow.conf` survives —
  it is reserved for the deferred OCR path (`parse/types.ts:11`).
- **VALIDATE:** `npm test -- ListEditor`

---

## Phase 4 — Harden the read path (Task 12)

### Task 12: VALIDATE language codes in `listRepo`
- **TEST FIRST:** `src/storage/listRepo.test.ts` — a stored list with `col1Lang: "xx"` loads with the
  code coerced to a valid one, the list's pairs intact, and no throw. Also: `col1Lang` absent
  entirely, and `col1Lang: 42`.
- **IMPLEMENT:** `toLangCode` from `plan.md` § D, applied in `read()`'s filter/map.
- **WHY:** Once the code set is open, an unknown code can reach `BCP47[lang]` → `undefined` →
  `utterance.lang = undefined`, plus an empty language name in three components. Silent and
  awkward to diagnose (`spec.md` FR-20).
- **GOTCHA:** **Coerce, never drop.** Discarding the list would lose the user's words over a
  two-character field. The module's contract is that the worst acceptable outcome is degraded, not
  destructive (`listRepo.ts:24`).
- **GOTCHA:** `listRepo`'s existing tests are the safety net for the 003 storage refactor
  (`localListStore.ts:9`). Extend them; do not restructure the module.
- **VALIDATE:** `npm test -- listRepo localListStore`

---

## Phase 5 — Integration, docs and gates (Tasks 13–14)

### Task 13: VERIFY the full path end to end
- **TEST FIRST:** `src/App.test.tsx` — build a Dutch/French list through the editor, start a drill,
  and assert the speech stub received the French text with the French list's `col2Lang`. Assert an
  existing English/Dutch list still drills unchanged.
- **IMPLEMENT:** Only what those tests demand. If `App.tsx` needs a change beyond Task 10's props,
  something in Workstream A or B is not as orthogonal as the plan claims — stop and reread it
  (`plan.md` § Files, "Untouched").
- **GOTCHA:** Assert on the `lang`/`voice` handed to the utterance, not just that `speak` was called.
  "Spoke the right words in the wrong accent" is the exact defect being fixed and passes a
  call-count assertion.
- **GOTCHA:** `VoiceWarning` needs no change, but confirm it renders "No **French** voice on this
  device" when no `fr` voice is stubbed — that path is generic and should be proven, not assumed.
- **VALIDATE:** `npm test`

### Task 14: UPDATE `README.md` and run every gate
- **IMPLEMENT:** README currently opens "practising **English↔Dutch** vocabulary" and its
  "Which column is which language" section names only those two. Rewrite for an open set, document
  the selectors and Swap, and keep the existing voice-installation guidance (it is per-OS and
  language-agnostic).
- **GOTCHA:** The README's "How it's built" section names `src/parse/` as the interesting part. It
  still is — make sure the description of *what* it does no longer says "Dutch".
- **VALIDATE:**
  ```bash
  npm run typecheck && npm run lint && npm test && npm run check:bundle
  ```
  Expect **≥ 241 tests, all green**, and the eager bundle within 150 KB.

---

## Definition of done

- [ ] Tasks 1–14 complete, every VALIDATE green.
- [ ] All nine `spec.md` § Acceptance Criteria verified by hand in the running app, not only by test.
- [ ] `git diff --stat` touches no file in `plan.md` § Files "Untouched".
- [ ] No `localStorage` `SCHEMA_VERSION` bump; a list saved before this change loads after it.
- [ ] Adding a hypothetical `de` would touch `languages.ts` and nothing else — confirm by reading,
      not by writing it.
