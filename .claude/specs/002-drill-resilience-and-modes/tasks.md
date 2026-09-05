# Tasks: Drill Resilience & Practice/Test Modes

**Feature ID:** 002-drill-resilience-and-modes
**Total:** 16 tasks across 5 phases
**Legend:** `[P]` = parallelisable with siblings · every task ends with a runnable VALIDATE

> **TDD is mandatory**, as in 001: write the failing test (RED), the minimal code (GREEN), then
> refactor with tests green. Baseline before starting: **172 tests across 12 files, all passing.**

> **Ship order matters.** Phases 1–2 fix the reported bug and are independently releasable. Do not
> start Phase 3 before Phase 2 is green — both touch `Session`, and doing modes second means `mode`
> is persisted from the start rather than bolted on.

---

## Phase 1 — Confirm and stop the reload (Tasks 1–3)

### Task 1: DIAGNOSE the reload — measure before changing anything
- **IMPLEMENT:** No code. Run the experiment and write the result into `spec.md` § Root-cause hypothesis.
  1. `npm run dev`, open the app, start a test, open DevTools console, leave it idle 3 minutes. Record whether `[vite] page reload …` appears and how often.
  2. `npm run build && npm run preview`, repeat. The preview server serves a production build with **no HMR client**, so a reload here means the cause is *not* Vite.
  3. If it reloads in preview too: check the console for uncaught errors, and on iOS check whether the tab is being evicted (backgrounding the app then returning).
- **WHY:** The fix in Task 2 is aimed at a hypothesis. Ten minutes of measurement decides whether it is the right target — and Phase 2 protects the user either way.
- **GOTCHA:** Reproduce on the machine and browser where the bug was seen. iCloud churn depends on the sync state of *that* clone.
- **VALIDATE:** A written yes/no answer to "does it reload under `npm run preview`?" recorded in `spec.md`.

### Task 2: CONFIGURE the Vite file watcher
- **IMPLEMENT:** Add `server.watch.ignored` for `**/node_modules/**`, `**/dist/**`, `**/.git/**`, `**/coverage/**` and `usePolling: false` to `vite.config.ts`, with the comment from `plan.md` § A1 explaining the iCloud cause.
- **GOTCHA:** Do **not** set `usePolling: true`. That is the fix for *missed* events on network drives; this problem is too many events, and polling would worsen it.
- **GOTCHA:** `vite.config.ts` also carries the Vitest config. Adding a `server` key must not disturb `test`. Run the suite to confirm.
- **NOTE:** If Task 1 showed reloads under `preview` too, still do this task — it is correct regardless — but record in `spec.md` that it is not the primary fix.
- **VALIDATE:** `npm run dev`, leave idle 5 minutes → no `[vite] page reload` in the console. `npm test` still passes 172.

### Task 3: CREATE `src/components/ErrorBoundary.tsx` [P]
- **TEST FIRST:** `src/components/ErrorBoundary.test.tsx` — a child that throws renders the fallback, not a blank tree.
- **IMPLEMENT:** Minimal class component (`getDerivedStateFromError` + `componentDidCatch` logging to `console.error`), fallback with the message and a "Start over" button that reloads. Wrap `<App/>` in `main.tsx`.
- **WHY:** No boundary exists today, so any render throw yields a blank page — bad UX and a dead end when diagnosing exactly this class of report.
- **GOTCHA:** React 19 still has no hook equivalent; a class component is required here.
- **GOTCHA:** The test will print the thrown error to stderr. That is expected — do not silence it globally.
- **VALIDATE:** `npm test -- ErrorBoundary`

---

## Phase 2 — The drill survives a reload (Tasks 4–7)

### Task 4: EXTEND `src/state/types.ts` [P]
- **IMPLEMENT:** `export type DrillMode = 'practice' | 'test'`; add `mode: DrillMode` to `Session`; add the `PersistedSession` payload interface (`schemaVersion`, `savedAt`, `screen`, `list`, `session`).
- **GOTCHA:** Adding a required field to `Session` breaks every existing `createSession` call and test fixture. That is intended — the compiler is enumerating the work. Expect `npm run typecheck` to fail loudly until Task 8.
- **VALIDATE:** `npm run typecheck` fails **only** with missing-`mode` errors and no other category.

### Task 5: CREATE `src/storage/sessionRepo.ts` + tests
- **TEST FIRST:** `src/storage/sessionRepo.test.ts`
- **IMPLEMENT:** `save(state)`, `load()`, `clear()` against key `pvt.session.v1`, `SCHEMA_VERSION = 1`, 24-hour TTL. Mirror `listRepo`'s contract exactly: reads are total and return `null` on any failure; writes return `WriteResult`.
- **GOTCHA:** Store the **whole `WordList` inside the payload**, not a `listId` reference. A drill must survive its source list being deleted — the in-memory session already snapshots pairs (`session.ts:42`); persistence must not reintroduce the dangling reference.
- **GOTCHA:** Every failure mode returns `null`: absent key, malformed JSON, wrong `schemaVersion`, `savedAt` older than 24 h, storage disabled. Assert each one separately — this is the same discipline as `listRepo`'s `read()`.
- **GOTCHA:** `save()` must swallow a quota throw and return `{ok:false, reason:'quota'}`. It must never propagate — a full disk cannot be allowed to kill a drill.
- **VALIDATE:** `npm test -- sessionRepo`

### Task 6: WIRE persistence into `App.tsx`
- **TEST FIRST:** extend `src/App.test.tsx` — **this is the regression test for the reported bug**: start a drill, advance a card, unmount, remount, assert the same card index is rendered.
- **IMPLEMENT:** Restore in the `useState` initialiser (`useState(() => sessionRepo.load() ?? initialState)`). In `act()`, after `setState(next)`: save when `next.screen === 'practising'`, otherwise `clear()`.
- **GOTCHA:** Persist inside `act()`, not in a `useEffect`. An effect fires a render later, so a reload landing in that gap loses the card — which is the exact defect being fixed.
- **GOTCHA:** Use the lazy initialiser form. Calling `sessionRepo.load()` directly as the argument runs it on every render.
- **GOTCHA:** `QUIT` routes to `results`, so the `else` branch clears storage. Verify explicitly that quitting leaves no key behind (FR-4).
- **VALIDATE:** `npm test -- App`

### Task 7: IMPLEMENT gesture-safe restore
- **TEST FIRST:** in `App.test.tsx` — after a restore, assert the speech stub's `speak` was **not** called, and that the resumed hint is in the document.
- **IMPLEMENT:** A `resumed` flag set when state came from storage. Pass it to the card, which renders "Resumed — tap 🔊 to hear the word again". Clear the flag on the first user action.
- **WHY:** A restore has no user gesture in scope, so iOS Safari would silently drop an auto-speak — it would look fine on desktop Chrome and be broken on the phone this app is actually used on (`tts.ts:112`).
- **GOTCHA:** Do **not** add a mount effect that speaks. This is 001's single most important constraint and the reason `PracticeCard` has no such effect today.
- **VALIDATE:** `npm test -- App` — the "does not speak on restore" assertion passes.

---

## Phase 3 — Modes in the domain (Tasks 8–10)

### Task 8: EXTEND `src/state/session.ts` + tests
- **TEST FIRST:** `src/state/session.test.ts`
- **IMPLEMENT:** `createSession(pairs, rng, listId, mode)`. `test` shuffles as today; `practice` preserves list order. `restartShuffled` / `restartWrongOnly` carry `mode` through.
- **GOTCHA:** Do not drop the `rng` parameter for practice — keep the signature uniform and simply leave it unused, so callers need no mode-awareness.
- **GOTCHA:** Assert `score()` on a practice session returns `total: 0`, `pct: 0` — correct, and never displayed (`plan.md` § Domain model).
- **VALIDATE:** `npm test -- session`

### Task 9: EXTEND `src/state/appMachine.ts` + tests
- **TEST FIRST:** `src/state/appMachine.test.ts`
- **IMPLEMENT:** `START` gains `mode`. New `NEXT`, `PREV`, `SWITCH_MODE`. Guard `REVEAL` and `MARK` to `session.mode === 'test'`.
- **GOTCHA:** `NEXT` past the last card transitions to `results` — the same boundary `MARK` already handles via `isFinished` (`appMachine.ts:98`).
- **GOTCHA:** `PREV` floors at index 0; it must never produce a negative index.
- **GOTCHA:** Out-of-mode actions return the state **unchanged by reference**, matching the machine's existing contract (`appMachine.ts:53`) — not a thrown error, and not a cloned object.
- **GOTCHA:** `SWITCH_MODE` builds a fresh session from `state.list.pairs`, not from the finished session's order.
- **VALIDATE:** `npm test -- appMachine`

### Task 10: VERIFY the whole domain layer is green
- **IMPLEMENT:** No new code. Fix the fallout from Task 4's `mode` field across every remaining test fixture and call site.
- **VALIDATE:** `npm run typecheck && npm run lint && npm test` — all exit 0, ≥ 172 tests passing.

---

## Phase 4 — UI (Tasks 11–15)

### Task 11: RENAME `PracticeCard` → `TestCard`
- **IMPLEMENT:** `git mv src/components/PracticeCard.tsx src/components/TestCard.tsx` and the same for its test. Rename the component and update imports in `App.tsx`.
- **WHY:** Broken windows. A `PracticeCard` that renders *test* mode, shipped alongside a real practice mode, is a naming trap that will mislead every future reader. Fix it now, mechanically, with 172 green tests as the net.
- **GOTCHA:** Commit this rename **on its own**, before any behaviour change, so the diff stays reviewable.
- **VALIDATE:** `npm test` — same count as before the rename, no failures.

### Task 12: UPDATE `src/components/ReadyScreen.tsx`
- **TEST FIRST:** assert both buttons exist and fire `START` with the right mode.
- **IMPLEMENT:** Replace Start with **Practice** and **Test**, each with a one-line description ("Hear it, see it, see the answer" / "Hear it and answer from memory"). Keep Save and Back.
- **GOTCHA:** Both buttons are the gesture that starts their mode's first utterance — the comment at `ReadyScreen.tsx:24` applies to both and must be kept accurate.
- **GOTCHA:** Touch targets stay ≥ 44 px (`min-h-14`), per NFR-4.
- **VALIDATE:** `npm test -- ReadyScreen`

### Task 13: CREATE `src/components/StudyCard.tsx` + tests
- **TEST FIRST:** `src/components/StudyCard.test.tsx` — word and answer both visible without interaction; Previous disabled on card 1; **no Right/Wrong buttons in the document**; replay calls `speak`.
- **IMPLEMENT:** Position counter, prompt-language label, written prompt word, answer, "Hear it again", Previous / Next, Quit. Keyboard: Space replays, `→`/Enter next, `←` previous.
- **GOTCHA:** Register the keydown effect with **no dependency array**, mirroring `TestCard`. With `index` captured in the closure, a `[]` array would freeze the handler on card 1 and every arrow press would navigate from the wrong card.
- **GOTCHA:** No tally, no score, not even a hidden one (FR-13).
- **GOTCHA:** `preventDefault()` on the arrow keys so the page does not scroll under the card.
- **VALIDATE:** `npm test -- StudyCard`

### Task 14: UPDATE `src/components/ResultsScreen.tsx`
- **TEST FIRST:** a practice session renders no percentage; a test session renders today's score panel unchanged.
- **IMPLEMENT:** Branch on `session.mode`. Practice → "You went through all N words" plus Practice again / Test yourself / Done. Test → existing score panel plus a "Practise these" button.
- **GOTCHA:** Never call `score()` down the practice branch. It returns `total: 0` and rendering "0%" after a completed study run would be actively misleading.
- **VALIDATE:** `npm test -- ResultsScreen`

### Task 15: WIRE the modes through `App.tsx`
- **TEST FIRST:** `App.test.tsx` — a full practice run (Practice → Next ×N → completion panel) and a full test run, both end to end.
- **IMPLEMENT:** Route `practising` on `session.mode` to `StudyCard` or `TestCard`. Add the `NEXT`/`PREV`/`SWITCH_MODE` handlers. Add `NEXT` and `SWITCH_MODE` to the `advances` list in `act()` so the new card is spoken.
- **GOTCHA:** `PREV` must also speak — moving back a card should say that card's word. Include it in `advances`.
- **GOTCHA:** Keep computing the next state **once** and speaking from that same object (`App.tsx:66` explains why: computing twice re-runs the shuffle and the spoken word would differ from the card shown).
- **VALIDATE:** `npm test -- App`

---

## Phase 5 — Validation (Task 16)

### Task 16: FULL regression + manual QA
- **IMPLEMENT:** Run the whole gate, then the manual script below.
  - [ ] Test mode start → finish behaves exactly as in 001.
  - [ ] Practice mode: word + answer visible, Next/Previous work, no score anywhere.
  - [ ] **Reload mid-drill (Cmd-R) → same card, same score, nothing spoken until tapped.**
  - [ ] Finish a drill, reload → lands at home, no session key in `localStorage`.
  - [ ] Quit a drill, reload → lands at home, no session key.
  - [ ] Disable `localStorage` (Safari private mode) → both modes still run start to finish.
  - [ ] `npm run dev` idle 5 minutes → no page reload.
  - [ ] iOS Safari: speech works in both modes; restore does not auto-speak.
- **GOTCHA:** The iOS pass cannot be automated — jsdom has no speech synthesis and the gesture rule is a real-device behaviour. Do it by hand on the device the bug was reported from.
- **VALIDATE:** `npm run typecheck && npm run lint && npm test && npm run build` — all exit 0, every box ticked.
