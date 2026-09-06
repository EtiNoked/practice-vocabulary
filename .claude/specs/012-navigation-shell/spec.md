# Spec: A navigation shell — a brief at the front, four sections behind it

**ID:** 012-navigation-shell
**Status:** PLANNED
**Created:** 2026-09-06
**Baseline:** `main` @ `bdf73d4` — 64 test files, **1265 tests, all green**
**Feature Type:** Refactor of the shell — no new stored data, no new engine, no new dependency
**Complexity:** Medium. Every individual change is small; the risk is entirely in the blast radius
across the three end-to-end suites.
**Depends on:** nothing outstanding. 011 is merged to `main`.
**Branch:** `feature/navigation-shell`, cut from `main`.

---

## The ask

> "I want to clean the UI a bit - to have in the main one just like brief - and option to go to
> tests, game, lists etc. the menu should have 'my lists; my tests; my games', for each list - you
> should also see the practices... and maybe a view for all the practices in a dedicated view. I
> also want the menu to include icons for each (test, list, etc)."

Four things: a **home screen that is a brief**, a **menu of named sections**, **practices visible
per list**, and **icons**.

---

## Where the app actually is

Two facts found while reading, and both change what this feature costs.

**Game history already exists and has never been shown.** `GameRecord`s are written by
`buildGameRecord`, stored through `store.recordGame`, and subscribed in
[App.tsx:170-176](src/App.tsx#L170-L176) — and `visibleGames` is then used for exactly one thing:
feeding `gameMissSources` into the missed-words pool. Nothing renders them. "My games" is therefore
not a new capability; it is **a screen over data the app has been faithfully collecting since 008
and never given back to the user.**

**Per-list practice history is already queryable.** `SessionRecord` carries `listId`, and
`ReviewScreen` already has a working list filter ([ReviewScreen.tsx:90-109](src/components/ReviewScreen.tsx#L90-L109))
with the subtle part solved: it **filters before grouping**, so a three-list run shows that list's
share rather than the whole run. "Practices for this list" is a route into a filter that exists, not
a query that needs writing.

What genuinely does not exist: a home screen that is not the kitchen sink, section screens, a games
view, and any icon at all.

---

## Answers taken in session

Three questions were put to the user before this was written. All three took the recommended
option, and they are D-1, D-2 and D-3 below.

---

## Decisions taken

Numbered so the plan and the tasks can cite them instead of re-arguing them.

| # | Decision | Why |
|---|---|---|
| **D-1** | **The create verbs live on their section screens, not on home.** Home is a brief: a banner slot, a title, an at-a-glance line, and four destination cards. `New list` moves to My lists, `Build a test` to My tests, `Play a game` to My games. | *(user)* The ask is "clean the UI", and a home screen carrying three verbs, two collections and a history log is the thing being complained about. Each verb now sits next to the collection it adds to, which is where a user looking for it will already be. The cost is one extra tap on `New list`, paid once per new list. |
| **D-2** | **Practices per list are a summary line on the list row, opening My practices filtered to that list.** No per-list detail screen. | *(user)* Both halves of the ask — "for each list you should see the practices" and "a view for all the practices" — fall out of **one** screen plus a seeded filter, because `ReviewScreen` already has the filter and already solved the filter-then-group subtlety. A list-detail screen would be a second history surface rendering the same records, and history surfaces are exactly where this codebase has been bitten (D-6). |
| **D-3** | **My games shows game history and offers `Play a game`.** | *(user)* Makes "My games" mean what "My lists" and "My tests" mean — a collection you own. The alternative was a menu label that promises a collection and delivers a form. And the records are already there: not showing them is a defect that has simply never been named. |
| **D-4** | **The `review` screen keeps its internal id.** Only the user-facing copy becomes "My practices". | `reviewDetail`, `OPEN_REVIEW`, `OPEN_REVIEW_DETAIL` and their tests all name `review`. Renaming the state to match a word on a button would churn a dozen files to change a string, and would leave `reviewDetail` either inconsistently named or churned too. |
| **D-5** | **The per-list summary is computed by filtering to the list and THEN grouping** — the rule [ReviewScreen.tsx:63-70](src/components/ReviewScreen.tsx#L63-L70) already writes out. | A run over three lists writes three records sharing a `runId` (011 D-3). Counting raw records would report "3 practices" for one test — a number that is wrong, plausible, and reported by nobody. Filtering first means the run collapses to the one surviving record for that list, which is its honest share. |
| **D-6** | **The summary goes through `groupRuns`, and the invariant that enforces that is extended to cover the new surface.** | [invariants.test.ts](src/test/invariants.test.ts) already fails the build if a component reaches for `runId`, and asserts `ScoreHistory` and `ReviewScreen` both route through `groupRuns`. This feature adds a **third** reader of `SessionRecord[]`. Adding it to that list is the whole reason the list exists. |
| **D-7** | **Icons are inline SVG in one module, sized `1em`, stroked in `currentColor`, `aria-hidden`, and never rendered without their text label.** No icon library, no emoji. | A library is a dependency and a bundle-guard fight ([`check:bundle`](scripts/check-bundle.mjs)) for five glyphs. Emoji render at wildly different weights across platforms and several go full-colour in dark mode, which would fight the token palette 007 built. `currentColor` at `1em` means each icon inherits the theme and the type scale for free, in both themes, with no second set of colours to maintain. |
| **D-8** | **Back goes to the owning section; "Done" after a run goes home.** Editor-cancel → My lists, ready-back → My lists, test setup → My tests, game setup → My games, review → Home. Drill results and game results → Home. | A back **stack** is the alternative, and it is a router in disguise: it needs history state, a serialisation story for the parked drill, and an answer for "back from a drill you just finished". A fixed owning section is one rule, holds no state, and cannot go stale. "Done" going home is the payoff for the brief existing — the score you just earned is the first thing on it. |
| **D-9** | **`START_RUN`'s guard moves from `home` to `tests`.** | Saved tests are run from the saved-tests list, which is moving. [appMachine.ts:366-375](src/state/appMachine.ts#L366-L375) documents that this exact guard already made the Run button a silent no-op once, caught only by the end-to-end test. Moving the collection without moving the guard reproduces that defect exactly. |
| **D-10** | **`dayLabel` is extracted from `ReviewScreen` to a shared pure module.** | Two call sites — but the counter-precedent in [NavMenu.tsx:33-41](src/components/NavMenu.tsx#L33-L41) refuses sharing because the two popovers differ in **behaviour**. These do not: it is a pure function whose whole subtlety (compare local midnights, never elapsed milliseconds) is written in a comment that must not be copied and allowed to drift. |
| **D-11** | **The end-to-end suites navigate through the real menu, via one `goTo` helper.** | ~30 tests in `App.test.tsx` do `renderApp()` and immediately click Practise, because the saved list is on home. After D-1 it is not. Rewriting 30 paths by hand invites 30 slightly different paths; one helper that drives the shipped menu means the suites keep testing the navigation instead of routing around it. |
| **D-12** | **No router, no URLs, no browser back button.** The reducer stays the whole of navigation. | The app is an installed-feeling single view with a parked drill in `localStorage`; there is no deep link anyone has asked for, and adding history entries would raise "what does back do mid-drill" — a question with no good answer and a real chance of losing a run. Out of scope, deliberately, and recorded here so it is not re-litigated. |

---

## User story

> **As** someone who keeps several word lists, a few saved tests and a game habit,
> **I want** a home screen that tells me where I stand and four clearly named places to go,
> **So that** I can find the thing I came for without reading past three collections to reach it.

---

## Functional requirements

### The brief

- **FR-1** — Home renders exactly: the migration banner slot, the title, an at-a-glance line, and
  four destination cards. No collection, no log, no create verb.
- **FR-2** — The at-a-glance line reports, each part omitted when it has nothing to say: how many
  lists, how many saved tests, the most recent practice run (label and score), and the most recent
  game (label and score). While the store is null it says nothing definite — the same rule
  `SavedLists` and `ReviewScreen` already follow, for the same reason: "no lists yet" shown to a
  signed-in user mid-load reads as data loss.
- **FR-3** — Each destination card carries its icon, its name, and routes to its section.

### The sections

- **FR-4** — **My lists**: `New list` as the primary action, then the existing `SavedLists`.
- **FR-5** — Each list row gains one line: *"N practices · last X%"*. It is a control, and
  activating it opens **My practices** already filtered to that list. A list with no practices
  shows no line and no control.
- **FR-6** — **My tests**: `Build a test` as the primary action, then the existing `SavedTests`,
  unchanged including its live counts.
- **FR-7** — **My games**: `Play a game` as the primary action, then game history — newest first,
  grouped by day, each row showing the lists played, correct-of-asked, points, and a marker when
  the round was quit early. An empty history says so; a loading one does not.
- **FR-8** — **My practices**: today's `ReviewScreen`, retitled, and honouring a list filter seeded
  by FR-5. Arriving from the menu seeds nothing and shows all lists.

### The menu

- **FR-9** — Five items: Home, My lists, My tests, My games, My practices. Each with its icon
  before its label.
- **FR-10** — `aria-current="page"` marks the section you are in, including its sub-screens: the
  editor and the ready screen belong to My lists, the builder to My tests, setup/playing/results to
  My games, and the detail view to My practices. A running drill belongs to neither and marks
  nothing.
- **FR-11** — The leave-guard is untouched: a drill, an open editor or a running game still costs a
  named confirm, and the confirm still lives in `NavMenu` because a pure reducer must not open a
  dialog.

### Navigation

- **FR-12** — Back goes to the owning section (D-8). "Done" from either results screen goes home.

---

## Non-functional requirements

- **NFR-1** — **No new dependency.** `npm run check:bundle` stays green.
- **NFR-2** — **No storage change of any kind.** No new collection, no schema version bump, no
  field added to a stored type. This feature reads what 006, 008 and 011 already write. The
  invariants that forbid a version bump stay green without being touched.
- **NFR-3** — `role="menu"` on the popover is preserved. It is load-bearing, not decorative:
  `TestCard` and `StudyCard` bind `Space/Enter/Y/N` on `window` and stand down only while a
  `[role="menu"]` or `[role="dialog"]` exists. Without it, typing `n` with the menu open mid-drill
  silently marks the card wrong.
- **NFR-4** — Every count on a screen is computed against **one** `now`, as 011 NFR-4 requires.
  The per-list practice summaries and the saved-test counts on two different screens must not
  disagree about which millisecond they were taken at.
- **NFR-5** — Icons are decorative. Every one is `aria-hidden` and every one sits beside a real text
  label, so nothing in the menu or on a card is icon-only.
- **NFR-6** — No existing test may be weakened to accommodate the move. Navigation churn is
  expected and is confined to reaching the screen; every assertion about what a screen *does* stays
  exactly as it is.

---

## Workflows

### Finding how a list has been going

1. Menu → **My lists**.
2. The row for *Lesson 3* reads "12 words · 06/09/2026" and beneath it "5 practices · last 80%".
3. Tap that line → **My practices**, filter already set to *Lesson 3*, its five runs day-grouped.
4. Tap a run → the existing `ReviewDetail`, with its "Practise these misses" route intact.

### Playing, and seeing it afterwards

1. Menu → **My games** → history of past rounds, `Play a game` at the top.
2. Play; on finishing, **Done** → home, whose at-a-glance now leads with that round.
3. Menu → **My games** → the round is the first row under "Today".

---

## Out of scope

- URL routing, deep links, browser back (D-12).
- A per-list detail screen (D-2).
- A per-game detail screen. `GameRecord.results` would support one; nobody has asked, and it is a
  clean addition later.
- Renaming or deleting game records. They are an append-only log, exactly as `SessionRecord` is.
- Migrating saved tests from guest to account (still 011 D-13).
- Any change to the drill, the game engine, the word pool, or the missed-words engine.

---

## Risks

| Risk | Mitigation |
|---|---|
| **Test churn masks a real break.** ~30 end-to-end tests change their opening moves; a genuine regression could hide in the diff. | D-11's single helper: the navigation change is one line per test, mechanically identical, so anything else in the diff is signal. Phase 5 lands the wiring and the helper together and the whole suite must be green before Phase 6 starts. |
| **`START_RUN` silently no-ops from the new screen.** | D-9, plus a reducer test asserting `START_RUN` from `tests` produces a `practising` state — the assertion that would have caught it in 011. |
| **Per-list practice counts double-count multi-list runs.** | D-5 and D-6: filter-then-group, and the existing invariant extended to name the new surface. |
| **The brief goes stale or contradicts a section.** | It is derived at render from the same `visibleRecords` / `visibleGames` / `visibleLists` the sections read, against the same `now`. Nothing is cached (NFR-4). |
