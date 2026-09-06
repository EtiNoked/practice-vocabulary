# Tasks: 012-navigation-shell

**Baseline:** `main` @ `bdf73d4` — **1265 tests across 64 files, all green**
**Branch:** `feature/navigation-shell`, cut from `main`
**Total:** 18 tasks across 6 phases
**Legend:** `[P]` = parallelisable with its siblings · every task ends in a runnable VALIDATE

> **TDD where there is behaviour.** Failing test (RED), minimal code (GREEN), refactor green.
>
> **No existing test may be weakened.** Navigation churn is expected and is confined to *reaching*
> a screen. If you find yourself changing what a test asserts a screen **does**, stop — that is a
> regression wearing a test edit.
>
> **The Phase 5 checkpoint is not optional.** At the end of Task 15 the whole suite is green with
> the new shell in place. Phase 6 is guards and prose and must not be started before that.

---

## Phase 1 — Foundations (Tasks 1–4)

### Task 1: NEW `src/components/icons.tsx` [P]
- **IMPLEMENT:** `plan.md` § A in full — the `Glyph` wrapper and the five exports.
- **RED FIRST** (`src/components/icons.test.tsx`):
  - every export renders an `<svg>` with `aria-hidden="true"` and `focusable="false"`
  - every one uses `stroke="currentColor"` and no hard-coded colour anywhere in the file
  - every one is `1em` square, so it scales with its label rather than with a fixed px
- **GOTCHA:** No `fill` other than `none`, and no `class` carrying a colour. The moment one glyph
  hard-codes a hex, dark mode has a second palette to maintain and 007's tokens stop being the one
  source (012 D-7).
- **GOTCHA:** `shrink-0` on the `<svg>`. These live in flex rows beside wrapping text and squash
  without it on a narrow phone.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/components/icons.test.tsx
  ```

### Task 2: EXTRACT `src/state/dayLabel.ts` [P]
- **IMPLEMENT:** `plan.md` § B — move `dayLabel` out of `ReviewScreen.tsx` **with its comment**,
  and lift the day-bucketing loop ([ReviewScreen.tsx:78-84](src/components/ReviewScreen.tsx#L78-L84))
  into `byDay`. `ReviewScreen` imports both.
- **RED FIRST** (`src/state/dayLabel.test.ts`):
  - 23:30 yesterday and 00:30 today are `Yesterday` and `Today`, not one bucket — the exact case
    the local-midnight rule exists for, and the one an elapsed-ms implementation gets wrong
  - anything older formats en-GB
  - `byDay` preserves the order given and merges only adjacent equal labels
  - `byDay` on `[]` gives `[]`
- **GOTCHA:** This is a **move**, not a rewrite. `ReviewScreen.test.tsx` must stay green without a
  single edit. If it goes red, the extraction changed behaviour.
- **GOTCHA:** No `Date.now()` inside the module — `now` is a parameter, as it is everywhere in the
  pure layer. `invariants.test.ts` has a clock guard over `state/`.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/state/dayLabel.test.ts src/components/ReviewScreen.test.tsx
  ```

### Task 3: EXTEND the state machine
- **IMPLEMENT:** `plan.md` § C — three new states, three new actions, `OPEN_REVIEW` widened with an
  optional `listId`, `CANCEL_EDIT` → `lists`, `START_RUN`'s guard → `tests`.
- **RED FIRST** (`src/state/appMachine.test.ts`):
  - `OPEN_LISTS` / `OPEN_TESTS` / `OPEN_GAMES` are legal from **every** screen, the drill included
  - `OPEN_REVIEW` with no `listId` produces a state with **no `listId` key at all** (not
    `undefined`) — `exactOptionalPropertyTypes` is on and the spread form is what satisfies it
  - `OPEN_REVIEW` with a `listId` carries it through
  - `CANCEL_EDIT` from `editing` lands on `lists`; from anywhere else it is still a no-op **by
    reference**
  - **`START_RUN` from `tests` produces `practising`** — this is the assertion that catches 012 D-9
  - `START_RUN` from `home` is now a no-op, and from `practising` or `playing` still is
- **GOTCHA:** `START_RUN` losing `'home'` is the single most likely silent break in this feature.
  [appMachine.ts:366-375](src/state/appMachine.ts#L366-L375) records that this exact guard already
  turned the Run button into a no-op once in 011, caught only end-to-end. The reducer test above is
  the cheap version of that catch; Task 14 is the expensive one.
- **GOTCHA:** Do not touch `GO_HOME`, `PRACTISE_LIST`, `NEW_LIST` or `EDIT_LIST`. They are legal
  from anywhere already and the new screens need nothing from them.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/state/appMachine.test.ts
  ```

### Task 4: NEW `src/test/navigate.ts` [P]
- **IMPLEMENT:** `plan.md` § J — `goTo(user, section)` and `goToSync(section)`.
- **GOTCHA:** Both must find the trigger by **accessible name** `/^menu$/i` and the item by
  `role: 'menuitem'`, never by class or test id. `App.test.tsx`'s existing menu tests already do
  this and are the precedent.
- **GOTCHA:** `goToSync` exists solely for `App.game.test.tsx`, which runs under fake timers with
  `fireEvent` because userEvent drives timers of its own and the two deadlock. That reason is
  written at the top of that file; do not "simplify" the sync form away.
- **VALIDATE:**
  ```bash
  npm run typecheck
  ```

---

## Phase 2 — The section screens (Tasks 5–8)

### Task 5: NEW `src/components/GameHistory.tsx`
- **IMPLEMENT:** `plan.md` § F, including the exported `gameLabel`.
- **RED FIRST** (`src/components/GameHistory.test.tsx`):
  - loading shows a `role="status"` notice and **no** empty-state prose
  - empty (not loading) says so
  - rows are newest-first even when `games` arrives unsorted — the sort is this file's job
  - day headings come from `byDay`, so a round from yesterday sits under `Yesterday`
  - a one-list round is labelled by that list; a three-list round reads `3 lists`
  - a `partial` round is marked `stopped early`
  - a round whose lists have since been deleted still renders — `listNames` is denormalised for
    exactly this, and a lookup against live lists would come back empty
- **GOTCHA:** No `groupRuns` here and no `runId`: a game **is** one record. The invariant that
  forbids components touching `runId` covers this file automatically — keep it that way.
- **GOTCHA:** No `bandBorder`. `scoreBand` takes `{ right, total, pct }`; a `GameRecord` has
  `correct`/`asked`/`points`. Renaming a stored field to reuse a border colour is not a trade worth
  making.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/components/GameHistory.test.tsx
  ```

### Task 6: ADD the practice line to `SavedLists` [P]
- **IMPLEMENT:** `plan.md` § G — the `practices` / `onOpenPractices` prop pair and the row line.
- **RED FIRST** (`src/components/SavedLists.test.tsx`, extending the existing file):
  - with neither prop, the row renders exactly as it does today — every existing assertion in that
    file stays green untouched
  - with both, a list with practices shows `5 practices · last 80%` as a **button**, and clicking it
    calls back with that list
  - `1 practice`, singular
  - a list whose `practices()` returns null shows no line and no control
- **GOTCHA:** Both props optional, and the line renders only when **both** are supplied. Several
  tests render `SavedLists` directly with no router — the same rule `onSeeAllHistory` already
  follows on `Home`.
- **GOTCHA:** A `<button>`, not an `<a>`. There is no URL (012 D-12) and a hrefless anchor is not
  keyboard-reachable.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/components/SavedLists.test.tsx
  ```

### Task 7: NEW `ListsScreen` · `TestsScreen` · `GamesScreen` [P]
- **IMPLEMENT:** `plan.md` § E — three thin screens, each a heading, a primary button and an
  existing component, in the shared `mx-auto max-w-xl … p-4` container.
- **RED FIRST** (one test file each):
  - the heading is an `<h1>` naming the section
  - the primary action has `btn-primary` and calls its callback
  - the embedded collection renders (one fixture row is enough — the collections have their own
    suites and must not be re-tested here)
- **GOTCHA:** Pass props straight through. If a section screen starts *deriving* anything —
  counting, sorting, filtering — it has taken work that belongs in `App`, where the single `now`
  lives (012 NFR-4).
- **GOTCHA:** `SavedTests` keeps `count={testPoolSize}` end to end. Dropping it turns every live
  count into a stale one with no visible symptom.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/components/ListsScreen.test.tsx src/components/TestsScreen.test.tsx src/components/GamesScreen.test.tsx
  ```

### Task 8: SEED the review filter
- **IMPLEMENT:** `ReviewScreen` takes `initialListId?: string` and seeds `useState` with it. Retitle
  the heading to **My practices** and the back button to **Home**.
- **RED FIRST** (`src/components/ReviewScreen.test.tsx`):
  - with `initialListId`, the select starts on that list and only its runs show
  - with a list id that has no records, the "no practice for this list yet" state shows — **not**
    the "no practice yet" one, which would read as deleted history
  - with `initialListId` pointing at a list absent from the options, the filter falls back to all
    lists rather than showing an empty screen with an impossible option selected
  - without it, everything is unchanged
- **GOTCHA:** A **seed**, not a controlled prop. The user must still be able to change the filter,
  and a later re-render must not yank it back. Same rule as `testSetup.initial`.
- **GOTCHA:** `listOptions` is built from the **records**, never from live lists — that is what
  keeps a deleted list's history reachable. Do not "improve" it into a lookup.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/components/ReviewScreen.test.tsx
  ```

---

## Phase 3 — The brief (Tasks 9–10)

### Task 9: REWRITE `src/components/Home.tsx`
- **IMPLEMENT:** `plan.md` § D — six props, the `Brief` type, banner + title + at-a-glance + four
  icon cards. Delete the three verb buttons, the saved-lists block, the saved-tests slot and the
  history slot.
- **RED FIRST** (`src/components/Home.test.tsx`, rewritten):
  - four cards, each a button with its section name, each calling its callback
  - the at-a-glance reports counts and the two "last" lines
  - a brief with `lastPractice: null` omits that clause entirely rather than printing `0 / 0`
  - `loading` prints no count anywhere — not `0 lists`
  - the banner slot renders when supplied and is absent when not
  - **no** `New list`, `Build a test` or `Play a game` button exists on this screen
- **GOTCHA:** The `loading` rule is not cosmetic. `0 lists` shown to a signed-in user mid-load reads
  as data loss — the reason `SavedLists`, `SavedTests` and `ReviewScreen` each carry three states
  rather than two.
- **GOTCHA:** The migration banner stays on **home**. It is an account-level notice and belongs at
  the front door, not buried in a section.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/components/Home.test.tsx
  ```

### Task 10: BUILD the brief and the per-list fold in `App`
- **IMPLEMENT:** `plan.md` § I.1 and § I.2 — `practiceByList`, `practicesFor`, `brief`.
- **RED FIRST** (`src/App.test.tsx`, new describe): a test run spanning two lists writes two records
  sharing a `runId`; **each list's line reads `1 practice`**, and the brief's last-practice line
  reads the run's own combined score, once.
- **GOTCHA:** Bucket by `listId` **first**, group **second** (012 D-5). Grouping first would have to
  decide which list a three-list run belongs to; counting raw records reports three practices for
  one test — wrong, plausible, and silent. This is the defect this whole task exists to avoid.
- **GOTCHA:** `groupRuns` sorts for you; games do not. `brief.lastGame` must sort `finishedAt`
  descending explicitly.
- **GOTCHA:** `gameLabel` is imported from `GameHistory`, not re-implemented, so the brief and the
  log cannot disagree about what a two-list round is called.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/App.test.tsx
  ```

---

## Phase 4 — The menu (Task 11)

### Task 11: REWORK `src/components/NavMenu.tsx`
- **IMPLEMENT:** `plan.md` § H — five items with icons, the `SECTION` map, `aria-current` by
  section, a hamburger glyph beside the word `Menu`.
- **RED FIRST** (`src/components/NavMenu.test.tsx`):
  - five menuitems, named Home / My lists / My tests / My games / My practices
  - `screen="editing"` marks **My lists** current; `testSetup` marks **My tests**; `playing` marks
    **My games**; `reviewDetail` marks **My practices**
  - `screen="practising"` marks **nothing** current
  - the guard still fires: with `guard="drill"`, a declined confirm neither navigates nor closes
  - the popover still carries `role="menu"`
  - the trigger's accessible name is still exactly `Menu`
- **GOTCHA:** `role="menu"` is load-bearing (012 NFR-3). `TestCard` and `StudyCard` bind
  `Space/Enter/Y/N` on `window` and stand down only while a `[role="menu"]` or `[role="dialog"]`
  exists. Without it, typing `n` with the menu open mid-drill silently marks the card wrong.
- **GOTCHA:** Leave the popover's open/close machinery alone — the `pointerdown` listener, the
  trigger exclusion, the Escape handling — **and leave the comment explaining why this is not
  shared with `AccountMenu`**. It is still true and it is still the reason.
- **GOTCHA:** The trigger keeps a text label. An icon-only trigger breaks NFR-5 and every
  end-to-end suite's `/^menu$/i` lookup at the same time.
- **VALIDATE:**
  ```bash
  npm run typecheck && npx vitest run src/components/NavMenu.test.tsx
  ```

---

## Phase 5 — Wiring and the suite (Tasks 12–15)

### Task 12: ROUTE the new screens in `App.tsx`
- **IMPLEMENT:** `plan.md` § I.3 — the three new render blocks, the shrunken `Home` call, the
  `SavedTests` block moved verbatim into `tests`, `initialListId` on `ReviewScreen`, and the four
  back-destination changes.
- **GOTCHA:** The `SavedTests` block **moves**; it does not get rewritten. Its rename prompt, its
  delete confirm, its `onRun` → `startRun(...)` wiring and its `count` prop all travel unchanged.
- **GOTCHA:** `onOpenPractices` dispatches `OPEN_REVIEW` **with** the list id. Dispatching it bare
  gives an unfiltered review screen that looks right and answers the wrong question.
- **VALIDATE:**
  ```bash
  npm run typecheck && npm run lint
  ```

### Task 13: MIGRATE `src/App.test.tsx` to the menu
- **IMPLEMENT:** Insert `await goTo(user, 'My lists')` after `renderApp()` in every test that then
  reaches for a saved list. Update the four menu tests to the new item names.
- **GOTCHA:** One helper call, nothing else. If a test needs anything **beyond** navigation to pass,
  that is a regression — fix `App.tsx`, not the test (012 NFR-6).
- **GOTCHA:** Tests that assert home's *absence* of things (`queryByRole('button', {name:/new list/i})`
  after opening review) now pass for a different reason — home no longer has that button at all.
  Retarget them at something home genuinely still owns, or they pass vacuously forever.
- **VALIDATE:**
  ```bash
  npx vitest run src/App.test.tsx
  ```

### Task 14: MIGRATE `App.game.test.tsx` and `App.test-builder.test.tsx`
- **IMPLEMENT:** `openGame()` becomes `renderApp(); goToSync('My games'); click(Play a game)`.
  `openBuilder()` becomes `renderApp(); await goTo(user, 'My tests'); click(Build a test)`.
- **GOTCHA:** `App.game.test.tsx` uses `fireEvent` under fake timers **on purpose** — userEvent
  drives timers of its own and the two deadlock. Use `goToSync` there. Do not convert that file to
  userEvent to make one helper fit.
- **GOTCHA:** The builder suite's "run a saved test again" path now starts from **My tests**. That
  path is the end-to-end proof of 012 D-9 (`START_RUN`'s guard). If it goes red, the guard is wrong
  — not the test.
- **VALIDATE:**
  ```bash
  npx vitest run src/App.game.test.tsx src/App.test-builder.test.tsx
  ```

### Task 15: **CHECKPOINT** — the whole suite, green
- **IMPLEMENT:** Nothing new. Run everything and fix what the move broke.
- **GOTCHA:** Expect the count to move only by the tests **added** in Phases 1–4. A test that
  vanished was deleted rather than migrated, and something is now untested.
- **VALIDATE:**
  ```bash
  npm run typecheck && npm run lint && npm test && npm run check:bundle
  ```

---

## Phase 6 — Guards and prose (Tasks 16–18)

### Task 16: EXTEND `src/test/invariants.test.ts`
- **IMPLEMENT:** `plan.md` § K — widen the `groupRuns` guard to name `App.tsx` as a drill-history
  surface, and add the icon guard (no icon library imported anywhere; no inline `<svg>` in a `.tsx`
  outside `icons.tsx`; every glyph `aria-hidden`).
- **RED FIRST:** Write each guard so it fails against a deliberately broken copy first. A guard that
  has never gone red is a guard that may match nothing — the vacuous-pass problem the existing file
  already tests for in two places.
- **GOTCHA:** Do **not** loosen the existing `touches runId in exactly two places` guard. Nothing in
  this feature reads `runId`; if it goes red, something did.
- **VALIDATE:**
  ```bash
  npx vitest run src/test/invariants.test.ts
  ```

### Task 17: UPDATE `README.md` [P]
- **IMPLEMENT:** Refresh the screens/navigation section: the brief, the four sections, where each
  verb now lives, and that game history is now visible.
- **VALIDATE:** read it back against the running app.

### Task 18: THE DEVICE PASS
- **IMPLEMENT:** On a real iPhone, in both themes: the four cards are tappable at thumb size; the
  menu opens, marks the right section, and its icons render at label weight; a list's practice line
  is tappable and lands on a filtered review; game history reads correctly at 375px; nothing scrolls
  horizontally.
- **GOTCHA:** Icons are the specific thing to check here. `1em` glyphs look right in jsdom
  unconditionally — jsdom does not lay out SVG at all. Only a device tells you whether they are the
  right weight beside their label.
- **VALIDATE:** manual. Record the result in `spec.md` under Status, as 011 did.

---

## Definition of done

- [ ] `npm run typecheck && npm run lint && npm test && npm run check:bundle` all green
- [ ] Home renders no collection and no create verb
- [ ] Menu: five icon'd sections, correct `aria-current`, guard intact, `role="menu"` intact
- [ ] A list row shows its practice count and opens the review filtered to it
- [ ] My games shows rounds that were previously stored and never displayed
- [ ] No file under `state/` (except the new `dayLabel.ts`), `game/`, `storage/`, `auth/` or
      `firestore.rules` appears in the diff
- [ ] Test count up by the new tests only; nothing deleted
- [ ] Task 18 recorded
