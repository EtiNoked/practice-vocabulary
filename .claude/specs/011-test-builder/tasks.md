# Tasks: 011-test-builder

**Baseline:** `main` @ `5aaae6b` — **1085 tests across 56 files, all green**
**Branch:** `feature/test-builder`, cut from `main`
**Status:** Tasks 1–29 DONE. **Task 30 (the device pass) OUTSTANDING** — see spec.md.
**Total:** 30 tasks across 7 phases
**Legend:** `[P]` = parallelisable with its siblings · every task ends in a runnable VALIDATE

> **TDD where there is behaviour.** Failing test (RED), minimal code (GREEN), refactor green.
> Phases 5–6 are presentation and wiring; Phase 7 is guards and prose.
>
> **No existing test may be weakened.** There is exactly one sanctioned exception, named in
> Task 10. Any *other* red test means the change broke something: fix the change, not the test.
>
> **The Phase 2 checkpoint is not optional.** At the end of Task 10 the app does exactly what it
> does today, through the new spine, with every existing test green. If that cannot be reached,
> stop — nothing in Phases 3–7 is worth building on a spine that does not hold.

---

## Phase 1 — The spine (Tasks 1–5)

### Task 1: NEW `src/state/drillRun.ts`
- **IMPLEMENT:** `plan.md` § B.1 in full — `DrillSubject`, `TestPlan`, `DrillRun`, `runFromList`,
  `runFromPool`, `redraw`, `canRedraw`, `runPairs`, `poolSubject`. Comments included; they carry
  the reasons, and the reasons are the reviewable part.
- **RED FIRST** (`src/state/drillRun.test.ts`):
  - `runFromList` preserves pair **ids** and stamps every word with the list's id and name
  - `runFromList` with an explicit subset uses the subset, not `list.pairs`
  - `runFromPool` draws without replacement; a pinned `seededRng` gives a pinned draw
  - `runFromPool` with `count: null` draws the whole pool; with a count above the pool, clamps
  - `redraw` on a pool of 30 drawn to 10 gives a different set under a fresh rng
  - `redraw` on a run with no plan returns the run **unchanged, by reference**
  - `canRedraw` is false with no plan, and false when `pool.length === words.length`
  - nothing mutates its input (freeze the pool and re-run)
- **GOTCHA:** `DrillSubject`'s fields are `name` / `col1Lang` / `col2Lang` and nothing else. The
  whole zero-churn widening in Task 2 depends on a `WordList` satisfying it structurally. Adding
  `id` or `pairs` — however convenient — undoes it and turns Task 2 into a nine-file rewrite.
- **GOTCHA:** `shuffle` is already exported from `session.ts` (008 exported it for the same
  reason). Do **not** write a second Fisher-Yates; the comment there says why in as many words.
- **GOTCHA:** No `Date.now()`, no `Math.random()`. `rng` is a parameter, as it is everywhere else
  in the pure layer.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/state/drillRun.test.ts
  ```

### Task 2: WIDEN the card props to `DrillSubject` [P]
- **IMPLEMENT:** In `TestCard.tsx`, `StudyCard.tsx` and `ResultsScreen.tsx`, change the prop type
  `list: WordList` to `subject: DrillSubject` and rename the local uses. No logic changes — the
  bodies already touch only `col1Lang`, `col2Lang` and (in results) `name`.
- **GOTCHA:** This is a **type-only** change. Every existing call site passes a whole `WordList`,
  which still satisfies the narrower type, so the only edits outside these three files are the
  prop **name** at the call sites. If you find yourself changing a test's fixture, stop: something
  has been added to `DrillSubject` that should not be there.
- **GOTCHA:** `ResultsScreen` reads `list.name`; the subject field is also `name`. Nothing else in
  that file touches the list.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/components/TestCard.test.tsx src/components/StudyCard.test.tsx src/components/ResultsScreen.test.tsx
  ```

### Task 3: SWITCH the `practising` and `results` states to `run`
- **IMPLEMENT:** `plan.md` § C.2. In `appMachine.ts`, replace `list: WordList` with
  `run: DrillRun` on both members. Update every case that rebuilds them: `START` (via
  `runFromList`), `REVEAL`, `TOGGLE_ANSWER`, `MARK`, `NEXT`, `PREV`, `QUIT`, `RESTART_SHUFFLED`,
  `RESTART_WRONG_ONLY`, `SWITCH_MODE`.
- **RED FIRST** (`src/state/appMachine.test.ts`): `START` from `ready` produces a run whose
  `words` are the list's pairs; with a `missed` subset, whose `words` are the subset;
  `SWITCH_MODE` after a wrong-only re-run still covers the **whole** run, not the misses.
- **GOTCHA:** `SWITCH_MODE` currently reads `state.list.pairs` **specifically so** a wrong-only
  re-run does not silently drop what the user got right (the comment says so). Its replacement is
  `state.run.words` — which for a list run *is* the list's pairs, and for a pool run is the drawn
  set. Reading `state.session.pairs` instead would reintroduce exactly the bug that comment
  prevents.
- **GOTCHA:** The `ready` state keeps its `list: WordList`. It needs `pairs.length`, "Save this
  list" and the missed chips; a run has none of them.
- **VALIDATE:**
  ```bash
  npm run typecheck   # EXPECTED TO FAIL in App.tsx — Task 4 closes it
  npx vitest run src/state/appMachine.test.ts
  ```

### Task 4: UPDATE `App.tsx` to the new state shape
- **IMPLEMENT:** Mechanical: `state.list`/`next.list` → `state.run`/`next.run` at the ~14 sites;
  `subject={state.run.subject}` on the three screens; `speakCurrent` reads
  `next.run.subject.col2Lang`; `promptLang` narrows on `ready` (list) and `practising` (run).
  `restore()` returns `{ screen: 'practising', run: drill.run, session: drill.session }`.
- **GOTCHA:** **No new behaviour in this task.** No new buttons, no new actions. The diff should
  read as a rename plus one constructor call. Anything else belongs to a later phase and will make
  Task 10's checkpoint impossible to interpret.
- **GOTCHA:** `buildSessionRecord(next.list, …)` still compiles here because Task 7 has not
  happened yet — pass `next.run.subject` shaped back into a list? **No.** Leave the call reading
  from a temporary `runFromList`-style shim only if typecheck demands it, and delete the shim in
  Task 8. Simpler: do Tasks 4, 6, 7 and 8 in one commit if the typecheck cannot be satisfied
  cleanly in between.
- **VALIDATE:**
  ```bash
  npm run typecheck && npm run lint && npm test
  ```

### Task 5: PERSIST a run, and restore an old payload
- **IMPLEMENT:** `plan.md` § D.3. `PersistedDrill.run: DrillRun`, an `isDrillRun` validator, and
  the coercion path for a payload carrying the old `list`.
- **RED FIRST** (`src/storage/drillRepo.test.ts`):
  - round-trips a pool run, plan and all
  - a **pre-011 payload** (`list`, no `run`) restores as a list run, with the same pairs
  - a payload with neither returns null
  - every existing case — TTL, finished session, malformed JSON, disabled storage — still returns
    null and never throws
- **GOTCHA:** `SCHEMA_VERSION` stays at **1**. Bumping it discards every drill in flight the
  moment this ships, to gain a shape we can construct ourselves. 009 made this exact call for
  `answersOpen` and 002 for `runKind`; the comment there is the template.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/storage/drillRepo.test.ts
  ```

---

## Phase 2 — Records and grouping (Tasks 6–10)

### Task 6: ADD `SessionRecord.runId` [P]
- **IMPLEMENT:** `plan.md` § B.4 — the optional field and its comment, in `state/types.ts`.
- **GOTCHA:** Optional, not required. Absent means "this record **is** the run", which is what
  makes `runId ?? id` a complete rule rather than a fallback with a hole in it.
- **GOTCHA:** Do **not** touch `sessionRepo.SCHEMA_VERSION`. `invariants.test.ts` already fails
  the build if you do, and the reason is that a bump deletes every user's history silently.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/test/invariants.test.ts
  ```

### Task 7: SPLIT a finished run into records
- **IMPLEMENT:** `plan.md` § B.2 — `buildRunRecords` in `state/sessionRecord.ts`, and
  `buildSessionRecord` re-expressed through it.
- **RED FIRST** (`src/state/sessionRecord.test.ts`):
  - **the deep-equal test**: for a one-list run, `buildRunRecords(...)[0]` is deep-equal to what
    `buildSessionRecord` returns, with `id` and `now` pinned — and carries **no `runId` key at
    all** (assert `'runId' in record === false`, not `=== undefined`)
  - three lists → three records, in **selection order**, sharing one `runId`
  - each record's `right`/`wrong`/`total`/`pct` are that list's own
  - a list whose words were all left unanswered gets **no** record
  - nothing answered at all → `[]`
  - `MAX_RIGHT_PAIRS` is applied per record
  - every existing `buildSessionRecord` test still passes **unchanged**
- **GOTCHA:** `rightPairs` uses a **conditional spread**, never `rightPairs: undefined` —
  `exactOptionalPropertyTypes` is on, and a present-but-undefined key reads back as "recorded,
  nothing right". The same rule now applies to `runId`.
- **GOTCHA:** Group through a `Map<pairId, PooledWord>` built from `run.words`. Do not match on
  text: `wordKey` is for comparing words **across** records, and using it here would fold two
  lists that share a word into one group — the pool already decided which list owns it.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/state/sessionRecord.test.ts
  ```

### Task 8: WRITE the records from `App`
- **IMPLEMENT:** `plan.md` § E.5 — the results branch writes every record from `buildRunRecords`,
  and `nextRunKind` gains the `START_RUN` clause for a misses-only plan.
- **GOTCHA:** `void store.recordSession(record)` in a loop, results ignored, exactly as the single
  write is today. A failed record must not interrupt the results screen.
- **GOTCHA:** A capped **all-words** test is `'full'` (D-11). Only `source === 'missed'` makes a
  run `'wrong-only'`.
- **VALIDATE:**
  ```bash
  npm run typecheck && npm run lint && npm test
  ```

### Task 9: NEW `src/state/runGroup.ts` [P]
- **IMPLEMENT:** `plan.md` § B.3 — `RunGroup`, `groupKey`, `groupRuns`.
- **RED FIRST** (`src/state/runGroup.test.ts`):
  - a legacy record (no `runId`) is a group of one, keyed by its `id`
  - three records sharing a `runId` fold into one group with summed counts
  - `pct` is `round(right / total * 100)` over the **sums** — a 1/2 and a 9/10 group to 10/12
    (83%), never to the 70% you get by averaging 50 and 90
  - groups come back newest first
  - `mode` is `'wrong-only'` only when every part is; `partial` is true when any part is
  - `listNames` preserves record order
- **GOTCHA:** `RunGroup` must satisfy `Pick<SessionRecord, 'right' | 'total' | 'pct'>` so
  `bandBorder` takes it unchanged. Add a type-level assertion in the test so a later field rename
  fails here rather than in a component.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/state/runGroup.test.ts
  ```

### Task 10: GROUP the two history surfaces — **the checkpoint**
- **IMPLEMENT:** `ScoreHistory.tsx` and `ReviewScreen.tsx` map over `groupRuns(records)`.
  `trend` averages over groups. `ReviewScreen` filters by list **first**, then groups, so a
  multi-list run still appears under each of its lists with that list's share (FR-35).
- **RED FIRST:** in each component's suite — three records of one run render **one** row showing
  the summed score; the average counts that run once; a legacy record renders exactly as before.
- **SANCTIONED EXCEPTION — the only one:** `ReviewScreen`'s row label changes from
  `record.listName` to the group's names ("3 lists" above one). Any test asserting the old label
  for a **multi-record** group is updated. Tests asserting it for a single record must **not**
  change — if one does, the group-of-one rule is broken.
- **GOTCHA:** `ReviewScreen`'s `onOpen` still passes a **record** id, not a group id.
  `ReviewDetail` is untouched in this feature, and it resolves by record id.
- **CHECKPOINT — do not proceed past this line until all of it is true:**
  ```bash
  npm run typecheck && npm run lint && npm test && npm run build
  ```
  All 1085 original tests green, plus the new unit suites. The app behaves **exactly** as it did
  at `789dc2c`. Everything from here is additive.

---

## Phase 3 — Saved tests, stored (Tasks 11–17)

### Task 11: NEW `src/state/testPlan.ts` [P]
- **IMPLEMENT:** `plan.md` § D.1 — `SavedTest`, `MAX_TESTS`, `TEST_COUNT_CHIPS`, `describeTest`.
- **RED FIRST:** `describeTest` renders "3 lists · words I got wrong · 15 of 34", "1 list · all
  words · all 12", and the dead-list case ("no lists left").
- **GOTCHA:** `TEST_COUNT_CHIPS` is its **own** constant, not an import of the game's
  `COUNT_CHIPS`. The comment in the plan explains why; write it down, because the two arrays being
  identical today makes the coupling look like a saving.
- **VALIDATE:** `npx vitest run src/state/testPlan.test.ts`

### Task 12: NEW `src/storage/testRepo.ts`
- **IMPLEMENT:** `plan.md` § D.2. Key `pvt.tests.v1`, `SCHEMA_VERSION = 1` with `gameRepo`'s
  frozen-version comment, `MAX_TESTS`, `getAll` / `save` / `remove`, total defensive read.
- **RED FIRST** (`src/storage/testRepo.test.ts`): the full matrix — absent key, malformed JSON,
  wrong shape, version mismatch, storage disabled — every one returns `[]`; save/round-trip;
  update in place by id; remove; cap enforcement; **a test naming a deleted list survives the
  round trip unchanged**.
- **GOTCHA:** Do not filter dangling `listIds` on read. A test that quietly repaired itself would
  become a different test; FR-17 says a broken one explains itself instead.
- **VALIDATE:** `npx vitest run src/storage/testRepo.test.ts`

### Task 13: EXTEND the `ListStore` interface and `memoryStore`
- **IMPLEMENT:** `plan.md` § D.4 — `subscribeTests`, `saveTest`, `removeTest` on the interface,
  with the doc comments; then `memoryStore` so the test doubles keep compiling.
- **VALIDATE:**
  ```bash
  npm run typecheck   # EXPECTED TO FAIL in both real stores — Tasks 14-15 close it
  npx vitest run src/storage/memoryStore.test.ts
  ```

### Task 14: IMPLEMENT them in `localListStore` [P]
- **IMPLEMENT:** Wrap `testRepo`, emit on write, exactly as the list methods do.
- **GOTCHA:** Emit **only when the write landed** — `afterWrite` already encodes that rule.
- **VALIDATE:** `npx vitest run src/storage/localListStore.test.ts`

### Task 15: IMPLEMENT them in `firestoreListStore` [P]
- **IMPLEMENT:** `testsPath = users/${uid}/tests`, an `onSnapshot` ordered by `updatedAt` desc,
  `setDoc` keyed by the test's own id, `deleteDoc`. `stripUndefined` on write.
- **GOTCHA:** The client-generated id **is** the document id, which is what makes a save
  idempotent — the same rule `saveList` documents.
- **GOTCHA:** Register the unsubscribe with `track()`, or `dispose()` leaves a live listener
  behind on sign-out.
- **VALIDATE:** `npm run typecheck && npx vitest run tests/rules/firestoreListStore.test.ts`

### Task 16: RULES for the `tests` collection
- **IMPLEMENT:** `plan.md` § D.5, in `firestore.rules`.
- **RED FIRST** (`tests/rules/firestore.rules.test.ts`): owner may create, update, read, delete;
  another user is denied each; an empty name is denied; a 21-list spec is denied.
- **GOTCHA:** `allow update` is **true** here, unlike `sessions` and `games`. A saved test is a
  document you edit; those two are logs. State that in a comment beside the rule, or the next
  reader will "fix" the inconsistency.
- **VALIDATE:**
  ```bash
  npm run rules:lint && npm run test:rules   # emulator; needs JDK 21+
  ```

### Task 17: FIX the account purge, and cover it
- **IMPLEMENT:** `plan.md` § D.6 — add `games` (missing since 008) and `tests` to `purgeUserData`.
- **RED FIRST** (`src/auth/deleteAccount.test.ts`): the existing "deletes lists, then sessions,
  then the user document" test becomes "lists, sessions, games, tests, then the user document".
  This is a **strengthening**, not a weakening — the old assertion was true and incomplete.
- **GOTCHA:** Order still matters and is still not negotiable: every collection before the user
  document. Deleting the account first strands the data permanently, because the rules only
  permit `isOwner(uid)`.
- **VALIDATE:** `npx vitest run src/auth/deleteAccount.test.ts`

---

## Phase 4 — The reducer (Tasks 18–19)

### Task 18: ADD the `testSetup` screen and its actions
- **IMPLEMENT:** `plan.md` § C.1 and C.3 — the state member, and `OPEN_TEST_SETUP`, `EDIT_TEST`,
  `START_RUN`. Place them beside the game's equivalents so the two read as siblings.
- **RED FIRST** (`appMachine.test.ts`): `OPEN_TEST_SETUP` is legal from every screen;
  `START_RUN` is legal **only** from `testSetup` and lands on `practising` with the given run and
  mode; `EDIT_TEST` pre-fills `initial`.
- **GOTCHA:** `START_RUN` carries a **built** run. Building one needs the live lists and every
  record — a pure reducer has neither and must not acquire them. Same contract as `START_GAME`.
- **VALIDATE:** `npx vitest run src/state/appMachine.test.ts`

### Task 19: ADD `RESTART_FRESH_DRAW`
- **IMPLEMENT:** `results` → `practising` over `redraw(state.run, rng)`, in the same mode.
- **RED FIRST:** legal only from `results`; under a pinned rng the new session's pairs differ from
  the old; on a run with no plan it is a **no-op returning the same state by reference**.
- **GOTCHA:** The mode carries through, like `restartShuffled`. A fresh draw of a practice run is
  still a practice run.
- **VALIDATE:** `npm run typecheck && npx vitest run src/state/appMachine.test.ts`

---

## Phase 5 — Screens (Tasks 20–23)

### Task 20: EXTRACT `PoolPicker` from `GameSetup`
- **IMPLEMENT:** `plan.md` § E.1. Move the list rows, the source toggle, the count chips and the
  number box — **with their comments** — into `src/components/PoolPicker.tsx`. Refit `GameSetup`
  to render it and keep its own heading, summary sentence, language line and Start button.
- **RED FIRST** (`src/components/PoolPicker.test.tsx`): rows render with count and language pair;
  an incompatible list is disabled and states its pair; selecting and deselecting releases the
  pair; the source toggle reports up; chips above the pool are absent; **the number box can be
  cleared and retyped — clear "10", type "4", get 4, not 104**.
- **GOTCHA:** `GameSetup.test.tsx` is **not modified**. It is the entire proof that this
  extraction was behaviour-preserving. If it goes red, the picker is wrong.
- **GOTCHA:** This is its own commit, before `TestSetup` exists. A refit and a new feature in one
  diff cannot be reviewed.
- **VALIDATE:**
  ```bash
  npx vitest run src/components/PoolPicker.test.tsx src/components/GameSetup.test.tsx
  ```

### Task 21: NEW `src/components/TestSetup.tsx`
- **IMPLEMENT:** `plan.md` § E.2 — `PoolPicker`, the live summary, **Practice** and **Test**,
  **Save this test**, Back. Edit mode reads **Save changes**.
- **RED FIRST:** empty-lists state offers **New list**; a pool of 0 explains itself and disables
  both start buttons; a misses-only pool of 0 gets its own sentence; save prompts for a name and
  reports the finished `SavedTest` upward; edit mode pre-fills from `initial`.
- **GOTCHA:** Both start buttons must call `onStart` **synchronously** — the tap is what speaks
  the first word, and iOS Safari drops an utterance that does not descend from a gesture. Do not
  navigate first and speak later.
- **GOTCHA:** The form's state lives here, not in the reducer (008 D-11).
- **VALIDATE:** `npx vitest run src/components/TestSetup.test.tsx`

### Task 22: NEW `src/components/SavedTests.tsx` [P]
- **IMPLEMENT:** `plan.md` § E.3, shaped on `SavedLists`.
- **RED FIRST:** loading, empty and populated states; the description line; a test whose lists are
  all gone shows 0 and an explanation and cannot be started; each button fires with the test.
- **GOTCHA:** The word count comes from the `count` prop — computed by the parent against **one**
  `now` — never stored on the test and never recomputed per row.
- **VALIDATE:** `npx vitest run src/components/SavedTests.test.tsx`

### Task 23: ADD **Another N** to the results screen [P]
- **IMPLEMENT:** A button rendered only when `canRedraw(run)`, labelled with the draw size.
- **RED FIRST:** absent for a list drill; absent when the pool equals the draw; present and firing
  for a capped pool run; the practice branch still shows **no score** (the rule that panel exists
  to protect).
- **VALIDATE:** `npx vitest run src/components/ResultsScreen.test.tsx`

---

## Phase 6 — Wiring (Tasks 24–26)

### Task 24: WIRE `App` to tests and runs
- **IMPLEMENT:** a `subscribeTests` layout effect beside the other three; `visibleTests` derived
  the same way; `testPoolSize(spec)` closed over `missSources`; `startRun(plan, mode, name?)`
  which builds the pool, draws the run, **speaks the first word synchronously**, and dispatches
  `START_RUN`; `saveTest` / `removeTest` through `store` with the existing toast on failure.
- **GOTCHA:** `startRun` reads `Date.now()` once and passes it into `buildWordPool`, exactly as
  `startGame` does — the count the user saw and the pool they get must come from one instant.
- **GOTCHA:** Starting a run clears the parked drill through the existing `act` branch. Nothing
  new is needed; do not add a second `drillRepo` call.
- **VALIDATE:** `npm run typecheck && npm run lint && npm test`

### Task 25: ADD the entry points [P]
- **IMPLEMENT:** `Home.tsx` — a **Build a test** button beside **Play a game**, and a
  `savedTests` slot below Saved lists. `NavMenu.tsx` — an `onTest` entry and `'testSetup'` in the
  screen union.
- **GOTCHA:** Both new `Home` props are **optional** and render only when supplied — several tests
  render `Home` directly, and that is the rule `onPlayGame` and `onSeeAllHistory` already follow.
- **VALIDATE:** `npx vitest run src/components/Home.test.tsx src/components/NavMenu.test.tsx`

### Task 26: END-TO-END test
- **IMPLEMENT:** `src/App.test.tsx` (or a new `src/App.test-builder.test.tsx`, following
  `App.game.test.tsx`'s precedent):
  1. two lists sharing a language pair, with history that makes one word a miss
  2. **Build a test** → select both → **All words** → cap at 2 → **Test**
  3. mark one right, one wrong
  4. **two** records written, sharing a `runId`
  5. Recent practice shows **one** row with the summed score
  6. the missed word appears on its own list's ready-screen chips
  7. **Save this test**, go home, and the row shows the live count
- **GOTCHA:** This is the only test that proves D-3 end to end. It is worth more than the six unit
  suites above it and should be written to survive re-labelling — assert on record shape and on
  row count, not on exact prose.
- **VALIDATE:** `npm test`

---

## Phase 7 — Guards and prose (Tasks 27–30)

### Task 27: INVARIANTS
- **IMPLEMENT:** in `src/test/invariants.test.ts`, four cases:
  1. **purity** — `drillRun.ts` and `runGroup.ts` contain no `Date.now()`, no `new Date()`, no
     `Math.random()`; and a positive check that they still export what they promise
  2. **`testRepo.SCHEMA_VERSION = 1`**, with the same reasoning as the two beside it
  3. **purge coverage (D-14)** — every `users/${uid}/…` collection path in
     `firestoreListStore.ts` also appears in `deleteAccount.ts`. This is the guard that would have
     caught the `games` gap; write the comment saying so
  4. **one group key** — `runId` is read in exactly two files (`sessionRecord.ts` writes it,
     `runGroup.ts` reads it). Anything else reading it is a second grouping rule, and double
     counting is silent
- **GOTCHA:** Every one of these must fail if the rule is broken. Check that by breaking it
  deliberately once and watching it go red — a guard nobody has seen fail is a guard nobody knows
  works, and case 3 in particular is easy to write vacuously.
- **VALIDATE:** `npx vitest run src/test/invariants.test.ts`

### Task 28: README
- **IMPLEMENT:** a **Building a test** section between "Practising" and "Reviewing what you got
  wrong", covering: several lists, all-or-misses, the cap, saving and re-running, and the two
  re-run buttons with the difference between them (D-6). Note that a multi-list test is one row in
  history.
- **VALIDATE:** read it back; the section explains the difference between "same words again" and
  "another 15" without referring to this spec.

### Task 29: FULL validation
- **VALIDATE:**
  ```bash
  npm run typecheck && npm run lint && npm test && npm run build && npm run check:bundle
  npm run test:rules
  ```
  Expect **62 test files** (six new) and the suite comfortably above 1085. No test file from the
  baseline may have shrunk.

### Task 30: THE DEVICE PASS
- **IMPLEMENT:** `npm run dev -- --host`, then on a **real iPhone in Safari**:
  - build a test over two lists, start it in **Test**, and confirm the first word is **audible**
  - mark through five words and confirm every one speaks
  - **Another 15** from the results screen — the first word of the new draw must be audible
  - **Practice** a saved test from home — same check
  - reload mid-run and confirm the drill comes back with the resumed hint
  - dark mode, and the whole flow at 200% text size
- **GOTCHA:** No test in this suite can stand in for this. jsdom cannot fail the way iOS Safari
  fails — silently, on one platform, dropping any utterance that does not descend from a tap.
  008 shipped with this step outstanding; do not repeat that.
- **VALIDATE:** record the outcome in `spec.md` under an implementation note, as 008 did.

---

## Commands

```bash
npm run typecheck && npm run lint && npm test   # the gate after every task
npm run test:rules                              # emulator + JDK 21+
npm run check:bundle                            # build + size guard
npm run dev -- --host                           # so a phone can reach it
```

## Commit shape

One commit per phase, message in the repo's voice (what it does for the user, not what it
touches). Phase 1–2 is the refactor and should say so plainly — "carry a run, not a list" — because
a reviewer needs to know that commit is expected to change no behaviour at all.
