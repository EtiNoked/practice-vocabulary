# Tasks: Practice hides the answer, and an eye gives it back

**Feature ID:** 009-practice-peek
**Baseline:** `main` @ `d24ec53` — **604 tests across 38 files, all passing**
**Total:** 13 tasks across 4 phases
**Legend:** `[P]` = parallelisable with its siblings · every task ends in a runnable VALIDATE

> **TDD where there is behaviour** (Phases 1–2): failing test (RED), minimal code (GREEN),
> refactor green. Phase 3 is presentation and Phase 4 is prose.
>
> **No existing test may be weakened**, with exactly three named exceptions — the two inversions
> in Task 8 and the strengthening in Task 11. Those change because the behaviour genuinely
> changed. Any *other* red test means the change broke something: fix the change, not the test.

> **Order matters.** The state layer (Phase 1) lands and is proved before a single pixel moves.
> If `answersOpen` turns out to want a different lifetime, finding out costs three files rather
> than nine. Task 4 (persistence) comes **before** the UI so that "reveal survives a reload" is
> already true the first time anyone can see a reveal at all.

---

## Phase 1 — The state (Tasks 1–4)

### Task 1: ADD `Session.answersOpen`
- **IMPLEMENT:** `plan.md` § B.1 verbatim, comment included. `src/state/types.ts`, inside
  `Session`, directly after `revealed`.
- **WHY THE COMMENT MATTERS:** It is the only thing standing between a future reader and
  "these two booleans look the same, let me merge them". The file already carries this exact
  kind of warning for `DrillMode` vs `SessionRecord.mode` ([types.ts:31-37](src/state/types.ts#L31-L37)).
- **GOTCHA:** Required, not optional. An optional field would push the "is it set?" question out
  to every reader; the one place that genuinely needs to answer it is `drillRepo.read` (Task 4).
- **VALIDATE:**
  ```bash
  npm run typecheck   # EXPECTED TO FAIL: createSession does not set the field yet
  ```
  A red typecheck here is the point — it enumerates every construction site.

### Task 2: INITIALISE it in `createSession`, and add `toggleAnswers`
- **IMPLEMENT:** `plan.md` § B.2. `answersOpen: false` in `createSession`'s returned object, and
  the new `toggleAnswers` export beside `reveal`.
- **RED FIRST** (`src/state/session.test.ts`, `plan.md` § E.1):
  - `createSession` returns `answersOpen: false` in **both** modes
  - `toggleAnswers` flips both ways, returns a new object, mutates nothing
  - `nextCard` **preserves** `answersOpen` and still clears `revealed`
  - `prevCard` likewise
  - `restartShuffled` / `restartWrongOnly` come back closed even from an open session
- **GOTCHA:** `nextCard` and `prevCard` need **no code change** — they spread `...session`, so the
  carry is already correct. Add a one-line comment to each saying it is deliberate, or the next
  reader will "fix" it by adding a reset. The tests above are what make that comment enforceable.
- **GOTCHA:** Do **not** touch `mark()`. It is test-only, the field is already false there, and
  writing it would imply a coupling that does not exist.
- **GOTCHA:** `createSession` is the **only** place the field is initialised. That is what makes
  FR-5 free for `restartShuffled`, `restartWrongOnly` and `SWITCH_MODE`.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/state/session.test.ts
  ```

### Task 3: ADD the `TOGGLE_ANSWER` action
- **IMPLEMENT:** `plan.md` § B.3. The union member, and the case directly **beneath** `REVEAL` so
  the two guards read as a matched pair.
- **RED FIRST** (`src/state/appMachine.test.ts`, `plan.md` § E.2): flips on a practising practice
  session; twice returns to closed; **no-op in test mode** (asserted with `toBe`, beside the
  existing "REVEAL is a no-op in practice mode" at line 208); no-op on `ready`/`results`/`home`;
  `SWITCH_MODE` into practice lands closed.
- **GOTCHA:** The guard is `state.screen !== 'practising' || state.session.mode !== 'practice'` —
  the exact mirror of `REVEAL`'s. Return `state` **by reference** on a no-op; the suite asserts
  identity, not equality.
- **VALIDATE:**
  ```bash
  npx vitest run src/state/appMachine.test.ts src/state/session.test.ts
  ```

### Task 4: COERCE the field in `drillRepo.read`
- **IMPLEMENT:** `plan.md` § B.4. Rebuild `session` in the returned object with
  `answersOpen: payload.session.answersOpen === true`, comment included.
- **RED FIRST** (`src/storage/drillRepo.test.ts`, `plan.md` § E.3): round-trips `true`; a payload
  whose session has **no `answersOpen` key** restores with `false` (assert the value, not merely
  non-null); `'yes'` restores as `false`; `SCHEMA_VERSION` is still `1`.
- **GOTCHA — the important one.** Do **not** add an `answersOpen` check to `isSession`. Every
  drill parked by the current build lacks the key, so requiring it makes `read()` return `null`
  and destroys every run in flight the moment this deploys (spec E-5).
- **GOTCHA:** `=== true`, never a truthiness test. A hand-edited `"yes"` must land closed (E-6).
- **GOTCHA:** `SCHEMA_VERSION` stays `1` (NFR-5). Bumping it to admit a field a reader can simply
  default is how you delete every drill in flight to gain nothing — `read()` already tolerates an
  unknown `runKind` for exactly this reason rather than rejecting the payload.
- **VALIDATE:**
  ```bash
  npx vitest run src/storage/drillRepo.test.ts
  grep -n "SCHEMA_VERSION = " src/storage/drillRepo.ts    # → 1
  npm test                                                 # 604 + new, all green, no UI change yet
  ```

---

## Phase 2 — The mask (Tasks 5–6)

### Task 5: ADD the `.answer-masked` primitive to `src/index.css`
- **IMPLEMENT:** `plan.md` § C.1 verbatim — the rule, the `forced-colors` fallback, and both
  comments.
- **WHERE:** Inside `@layer components`, after `.card`. Not in `@theme` (it is not a token), not
  at a call site.
- **GOTCHA:** `filter: blur(0.35em)`, in `em`. A pixel radius stops covering the word the moment
  `--text-word` changes, and Task 6's guard fails the build over it (NFR-3).
- **GOTCHA:** `user-select: none` is not decoration. Without it a drag-select reads the answer
  straight off the blurred text — it is still ordinary DOM text (spec E-1).
- **GOTCHA:** Keep the `-webkit-` prefix. Safari on iOS is the primary target of this app.
- **VALIDATE:**
  ```bash
  npm run build
  grep -o '\.answer-masked{[^}]*}' dist/assets/*.css   # → filter:blur(.35em) and user-select
  grep -c 'forced-colors' dist/assets/*.css            # ≥ 1
  ```
- **STOP IF:** the class is absent from `dist/`. Tailwind scans `src/` only
  ([index.css:10-11](src/index.css#L10-L11)) — a `@layer components` rule is emitted regardless of
  usage, so an absence means it landed in the wrong block.

### Task 6: GUARD the mask in `src/test/theme.test.ts` `[P]`
- **IMPLEMENT:** `plan.md` § E.5, beside the existing token guards.
  - `.answer-masked` reaches the compiled stylesheet
  - its `filter` radius is expressed in `em` (NFR-3)
  - the `forced-colors` fallback exists (NFR-7)
  - **no `blur-*` utility anywhere in `src`** (NFR-2)
- **GOTCHA:** Assemble the `blur-` pattern from string parts, exactly as the white/black guard
  does at [theme.test.ts:176-184](src/test/theme.test.ts#L176-L184) — spelling a real utility
  literally in this file would compile it into the stylesheet and the test would fail on its own
  source.
- **GOTCHA:** Match the `filter` inside the `.answer-masked` block, not anywhere in the file. A
  whole-file regex passes for the wrong reason the first time any other rule gains a filter.
- **VALIDATE:**
  ```bash
  npx vitest run src/test/theme.test.ts
  ```

---

## Phase 3 — The card (Tasks 7–11)

### Task 7: WIRE `onToggleAnswer` from `App.tsx`
- **IMPLEMENT:** `plan.md` § C.4. One prop on the `StudyCard` branch.
- **GOTCHA — the one that silently breaks FR-10:** do **not** add `'TOGGLE_ANSWER'` to the
  `advances` list at [App.tsx:257-265](src/App.tsx#L257-L265). Every peek would re-speak the
  prompt.
- **GOTCHA:** Nothing else in `act` changes. Persistence already fires on every action that leaves
  the app on `practising`, and the flag rides inside `Session` — do not add a second save path.
- **VALIDATE:** `npm run typecheck` — red until Task 8 adds the prop to `StudyCard`. Expected.

### Task 8: MASK the answer and add the eye, in `StudyCard.tsx`
- **IMPLEMENT:** `plan.md` § C.2 and § C.3 — the `answer-masked` class, `aria-hidden`, the toggle
  button, the `a` key branch, and the footer hint line.
- **THE TWO INVERSIONS** (`src/components/StudyCard.test.tsx`, `plan.md` § E.4). Each keeps its
  place in the file and gains a comment naming 002's FR-11 and why it no longer holds — the
  pattern 007 used when `theme.test.ts:81` flipped:
  - line 47 *shows the prompt word and the answer together, with no interaction* → **shows the
    prompt plainly and the answer covered**
  - line 88 *offers no reveal, because nothing is hidden* → **offers a reveal, because the answer
    is hidden**
- **ALSO ADD:** click calls `onToggleAnswer`; with `answersOpen: true` there is no mask, no
  `aria-hidden`, and the button reads **Hide answer**; the **prompt is never masked** in either
  state (E-11); `a` toggles; `a` with a `[role="menu"]` present does not (clone the guard test at
  line 189); toggling adds nothing to `speechCalls`; the footer hint mentions the key.
- **GOTCHA:** `aria-hidden` is **required**, not optional polish. Blur is a picture of hiding — a
  screen reader reads the answer aloud on card load without it, and this feature would do nothing
  at all for exactly the user it looks like it helps (FR-8).
- **GOTCHA:** Label it **Reveal answer / Hide answer**, never "Show answer". That string is Test
  mode's, and [App.test.tsx:381](src/App.test.tsx#L381) uses its absence to prove a restored
  practice drill came back as practice.
- **GOTCHA:** No `aria-pressed` alongside the changing label — it double-announces the state.
- **GOTCHA:** `className="btn btn-quiet"`. The 44px target comes from `.btn`; do not retype
  `min-h-11` ([index.css:303-313](src/index.css#L303-L313)).
- **GOTCHA:** Do not add a dependency array to the `useEffect` while you are in there. It is
  deliberate — read [StudyCard.tsx:38-44](src/components/StudyCard.tsx#L38-L44).
- **GOTCHA:** `event.preventDefault()` on the `a` branch, matching the neighbouring branches.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/components/StudyCard.test.tsx
  ```

### Task 9: CONFIRM `TestCard.tsx` was not touched `[P]`
- **IMPLEMENT:** Nothing. This is the check that FR-13 held.
- **VALIDATE:**
  ```bash
  git diff --stat -- src/components/TestCard.tsx     # → empty
  npx vitest run src/components/TestCard.test.tsx    # → unchanged, green
  ```
- **STOP IF:** either shows movement. Something leaked across the mode boundary; find it before
  going on.

### Task 10: UPDATE the ready-screen hint `[P]`
- **IMPLEMENT:** `plan.md` § D, row 1. `Hear it, see it, see the answer` →
  `Hear it, try it, reveal when you want`.
- **GOTCHA:** Leave the `id="mode-practice-hint"` / `aria-describedby` wiring alone. It is
  deliberately outside the button; nesting it makes the sentence part of the button's accessible
  name ([ReadyScreen.tsx:34-39](src/components/ReadyScreen.tsx#L34-L39)).
- **VALIDATE:** `npx vitest run src/components/ReadyScreen.test.tsx`

### Task 11: PROVE it end to end in `App.test.tsx`
- **IMPLEMENT:** `plan.md` § E.6.
- **THE STRENGTHENING — read this before writing anything.**
  `expect(screen.getByText('daughter')).toBeInTheDocument()` at
  [App.test.tsx:550](src/App.test.tsx#L550) **still passes while the answer is masked**, because
  blurring leaves the text in the DOM. It must become an assertion about the accessibility tree
  (`aria-hidden`) or the mask class. Left as it is, it looks like coverage and is not — which is
  worse than deleting it.
- **ADD:** reveal on card 1 → Next → card 2 already revealed (AC-4); hide on card 2 → Previous →
  card 1 masked (AC-5); reveal → unmount → re-render → still revealed (AC-6), beside the existing
  restore test at line 368; finish revealed → **Practice again** → masked (AC-8).
- **GOTCHA:** Use the file's existing `renderApp()` / `listRepo.save(seeded)` setup and its
  `/^practice$/i` button matcher — the anchors matter, `/practice/i` also matches "Practise".
- **VALIDATE:**
  ```bash
  npx vitest run src/App.test.tsx && npm test
  ```

---

## Phase 4 — The prose (Tasks 12–13)

### Task 12: CORRECT the comments this feature falsified `[P]`
- **IMPLEMENT:** `plan.md` § D, rows 2–4.
  - [StudyCard.tsx:18](src/components/StudyCard.tsx#L18) and
    [:21-23](src/components/StudyCard.tsx#L21-L23) — the doc comment says "hides nothing"
  - [App.tsx:391-395](src/App.tsx#L391-L395) — the mode-routing comment says the same
- **WHY IT IS A TASK:** A comment that lies is worse than no comment, and both of these are load
  bearing — they are the argument for why `StudyCard` and `TestCard` are two components. Rewrite
  the reasoning; do not just delete the clause. The divergence they predicted is what this feature
  *is*, and saying so is the most useful line either comment will ever carry.
- **ALSO:** check [ResultsScreen.tsx:151-163](src/components/ResultsScreen.tsx#L151-L163)
  ("Study these") — if its copy promises the answer is shown, it changes too.
- **VALIDATE:**
  ```bash
  grep -rn "hides nothing" src/    # → no hits
  npm test
  ```

### Task 13: DOCUMENT the mode in `README.md`
- **IMPLEMENT:** `plan.md` § D, row 5. [README.md:87-93](README.md#L87-L93) documents the Test
  flow only. Add the Practice flow — hear it, try it, **Reveal answer 👁**, Next — say that the
  choice sticks for the rest of the run, and give its keys: `Space` replays, `A` shows the answer,
  `→` / `←` move.
- **GOTCHA:** Keep the existing Test-mode line intact and clearly labelled. Two modes with two
  keyboard rows, not one merged paragraph that describes neither.
- **VALIDATE — the full gate:**
  ```bash
  npm run lint && npm run typecheck && npm test && npm run check:bundle
  ```
- **STOP IF:** `check:bundle` moves meaningfully. One CSS rule and one boolean should be lost in
  the noise; a real jump means something else came along for the ride.

---

## Definition of done

- [ ] 604 baseline tests still pass, with only the three named edits (Task 8 ×2, Task 11 ×1)
- [ ] `npm run lint`, `npm run typecheck`, `npm run check:bundle` all green
- [ ] `git diff -- src/components/TestCard.tsx` is empty (FR-13)
- [ ] `grep -rn "blur-" src/` finds no Tailwind utility (NFR-2)
- [ ] `drillRepo.SCHEMA_VERSION` is still `1` (NFR-5)
- [ ] Manually, in `npm run dev`, on a phone-sized viewport:
  - [ ] the answer is covered on arrival and the card does not resize when it is uncovered
  - [ ] the reveal carries to the next card, and hiding carries back
  - [ ] a reload mid-run comes back on the same card, in the same state
  - [ ] the covered word cannot be selected by dragging across it
  - [ ] both themes look right — the mask is a filter, so it inherits the palette either way
