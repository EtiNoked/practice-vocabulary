# Spec: Drill Resilience & Practice/Test Modes

**ID:** 002-drill-resilience-and-modes
**Status:** DRAFT
**Created:** 2026-09-05
**Builds on:** `001-vocab-trainer`
**Feature Type:** Bug Fix (#1) + Enhancement (#2)
**Complexity:** Low-Medium

## Overview

Two requests, one shared root:

1. **The drill dies on its own.** A few seconds after starting, the test stops and the app is back
   at the main page. Reported as "not enough time to answer" — but the app has no timer at all, so
   this is a **defect**, not a pacing preference.
2. **A list should be practisable two ways.** *Practice* — hear the word, see it written, see the
   answer, move at your own pace. *Test* — today's behaviour, hidden answer and self-marking.

## Correcting the framing of request #1

The original request read as "give me more time to answer". Investigation shows there is nothing to
give more time to:

| Claim | Reality in the code |
|-------|---------------------|
| "It's too quick" | No `setTimeout`, `setInterval`, or auto-advance exists anywhere in `src/`. |
| "No time before it stops" | `PracticeCard` waits **indefinitely** for a tap. It cannot time out. |
| "Returns to the main page" | Nothing in the app can navigate home except a user click — there is no router, no `<form>`, no `location` write. |

The only mechanism that can produce this symptom is a **full page reload**. App state lives in
`useState` (`App.tsx:17`) and is never persisted, so a reload resets to
`initialState = { screen: 'home' }` (`appMachine.ts:49`). To the user that is indistinguishable from
"the test stopped and went back to the main page".

### Root-cause hypothesis (to be confirmed by Task 1)

The repository sits inside **iCloud Drive**
(`~/Library/Mobile Documents/com~apple~CloudDocs/…`), with `node_modules/` and `dist/` in-tree.
iCloud continuously touches files as it syncs. `vite.config.ts` sets **no `server.watch` options**,
so Vite's default watcher sees that churn and issues a full-page reload — `[vite] page reload …` in
the console — every few seconds while `npm run dev` is running.

This is a hypothesis with strong supporting evidence, not a confirmed diagnosis. Task 1 confirms or
refutes it in ten minutes by reproducing against `npm run preview` (a production build, no HMR
client). **The fix plan does not depend on the hypothesis being right** — see A2 below.

## User Stories

**US-1 — My drill survives an interruption**
> As someone mid-way through a 40-word test
> I want the app to put me back where I was if the page reloads
> So that a reload, a locked phone, or an accidental refresh doesn't wipe my progress

**US-2 — The dev server stops reloading under me**
> As the person developing this app
> I want `npm run dev` to reload only when I actually change a file
> So that I can use the app I'm building without it resetting every few seconds

**US-3 — I can study, not just be tested**
> As a learner meeting a list for the first time
> I want a mode that shows me the word, its spelling and its answer together
> So that I can learn the pairs before being quizzed on them

**US-4 — I choose the mode per run**
> As a learner
> I want to pick Practice or Test each time I open a list
> So that I can study first and test myself straight after, without editing anything

## Requirements

### Functional — Resilience

| # | Requirement |
|---|-------------|
| FR-1 | An in-progress session (mode, pair snapshot, order, index, revealed, marks) is persisted on every change. |
| FR-2 | On load, a persisted session younger than **24 hours** is restored to the exact card it was on. |
| FR-3 | Restoring **must not speak**. The iOS user-gesture chain is broken by a reload; the card shows a "Resumed — tap 🔊" affordance instead. |
| FR-4 | Reaching the results screen, quitting, or going home clears the persisted session. |
| FR-5 | A corrupt, stale, or unreadable persisted session is discarded silently and the app opens at home — never a crash. |
| FR-6 | Persistence failure (quota, private mode) degrades to today's in-memory behaviour. It must never block a drill. |
| FR-7 | The dev server does not reload unless a tracked source file changes. |
| FR-8 | An uncaught render error shows a recoverable fallback, not a blank page. |

### Functional — Modes

| # | Requirement |
|---|-------------|
| FR-9 | The Ready screen offers **Practice** and **Test** in place of the single Start button, with one line explaining each. |
| FR-10 | Mode is a property of the **run**, not the list. Nothing is written to the stored list; `listRepo`'s schema version is untouched. |
| FR-11 | Practice mode shows, on every card: the prompt language label, the **written** prompt word, the answer, and a replay control. |
| FR-12 | Practice mode navigates with **Next** and **Previous**. Previous is disabled on the first card. |
| FR-13 | Practice mode has **no marking and no score**. It ends with a simple completion panel. |
| FR-14 | Test mode behaviour is **unchanged** from 001 — hidden answer, reveal, Right/Wrong, score. |
| FR-15 | Both end screens offer: run again in the same mode, switch to the other mode, or go home. |
| FR-16 | Practice mode speaks the current word when the user advances (a tap, so the gesture chain holds). |

### Non-Functional

| # | Requirement |
|---|-------------|
| NFR-1 | No new runtime dependencies. `react` and `react-dom` remain the only two. |
| NFR-2 | Persisted session payload stays under ~100 KB for a 200-pair list; it shares the localStorage budget with the lists. |
| NFR-3 | Restore-on-load adds no perceptible delay to first paint. |
| NFR-4 | Every touch target stays ≥ 44 px, matching 001. |
| NFR-5 | All 172 existing tests keep passing. |

## Assumptions

| # | Assumption | Rationale |
|---|-----------|-----------|
| A1 | "Return to the main page" means the home/saved-lists screen. | It is the only screen matching that description, and the only one a reload can land on. |
| A2 | The fix must work even if the reload is *not* Vite's fault. | Session persistence (FR-1…FR-6) makes the symptom impossible whatever causes the reload — iCloud/HMR, iOS tab eviction, a memory-pressure kill, or a stray refresh. The watcher fix (FR-7) is then a developer-comfort fix rather than the load-bearing one. |
| A3 | **Practice preserves list order; Test shuffles.** | Studying benefits from the order you wrote the list in; testing must not reward positional memory. One-line change if you disagree. |
| A4 | Practice mode still speaks aloud. | "You can hear the word" was explicit in the request; it is a listening app. |
| A5 | 24 hours is the resume window. | Long enough for "I came back after dinner", short enough that a forgotten drill from last week doesn't ambush you. |
| A6 | No speech-rate control in this feature. | The original "too quick" reading turned out to be the reload bug. Adding a rate slider now would be scope creep — noted as a deferred idea below. |

## Out of Scope

- Speech rate / pitch settings (deferred — revisit if the audio genuinely reads too fast after the bug is fixed).
- A timed or hands-free auto-advancing drill.
- Typing the answer instead of self-marking.
- Spaced repetition, streaks, or cross-session statistics.
- Persisting mode per list (deliberately rejected — see FR-10).

## Acceptance Criteria

- [ ] Start a test, force a browser reload mid-drill → you land back on the same card, same score, nothing spoken until you tap.
- [ ] `npm run dev` left idle for five minutes logs **no** `[vite] page reload`.
- [ ] Practice mode shows word + answer together, Next/Previous work, no score is ever shown.
- [ ] Test mode is byte-for-byte the same experience as 001.
- [ ] Finishing or quitting a drill leaves no session in `localStorage`.
- [ ] `localStorage` disabled → both modes still run start to finish.
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` all exit 0.

## Success Metrics

1. The reported symptom cannot be reproduced, in dev or in a production build.
2. A learner can study a new list end-to-end without ever seeing a score.
3. No regression: all 001 acceptance criteria still hold.
