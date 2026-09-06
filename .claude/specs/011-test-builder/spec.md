# Spec: Build a test — several lists, only what you miss, capped, and kept

**ID:** 011-test-builder
**Status:** IMPLEMENTED — `feature/test-builder`, 6 commits, all gates green
**Outstanding:** the on-device iPhone pass (tasks T30). See the note at the end.
**Created:** 2026-09-06
**Baseline:** `main` @ `5aaae6b` — 56 test files, **1085 tests, all green**
**Feature Type:** New capability — one new screen, one new stored kind, and a generalisation of the drill
**Complexity:** High. The builder is routine; making a drill span several lists without corrupting
six-feature-old history is not.
**Depends on:** 008-word-game — **landed on `main`** (`5aaae6b`, #11). `state/wordPool.ts`, the
module this feature is built on, is in the tree and can be read, not assumed.
**Branch:** `feature/test-builder`, cut from `main`.

---

## The ask

> "I want to have like a 'test' mode - you can test on a specific list, but you can also define a
> test for several lists, and in that - choose if it will be all, or just the ones you got
> previously wrong. You can also have an option to choose to cap it (so to have a test just on
> 10/15/20 words - which will be randomized). Make sure the practice itself know which words you
> tried, so you can re-do the practice, or regenarate this test. Keep in mind that the
> functionality of choosing from different lists, decide how much and if it only mistakes or all -
> already exists (buildWordPool, in src/state/wordPool.ts)."

Four things: a **multi-list drill**, a **cap drawn at random**, a **run that remembers which words
it used**, and a **test you can keep and run again**.

The ask is right that the selection half already exists. 008 built `buildWordPool` deliberately
feature-agnostic (008 D-13) against exactly this moment: *"a scheduled-review mode, a flashcard
deck, a printable worksheet and an export all ask it identically"*. This is the second caller the
module was designed for, and it must not need to change to accept one.

What does **not** exist is everything downstream of the selection. A drill is single-list all the
way through — `Session.listId` is one string, `SessionRecord.listId` is one string, and the
practising screen carries a whole `WordList` for its title and its language pair. That is the work.

---

## Answers taken in session

Four questions were put to the user before this was written. Their answers are D-1, D-2, D-3 and
D-5 below, and the rest follows from them and from the codebase.

The fourth answer changed the shape of the feature and is worth quoting:

> "re-do can be from the result page, but we should a 'test' list where you can see how this test
> configure and run it again (from new)"

So a test is a **thing you keep**, not a run you re-open from history. That is a stored definition
with a name — closer to a `WordList` than to a `SessionRecord` — and it is what makes the feature
worth building rather than a second setup screen.

---

## Decisions taken

Numbered so the plan and the tasks can cite them instead of re-arguing them.

| # | Decision | Why |
|---|---|---|
| **D-1** | **A new "Build a test" screen.** The per-list ready screen keeps its Practice / Test buttons, its missed-words chips and its whole test suite, untouched. | *(user)* Mirrors 008's `gameSetup` exactly, so the nav, the guard and the reducer shape are all precedented. The alternative — routing the common "drill this one list" case through a builder — adds a step to the app's most-used path to serve its rarest. |
| **D-2** | **A pool-built run starts in EITHER mode.** The builder ends in the same two buttons the ready screen has. | *(user)* The drill already routes on `session.mode` ([App.tsx](src/App.tsx)), so the second button costs one line and a test. "Study the twenty words I keep missing across four lists" is the more useful half of the feature, and refusing it would be an arbitrary limit rather than a design. |
| **D-3** | **A finished run writes one `SessionRecord` PER CONTRIBUTING LIST**, all sharing a new optional `runId`. No new history collection, no new record type. | *(user)* `collectMissed` — the subtlest engine in the app, and the one whose suite is the regression net for everything 006 and 008 built — is not touched at all. The review screen's list filter, `ReviewDetail`, `scoreBand` and the Firestore rules all keep working because nothing they read has changed shape. |
| **D-4** | **The history group key is `record.runId ?? record.id`.** | Every record ever written is then a group of one, with no migration, no schema bump and no back-fill. The field is additive and optional, which is exactly the forward compatibility [sessionRepo.ts](src/storage/sessionRepo.ts) was designed for and [invariants.test.ts](src/test/invariants.test.ts) forbids bumping the version to get. |
| **D-5** | **A test is a saved DEFINITION, not a saved run.** `SavedTest` = a name + a `PoolSpec` + a cap, in its own `tests` collection. Running it evaluates it against the lists and the history **as they stand today**. | *(user)* A definition that froze its words would be a snapshot, and "only the ones I got wrong" would stop meaning anything the moment you learned one. The point of naming a test is that it stays true as you improve. |
| **D-6** | **Two different re-runs, two different meanings.** From results: *another N from the same pool* — the pool **snapshot**. From the saved-tests list: *run it again* — rebuilt from **live** lists. | The snapshot rule is 008 D-9 verbatim and for its reason: the user chose a length against a pool size they were shown, and a re-draw that quietly grew because another tab edited a list would contradict the number they decided on. A saved test is a different act — you are asking the question again, today. |
| **D-7** | **`practising` and `results` carry a `DrillRun`, not a `WordList`.** | There is no honest single list for a multi-list run. A synthetic `WordList` was rejected on the same grounds [ReadyScreen.tsx](src/components/ReadyScreen.tsx) already documents for the missed subset: it would share a real list's id, so anything that saves by id would overwrite forty words with fifteen. Keeping them separate makes that unrepresentable rather than merely avoided. |
| **D-8** | **`DrillSubject` is `{ name, col1Lang, col2Lang }`** — deliberately the names `WordList` already uses, so a `WordList` satisfies it structurally. | Widening `TestCard`, `StudyCard` and `ResultsScreen` from `WordList` to `DrillSubject` is then a **type-only change with no call-site churn and no test churn** — the same move 008 made when it widened `collectMissed` to `MissSource` ([missedWords.ts](src/state/missedWords.ts)). Every existing test goes on passing a whole list and goes on passing. |
| **D-9** | **The single-list route goes through the SAME `DrillRun` path.** A list drill is a run whose pool is that list. | One record-writing code path, not two. A second path for "the simple case" is how the simple case quietly stops matching the complicated one. A one-list run produces exactly one record and **no `runId`**, so what lands in storage is byte-identical to what lands there today. |
| **D-10** | **`count: number \| null`.** `null` means "everything this selects, however much that turns out to be." | A saved test with a fixed 15 and a saved test that means *all my current mistakes* are different questions, and only one of them can be written as a number. |
| **D-11** | **A capped random sample is recorded as `mode: 'full'`.** | `mode` answers one question — *was this a harder-than-average subset?* — and an unbiased random sample is not one. A third value was rejected: it would have to be understood by `ScoreHistory`'s average, `ReviewScreen`'s row label and `scoreBand`, to express something none of them needs to know. A **missed-words** test is still `'wrong-only'`, which is the distinction that already exists. |
| **D-12** | **`PoolPicker` is extracted from `GameSetup` and shared by both setup screens.** | Not a reflex. The counter-precedent is real and explicit — [NavMenu.tsx](src/components/NavMenu.tsx) refuses to share its popover with `AccountMenu` because *"two call sites is not three"* and the two differed in a **behaviour** one had no use for. These differ only in copy and limits, which are props, and they render a **rule** (`listOptions`' one-language-pair, disabled-not-hidden, one live count from one computation) that already lives in a shared module. [GameSetup.tsx](src/components/GameSetup.tsx) says so itself: *"a second picker that re-derived that rule slightly differently is exactly what keeping it in the shared module prevents."* |
| **D-13** | **Saved tests do not migrate from guest to account this round.** They stay on the device, as local score history already does. | `MigrationResult` and `MigratePrompt` are per-list shaped ("Copy 3 lists"), and mixing two kinds into one prompt is a UI question this feature does not need to answer. List ids are preserved by migration, so a saved test's `listIds` stay valid and a later migration is a pure addition. |
| **D-14** | **An invariant compares the collection paths in `firestoreListStore` against the ones `purgeUserData` deletes.** | Because that guard is not hypothetical — see the defect below. |

---

## A defect found while planning

`purgeUserData` in [deleteAccount.ts](src/auth/deleteAccount.ts) deletes `users/{uid}/lists` and
`users/{uid}/sessions`, and then the user document. It does **not** delete `users/{uid}/games`.

008 added that collection and did not add it here, and nothing failed: the account is destroyed,
`deleteAccount` returns `{ ok: true }`, and every game record the user ever played stays in
Firestore under a uid that can never authenticate again. Nobody can reach it to delete it, because
the rules only permit `isOwner(uid)`.

This feature adds a **fourth** collection to the same function, so it fixes the third on the way
past (FR-39) and adds the invariant that would have caught it (D-14). Called out here rather than
folded in silently, because it is a data-deletion promise the app is currently not keeping.

---

## User stories

### Story 1 — Build a test across lists

**As** someone revising for an exam that covers four chapters
**I want** to build one test from all four lists at once
**So that** I practise the way I will be examined, instead of four times in a row

**Acceptance criteria**

- [ ] A **Build a test** entry exists on the home screen and in the nav menu.
- [ ] Every saved list is offered with its name, word count and language pair.
- [ ] The first list picked fixes the language pair; incompatible lists go disabled and say why.
- [ ] A source toggle offers **All words** and **Words I got wrong**.
- [ ] The pool size is shown and updates on every change, before anything starts.
- [ ] The run can be started in **Practice** or **Test** mode.

### Story 2 — Cap it

**As** someone with ten minutes
**I want** to say "just 15 of them, at random"
**So that** the test fits the time I have instead of the size of my lists

**Acceptance criteria**

- [ ] Chips **10 / 15 / 20** are offered, plus a number box, plus **All N**.
- [ ] A chip above the pool size is disabled, not hidden.
- [ ] The words are drawn at random from the pool, without replacement.
- [ ] Leaving it uncapped is a real choice and is what a saved test then means (D-10).

### Story 3 — Re-do it, or draw again

**As** someone who has just finished a test
**I want** either the same fifteen words again, or a different fifteen from the same pool
**So that** I can drill what I just got wrong, or check that I have not just memorised an order

**Acceptance criteria**

- [ ] The finished run knows exactly which words it used, and which list each came from.
- [ ] **Same words again** re-runs the identical set.
- [ ] **Another 15** draws a fresh sample from the same pool snapshot (D-6).
- [ ] **Practise the ones I missed** and **Study these** work exactly as they do for a list drill.
- [ ] A pool of exactly the size of the cap offers no fresh-draw button, because there is no
      different sample to draw.

### Story 4 — Keep the test

**As** someone who revises the same way every week
**I want** to save a test under a name and see how it is set up
**So that** "my weak verbs" is one tap on Sunday instead of six

**Acceptance criteria**

- [ ] The builder offers **Save this test**, which asks for a name.
- [ ] Saved tests are listed on the home screen with their configuration in words —
      "3 lists · words I got wrong · 15 of 34".
- [ ] The word count shown is computed **now**, against today's lists and today's history.
- [ ] Each row runs in either mode, and can be edited, renamed or deleted.
- [ ] Editing a saved test opens the builder pre-filled, and saving updates it in place.
- [ ] A saved test whose lists have all been deleted says so instead of failing.

### Story 5 — See it in your history, once

**As** someone who took one test over three lists
**I want** it to appear in my history as one test
**So that** my average means what it says

**Acceptance criteria**

- [ ] A multi-list run appears as **one** row in Recent practice and in Review.
- [ ] That row shows the run's total — 11 / 15 (73%) — not one list's share of it.
- [ ] The average over recent full runs counts that test **once**.
- [ ] Filtering Review by a list still finds the test, showing that list's share.
- [ ] The words missed appear in each contributing list's own missed-words chips, filed against
      the list they actually came from.

---

## Functional requirements

### The builder

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | A **Build a test** entry exists on the home screen and in the nav menu, beside **Play a game**. | HIGH |
| FR-2 | The builder lists every saved list as a multi-select with name, word count and language pair, from `listOptions`. | HIGH |
| FR-3 | The first list selected fixes the language pair; incompatible lists are disabled and state their own pair as the reason. Deselecting to zero releases it. | HIGH |
| FR-4 | A source toggle offers **All words** / **Words I got wrong** (all time, as 008 D-12). | HIGH |
| FR-5 | The pool size is displayed and recomputed on every selection change, from one `poolSize` call against one `now`. | HIGH |
| FR-6 | Length: chips 10 / 15 / 20 capped at the pool, a number box for 1…pool, and an **All N** option meaning uncapped (D-10). | HIGH |
| FR-7 | Below one word the run cannot start, and the screen says what would fix it. | HIGH |
| FR-8 | With **Words I got wrong** selected and no misses on record, the screen says so rather than showing a bare zero. | MEDIUM |
| FR-9 | Both **Practice** and **Test** start the run, and each speaks its first word from inside its own tap (D-2, NFR-2). | HIGH |
| FR-10 | The builder's own form state lives in the component, not the reducer (008 D-11). | HIGH |

### Saved tests

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11 | **Save this test** stores a `SavedTest`: a name, the `PoolSpec`, and the cap (`number \| null`). | HIGH |
| FR-12 | Saved tests appear on the home screen in their own section, below Saved lists. | HIGH |
| FR-13 | Each row states its configuration in words: how many lists, which source, and the cap. | HIGH |
| FR-14 | Each row shows how many words it would draw **right now**, computed live from today's lists and history — never a stored count (D-5). | HIGH |
| FR-15 | Each row offers **Test**, **Practice**, **Edit**, **Rename** and **Delete**, matching what `SavedLists` offers. | HIGH |
| FR-16 | **Edit** opens the builder pre-filled and saves back to the same id. | MEDIUM |
| FR-17 | A saved test whose lists have all been deleted renders with a count of 0 and an explanation, and cannot be started. It is never auto-deleted. | HIGH |
| FR-18 | Saved tests are capped at `MAX_TESTS` (50), matching `MAX_LISTS`. | LOW |

### The run

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-19 | A run carries the words it drew **with their origin list** — which is the ask's "make sure the practice itself knows which words you tried". | HIGH |
| FR-20 | The drill card shows the run's name and language pair; for a pool run the name is the test's, or "N lists" when unsaved. | HIGH |
| FR-21 | A pool run behaves identically to a list drill in every other respect: reveal, mark, quit, keyboard shortcuts, the voice warning. | HIGH |
| FR-22 | A single-list drill started from the ready screen goes through the same run path and is unchanged in behaviour and in what it stores (D-9). | HIGH |
| FR-23 | A pool run in flight survives a reload, exactly as a list drill does (002). A drill parked by an older build still restores. | HIGH |
| FR-24 | Words are drawn without replacement; no word is asked twice in one run. | HIGH |

### Results

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-25 | **Same words again** re-runs the identical set, in the same mode. | HIGH |
| FR-26 | **Another N** re-draws N words at random from the same pool snapshot (D-6), and is offered only when the pool is larger than the draw. | HIGH |
| FR-27 | **Practise the ones I missed** and **Study these** work on a pool run as they do on a list drill. | HIGH |
| FR-28 | The results header names the run, not a list. | MEDIUM |
| FR-29 | A practice-mode pool run shows the study panel and never a score, exactly as today. | HIGH |

### History

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-30 | A finished run writes one `SessionRecord` per contributing list, each carrying that list's own right and wrong pairs (D-3). | HIGH |
| FR-31 | Records from one run share a `runId`. A run with exactly one record carries **no** `runId` (D-9). | HIGH |
| FR-32 | `ScoreHistory` and `ReviewScreen` group records by `runId ?? id` and show one row per run, with the run's summed score. | HIGH |
| FR-33 | The recent-average line counts a grouped run once. | HIGH |
| FR-34 | A grouped row names its lists ("3 lists", or the test's name) and keeps the wrong-only and stopped-early labels. | MEDIUM |
| FR-35 | Filtering Review by list shows a multi-list run under each of its lists, with that list's share. Opening it shows that list's detail. | MEDIUM |
| FR-36 | A run's misses reach each contributing list's missed-words chips, filed against the list the word came from. | HIGH |

### Storage and sync

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-37 | Saved tests live in `users/{uid}/tests` when signed in and `pvt.tests.v1` when not, behind the same `ListStore` interface. | HIGH |
| FR-38 | The Firestore rules permit a user to create, update, read and delete only their own tests, with a size cap, and are covered by rules tests including the deny cases. | HIGH |
| FR-39 | `purgeUserData` deletes `tests` **and `games`**, closing the gap 008 left (see the defect note). | HIGH |

---

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | **`state/wordPool.ts` is not modified.** It was built for this caller (008 D-13, NFR-11); needing to change it to serve the second caller would mean it was not. A `PoolSpec` may be *read* anywhere; nothing is added to it. |
| NFR-2 | **Every `speak()` descends from a user gesture.** The builder's Practice / Test taps speak the first word themselves, exactly as `ReadyScreen`'s do. iOS Safari drops the rest silently. |
| NFR-3 | **The pure layer reads no clock and no `Math.random()`.** `now` and `rng` are parameters through `drillRun.ts` and the reducer, as they already are through `session.ts`, `missedWords.ts` and `wordPool.ts`. Guarded in [invariants.test.ts](src/test/invariants.test.ts). |
| NFR-4 | **One `now` per screen.** A saved-tests list showing eight live counts computes them against one millisecond, for the reason `poolSize` exists rather than a cheaper count. |
| NFR-5 | **`sessionRepo.SCHEMA_VERSION` stays at 1.** `runId` is additive and optional. Bumping it deletes every user's history, which the existing invariant already forbids. |
| NFR-6 | **No existing test is weakened.** The single-list drill, the game, and 006's review suite are the regression net for this whole change; a red test in any of them means the change is wrong. |
| NFR-7 | Colour tokens only — no hex, no `dark:` classes. [theme.test.ts](src/theme/theme.test.ts) fails a name that does not already exist in all three blocks of `index.css`. |
| NFR-8 | Every control is ≥ 44 px via `.btn`, and every disabled option states its reason rather than disappearing. |
| NFR-9 | No new runtime dependency. The project has three and a habit of not adding a fourth. |
| NFR-10 | The Firestore session query is unchanged and still bounded by `MAX_SESSION_RECORDS`. Grouping happens client-side, so a run whose records straddle the limit degrades to a smaller group rather than to a wrong number. |

---

## Edge cases

| Case | Behaviour |
|------|-----------|
| No saved lists | The builder says so and offers **New list**. |
| Pool of 0 (misses-only, nothing missed) | Explained in words (FR-8); both start buttons disabled. |
| Pool of 1 | Startable. A one-word drill is a legitimate thing to do; only the *game* needs four (008's cloud). |
| Cap larger than the pool | Clamped at draw time, and the chip was already disabled. |
| Cap equals the pool | Runs, and the results screen offers no fresh draw (FR-26) — there is no different sample. |
| Two lists share a word | One pool entry, deduped by `wordKey`. It files against the **first** selected list, which is also where its miss lands. |
| A list is edited mid-run | The run is unaffected: the pool and the session are snapshots. |
| A list is deleted mid-run | The run finishes and records normally — `listName` is denormalised on the record for exactly this. |
| A saved test's lists are all deleted | Count 0, an explanation, start disabled. Never auto-deleted (FR-17). |
| A saved test's lists no longer share a language pair | Impossible by construction: `buildWordPool` resolves ids in order and the language is taken from the first, so a later-diverging list contributes words that would not have been selectable. Guarded by re-validating the spec at run time and dropping incompatible lists, with the count reflecting it. |
| Reload mid-run | Restores, pool run or list drill alike (FR-23). A payload from an older build restores as a list drill by coercion, never by rejection (the 009 `answersOpen` precedent). |
| Nothing answered before quitting | No record written, for any list — `buildRunRecords` returns `[]`, mirroring `buildSessionRecord` returning null. |
| One list answered, another not reached | Only the lists with marks get records. A list contributing zero answered words is not in the run's history. |
| Same word right in list A, wrong in list B | Cannot happen: the pool deduped it to one entry with one origin. |
| `localStorage` full | The saved test write fails and is reported through the existing toast; the run itself is unaffected. |
| Signed out, then in | Tests follow the store like lists do. Guest tests stay on the device (D-13). |
| A record written before this feature | Group of one, by `runId ?? id` (D-4). Renders exactly as it does today. |

---

## Out of scope

Named so each is a decision rather than an omission.

- **Migrating guest saved tests into an account.** D-13.
- **A "last run" stamp on a saved test.** It would mean a write to a synced document on every
  start, to show something the review screen already shows better.
- **Scheduling, reminders or spaced repetition.** A saved test is a definition you run; when to
  run it is not this feature's question.
- **Sharing a test with another user.** There is no sharing anywhere in this app yet.
- **A misses window (day / week / month) in the builder.** 008 D-12 deferred it for the game;
  `PoolSpec.window` already exists, so adding chips later touches the picker and nothing else —
  and would then reach both screens at once, which is D-12's dividend.
- **Converging the ready screen's missed chips onto `buildWordPool`.** Still the right follow-up,
  still not this change: 006's untouched suite is the regression net for the `DrillRun` refactor,
  and rewriting its call sites in the same change would remove exactly the net that proves the
  change was safe. 008's spec said the same thing about the same code, and it was right.
- **Games reading saved tests.** A `SavedTest` is a `PoolSpec` and a cap, which is most of a
  `GameSettings` — but a game needs `MIN_POOL`, a clock and a language pair fixed at start, and
  "play my weak verbs as a game" is a feature, not a refactor.
- **A per-run detail screen for a multi-list test.** `ReviewDetail` shows one record — one list's
  share. Showing a whole run's detail in one place is a screen, and the grouped row plus the
  per-list detail already answers "what did I get wrong".

---

## Implementation note (2026-09-06)

Built on `feature/test-builder`, cut from `main` @ `5aaae6b`, in six commits following
[tasks.md](tasks.md) phase by phase. Final state: **65 test files, 1265 tests**, plus
**72 rules tests** against the emulator; typecheck, lint, build and the bundle guard all
clean (86.8 KB eager JS against a 150 KB budget). Baseline was 56 files / 1085 tests.

The Phase 2 checkpoint held: at the end of Task 10 every one of the original 1085 tests
was green through the new spine, with no behaviour changed and no existing test edited.
Task 10's one sanctioned exception — relabelling `ReviewScreen`'s rows — turned out not to
be needed either.

Six things came out differently from the plan, each for a reason worth keeping:

1. **`START_RUN` is legal from `home` as well as `testSetup`.** The plan guarded it to the
   builder, which made **Test** on a saved-test row a silent no-op — the button dispatched
   an action the reducer dropped by reference. Only the end-to-end test could catch it, and
   did; no unit suite would have. It is still refused on top of a running drill or game.

2. **A group of one keeps the percentage its record was written with**, rather than
   recomputing it from the counts. Recomputing makes D-4's promise nearly-literal instead
   of literal, and introduces a second source of truth for a number that has been stored
   since 001. The two agree for every record this app has ever written; they differ only
   where a stored `pct` disagrees with its own counts, and there the stored value is the
   one the user has been looking at.

3. **`PoolPicker` is a hook plus a component, in two files.** The plan had the component
   own the selection and report it upward through `onChange`; both screens need to *read*
   the draft, and a component owning it privately would have had to report back through an
   effect, one render late. The two files are then forced by lint: a `.tsx` exporting both
   a component and a hook breaks fast refresh, which would remount the setup screen and
   discard a half-made selection.

4. **`ReviewScreen` shows a multi-list run as a summary with each list's share beneath it**,
   and the shares are the buttons. The plan left the click target unstated; `ReviewDetail`
   shows one record, so a single button on a three-list run would have had to pick one and
   silently drop the rest.

5. **Two helpers the plan did not name**: `runListId` (so a multi-list run stores `''` for
   `Session.listId` rather than quietly naming whichever list came first) and `isRunnable`
   (one word, where the game needs four).

6. **A pre-existing flake was fixed on the way past.** `App.game.test.tsx`'s `food` fixture
   contained `water`/`water` — one pair whose columns are spelled identically — inside a
   describe block whose three assertions rest on the columns sharing no text. It failed
   about one run in six, **on `main`**, with a message pointing at the game rather than at
   the fixture (confirmed by running the suite eight times on a pristine `main` worktree:
   four failures). Now `egg`/`ei`. The same-text case is still covered in the unit suites
   for `questions`, `game` and `wordPool`, where the rng is injected and it can be pinned.

### The deletion bug

FR-39 is fixed and the guard is in place. `purgeUserData` now deletes `lists`, `sessions`,
**`games`** and `tests` before the user document, and the invariant reads the collection
paths out of `firestoreListStore.ts` and fails the build if one is missing from that array.
Removing `'games'` again — reproducing exactly what 008 shipped — turns it red.

All four new invariants were deliberately broken once and watched fail, then restored. A
guard nobody has seen fail is a guard nobody knows works.

### Still to do

**T30, the on-device pass, has not been done.** In particular:

> Build a test over two lists on a real iPhone (Safari), start it in **Test**, and confirm
> the first word is audible. Then **Another N** from the results screen — the first word of
> the new draw must be audible too, and it descends from a different tap.

No test in this suite can stand in for it. Both new start buttons and the fresh-draw button
call `speak()` synchronously inside their own handler, which is the right shape, but jsdom
cannot fail the way iOS Safari fails — silently, on one platform. The dark-mode and
200%-text checks in T30 are likewise unverified beyond the token and glyph rules the suite
enforces.

008 shipped with its equivalent step outstanding. This one is outstanding for the same
reason and should not stay that way twice.
