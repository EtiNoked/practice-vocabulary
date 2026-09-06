# Tasks: 008-word-game

**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)

Ordered so the **shared selector** lands before the game that uses it, the pure engine is finished
and tested before any component exists, and storage and rules land before the screens that write
through them. Phase 1 is deliberately not game code at all (spec D-13). **Every phase ends green** — `npm run
typecheck && npm run lint && npm test` must pass before starting the next one.

**Baseline to beat:** 45 test files, 810 tests, all green (`main` @ `84f258a`).
**Branch:** `feature/word-game`, cut from `main`.

**Read before starting:** [plan.md](plan.md) end to end, then
[missedWords.ts](src/state/missedWords.ts) (all of it — `wordPool` sits on top of it),
[session.ts](src/state/session.ts),
[sessionRecord.ts](src/state/sessionRecord.ts), [sessionRepo.ts](src/storage/sessionRepo.ts),
[App.tsx:224-360](src/App.tsx#L224-L360) (the `act` / `speakCurrent` pair), and
[tts.ts:1-20](src/speech/tts.ts#L1-L20).

---

## Phase 1 — Shared foundations

Nothing game-specific here. Two small widenings of landed code, then **the generic selector the
whole feature is built on** (spec D-13). It ships before the game so it cannot quietly acquire
game vocabulary while nobody is looking.

### T1.1 UPDATE `src/state/missedWords.ts` — add `MissSource`, widen two signatures

- **IMPLEMENT:** Export the `MissSource` interface from plan.md § The 006 widening. Change
  `collectMissed(records: readonly SessionRecord[], …)` and `missedCounts(...)` to take
  `readonly MissSource[]`. **No logic changes.**
- **GOTCHA:** `SessionRecord` satisfies `MissSource` structurally, so no call site changes. If
  any does, something else is wrong — stop and re-read rather than adapting the call site.
- **GOTCHA:** first task on purpose. `wordPool` (T1.3) takes `MissSource[]`, and every later
  phase reads through it.
- **VALIDATE:** `npx vitest run src/state/missedWords.test.ts src/App.test.tsx` — 006's suite
  must pass **unmodified**. It is the regression net for this change (R5).

### T1.2 UPDATE `src/state/session.ts` — export `shuffle`

- **IMPLEMENT:** Change `function shuffle` to `export function shuffle`. Nothing else.
- **PATTERN:** It is already Fisher-Yates over an injected `Rng`
  ([session.ts:24](src/state/session.ts#L24)).
- **GOTCHA:** Do **not** write a second shuffle anywhere. One shuffle in the codebase. Add a line
  to its doc comment saying it is now shared, so nobody re-privatises it.
- **VALIDATE:** `npx vitest run src/state/session.test.ts`

### T1.3 CREATE `src/state/wordPool.ts` + `wordPool.test.ts` — **the generic selector**

The piece the user asked to be reusable. Read plan.md § The shared word selector in full first.

- **IMPLEMENT:** `PoolSource`, `PoolSpec`, `PooledWord`, `PoolContext`, `PoolListOption`, and
  `buildWordPool`, `poolSize`, `poolLanguages`, `listOptions`, `toPairs` — exactly the API in the
  plan, and exactly that much (R9).
- **PATTERN:** [missedWords.ts](src/state/missedWords.ts) — same directory, same discipline: pure,
  total, `now` injected, every non-obvious decision carrying the reason in a comment.
- **IMPORTS:** `collectMissed`, `wordKey`, types `MissSource` / `ReviewWindow` from
  `./missedWords`; `WordList` / `WordPair` from `./types`; `LangCode` from `../lang/languages`.
- **GOTCHA (NFR-11):** **no import from `src/game/`, ever.** No `count`, no sampling, no points,
  no `Question`. If a signature needs one of those, it belongs to the caller. T7.1 fails the build
  if this slips.
- **GOTCHA:** `collectMissed` filters on ONE `listId`
  ([missedWords.ts:122](src/state/missedWords.ts#L122)). Call it **once per selected list** and
  union the results. Do **not** reimplement the still-missed rule across several lists — there is
  one implementation of it in this codebase and this must not become the second.
- **GOTCHA:** dedupe precedence follows selection order, so resolve `listIds` in order and do not
  sort.
- **GOTCHA:** re-mint ids from `idPrefix` — ids from different lists carry no distinctness
  guarantee ([missedWords.ts:206](src/state/missedWords.ts#L206) explains the class of bug).
- **DO NOT:** touch `toDrillPairs` or 006's call sites. The convergence is a follow-up, and doing
  it here would remove T1.1's regression net (plan.md § Relationship to `toDrillPairs`).
- **TESTS:**
  - `buildWordPool`: empty `listIds` → `[]`; a `listId` absent from `lists` is skipped, not thrown
    on; `source: 'all'` returns every pair; `source: 'missed'` matches what 006 returns per list;
    an explicit `window` is honoured and the default is `'all'`.
  - Two lists sharing a word → one entry, carrying the **first** selected list's `listId` and
    `listName`; reversing `listIds` reverses which one wins.
  - Ids are `w0…wN`, unique, and honour `idPrefix`.
  - Blank-on-either-side pairs dropped.
  - `poolSize` equals `buildWordPool(...).length` for a dozen fixtures — the property, not a
    recomputation.
  - `poolLanguages`: null on empty; the first list's pair otherwise.
  - `listOptions`: all selectable when nothing is selected; incompatible lists `blocked:
    'language'` once one is; deselecting everything releases the block (FR-4); a selected list is
    always `selectable`.
  - `toPairs` drops the origin and keeps the ids.
  - **Genericity, asserted as a test:** the module's source contains no occurrence of `game`,
    `question`, `points` or `count` (a cheap source scan in the same spirit as
    [invariants.test.ts](src/test/invariants.test.ts)).
- **VALIDATE:** `npx vitest run src/state/wordPool.test.ts`

**PHASE GATE:** `npm run typecheck && npm run lint && npm test`

---

## Phase 2 — The game engine (`src/game/`)

No React, no store, no clock, no `Math.random()`. Everything injected (NFR-1). The pool is now a
solved problem — this phase consumes `PooledWord[]` and never asks where it came from.

### T2.1 CREATE `src/game/types.ts`

- **IMPLEMENT:** `GameSettings` (embedding a `PoolSpec`), `Question`, `Answer`, `Verdict`, `Game`,
  `GameScore`, `GameRecord`, plus the seven constants from plan.md § Constants.
- **PATTERN:** [state/types.ts](src/state/types.ts) — every non-obvious field carries a comment
  saying why it exists, not what it is. The plan's type block already has the text.
- **GOTCHA:** there is no `GameWord`. Words are `PooledWord` from `../state/wordPool`, one shape
  with one name; a game-local alias would invite the two to drift.
- **GOTCHA:** `exactOptionalPropertyTypes` is on. An optional field is omitted with a conditional
  spread, never set to `undefined` ([sessionRecord.ts:46](src/state/sessionRecord.ts#L46)).
- **VALIDATE:** `npm run typecheck`

### T2.2 CREATE `src/game/questions.ts` + `questions.test.ts`

- **IMPLEMENT:** `buildQuestions(pool, count, rng)` and `pickDistractors(pool, word, rng)` per
  plan.md § questions.ts.
- **IMPORTS:** `shuffle`, type `Rng` from `../state/session`; `PooledWord` from
  `../state/wordPool`.
- **GOTCHA (FR-13):** distractors are distinct from the answer and from each other by
  **normalised displayed text**, not by id. Export `wordKey`'s `fold` from `missedWords.ts` and
  use it — do not hand-roll a second normaliser.
- **GOTCHA:** sampling lives here, never in `wordPool` (NFR-11). This is the module that knows
  what "how many" means.
- **TESTS (all with `seededRng`):** no word asked twice; `count > pool.length` clamps; each
  question has `min(CLOUD_SIZE, pool.length)` options; the answer is always among them; no two
  options share a normalised `col1`; a pool where 20 words share one `col1` yields a short cloud
  rather than duplicates; over 200 seeded questions the answer's index is spread across all
  positions (FR-14).
- **VALIDATE:** `npx vitest run src/game/questions.test.ts`

### T2.3 CREATE `src/game/scoring.ts` + `scoring.test.ts`

- **IMPLEMENT:** `pointsFor`, `displayedSeconds` (an alias — `export const displayedSeconds =
  pointsFor`), `remainingMs`, `scoreGame`.
- **GOTCHA (NFR-4, R2):** the alias is the whole mechanism. Two functions that "agree" will drift.
- **TESTS:** the four rows of plan.md's rounding table, the ask's own 3 s → 7 example by name;
  negative and over-max remaining clamp; `MAX_POINTS === QUESTION_MS / 1000`;
  `expect(displayedSeconds).toBe(pointsFor)`; `scoreGame` over a mixed `answers` array;
  `available === asked * MAX_POINTS`.
- **VALIDATE:** `npx vitest run src/game/scoring.test.ts`

### T2.4 CREATE `src/game/game.ts` + `game.test.ts`

- **IMPLEMENT:** `createGame(settings, pool, rng)`, `currentQuestion`, `answer`, `timeOut`,
  `advance`, `isFinished`, `replay` per plan.md's transition table.
- **PATTERN:** [session.ts](src/state/session.ts) — pure, total, always returns a new object,
  never mutates.
- **GOTCHA (R6):** `answer` and `timeOut` are **no-ops when `game.verdict !== null`**. Without
  that, a double-tap appends two answers to one question.
- **GOTCHA (D-9):** `replay` re-samples from `game.pool` — it must never reach for lists or
  records. That it *can't* is the point of the pool being carried in the state.
- **TESTS:** a correct answer banks `pointsFor(remainingMs)` and a wrong one banks 0; `answer`
  does not advance `index`; `advance` clears the verdict; `isFinished` past the last question;
  double-tap appends one answer; `timeOut` records `remainingMs: 0`; `replay` keeps `settings`
  and `pool` identical and produces a different question order under a different seed; every
  function returns a new object and leaves its input untouched.
- **VALIDATE:** `npx vitest run src/game/game.test.ts`

### T2.5 CREATE `src/game/gameRecord.ts` + `gameRecord.test.ts`

- **IMPLEMENT:** `buildGameRecord(game, { partial, now?, id? })` and `gameMissSources(record)`.
- **PATTERN:** [sessionRecord.ts](src/state/sessionRecord.ts) — including returning `null` when
  nothing was answered, and the `id` / `now` injection for testability.
- **GOTCHA (D-10):** every emitted `MissSource` carries **both** `wrongPairs` and `rightPairs`.
  Omitting `rightPairs` would set 006's `degraded` flag and put a "recorded before right answers
  were saved" warning on a screen where it is false.
- **GOTCHA:** a record whose `results` were shed under quota pressure yields `[]`, not a throw.
- **GOTCHA (R4):** the `listId` on each `PooledWord` is what files a verdict against the right
  list. It arrived from `buildWordPool` and must be carried through untouched.
- **TESTS:** nothing answered → `null`; a 12-answer game across 3 lists → 3 miss sources with the
  right words in the right ones; `finishedAt` comes from `now`; `partial` passes through; every
  source has `rightPairs` defined; **an end-to-end case**: build a record, run `gameMissSources`
  through `collectMissed`, and assert the missed words are exactly the game's misses — and that a
  word answered correctly in a later game drops back out.
- **VALIDATE:** `npx vitest run src/game/gameRecord.test.ts`

**PHASE GATE:** `npm run typecheck && npm run lint && npm test`

---

## Phase 3 — Storage and rules

### T3.1 CREATE `src/storage/gameRepo.ts` + `gameRepo.test.ts`

- **IMPLEMENT:** `GAME_STORAGE_KEY = 'pvt.games.v1'`, `SCHEMA_VERSION = 1`,
  `MAX_GAME_RECORDS = 100`, `DETAIL_KEEP`, and `{ getAll, add, clear }`.
- **PATTERN:** [sessionRepo.ts](src/storage/sessionRepo.ts) — near line-for-line, including the
  total read, the `WriteResult` write, and the quota retry that sheds `results` before history.
- **GOTCHA:** never bump `SCHEMA_VERSION` — a mismatch returns `[]`, which deletes the user's
  history ([invariants.test.ts:73](src/test/invariants.test.ts#L73)).
- **TESTS:** absent key / bad JSON / wrong version / storage disabled all → `[]`; cap at
  `MAX_GAME_RECORDS`, newest kept; a `QuotaExceededError` retries without `results` on the older
  records; a `SecurityError` does **not** retry.
- **VALIDATE:** `npx vitest run src/storage/gameRepo.test.ts`

### T3.2 UPDATE `src/storage/types.ts` — two methods on `ListStore`

- **IMPLEMENT:** `subscribeGames(onChange, onError)` and `recordGame(record)` per plan.md.
- **GOTCHA:** no `listId` parameter on `subscribeGames`, unlike `subscribeSessions` — a game spans
  lists. Say so in the doc comment.
- **VALIDATE:** `npm run typecheck` — expect three failures (the three stores). That is the
  interface doing its job; T3.3–T3.5 clear them.

### T3.3 UPDATE `src/storage/localListStore.ts`

- **IMPLEMENT:** `gameSubs`, `emitGames`, and the two methods wrapping `gameRepo`.
- **PATTERN:** the `sessionSubs` / `emitSessions` / `recordSession` trio directly above
  ([localListStore.ts:29](src/storage/localListStore.ts#L29)).
- **GOTCHA:** `dispose()` clears subscriptions only. It must never clear `localStorage` — the
  comment at [localListStore.ts:92](src/storage/localListStore.ts#L92) explains why.
- **VALIDATE:** `npx vitest run src/storage/localListStore.test.ts`

### T3.4 UPDATE `src/storage/memoryStore.ts`

- **IMPLEMENT:** the same two, over an in-memory array, cloning on emit like the others do.
- **PATTERN:** [memoryStore.ts:39](src/storage/memoryStore.ts#L39).
- **GOTCHA:** it is a first-class implementation, not a stub — every other test inherits its
  behaviour. Pin the new subscription in `memoryStore.test.ts` as the session one is pinned.
- **VALIDATE:** `npx vitest run src/storage/memoryStore.test.ts`

### T3.5 UPDATE `src/storage/firestoreListStore.ts`

- **IMPLEMENT:** a `gamesPath`, `subscribeGames` via `onSnapshot` on
  `query(collection, orderBy('finishedAt','desc'), limit(MAX_GAME_RECORDS))`, and `recordGame`
  via `setDoc` with `stripUndefined`.
- **PATTERN:** `subscribeSessions` / `recordSession`
  ([firestoreListStore.ts:119](src/storage/firestoreListStore.ts#L119)).
- **GOTCHA (NFR-10):** the `limit` is not optional. An unbounded subscription makes two devices
  disagree about how much history exists, and so about which words are still missed — the exact
  reason the session query was bounded.
- **GOTCHA:** `stripUndefined` is mandatory; Firestore throws on an undefined field value.
- **VALIDATE:** `npm run typecheck && npm run lint`

### T3.6 UPDATE `firestore.rules` + `tests/rules/firestore.rules.test.ts`

- **IMPLEMENT:** the `match /games/{gameId}` block from plan.md § firestore.rules.
- **PATTERN:** the `sessions` block immediately above ([firestore.rules:52](firestore.rules#L52)),
  including `allow update: if false`.
- **GOTCHA:** the file's own header requires a **deny** test beside every allow test. Cover:
  another user cannot read or create; `finishedAt` as a string is rejected; an over-cap `results`
  is rejected; an update to an existing game is rejected; the owner's well-formed create succeeds.
- **VALIDATE:** `npm run test:rules` (needs the Firestore emulator and JDK 21+)

### T3.7 UPDATE `tests/rules/firestoreListStore.test.ts`

- **IMPLEMENT:** round-trip a `GameRecord` through the real adapter against the emulator.
- **PATTERN:** the existing session round-trip in that file.
- **VALIDATE:** `npm run test:rules`

**PHASE GATE:** `npm run typecheck && npm run lint && npm test && npm run test:rules`

---

## Phase 4 — The state machine

### T4.1 UPDATE `src/state/appMachine.ts` + `appMachine.test.ts`

- **IMPLEMENT:** the three `AppState` members and eight actions from plan.md § The state machine.
  `REPLAY_GAME` uses the `rng` `reduce` already takes.
- **PATTERN:** the existing guard style — an action on the wrong screen returns `state` **by
  reference** ([appMachine.ts:101](src/state/appMachine.ts#L101)).
- **GOTCHA:** `ADVANCE` past the last question routes to `gameResults`, mirroring how `MARK` and
  `NEXT` cross `isFinished` ([appMachine.ts:190](src/state/appMachine.ts#L190)).
- **GOTCHA:** `NEW_GAME` carries the finished game's `settings` into `gameSetup.initial` (FR-27).
- **TESTS:** every transition in the diagram; every action from a wrong screen returns the same
  object (`toBe`, not `toEqual`); `REPLAY_GAME` under two seeds gives two orders and the same
  `settings` and `pool`; `QUIT_GAME` from mid-game lands on results holding the answers so far.
- **VALIDATE:** `npx vitest run src/state/appMachine.test.ts`

### T4.2 UPDATE `src/components/NavMenu.tsx` + its test

- **IMPLEMENT:** `'game'` in the `guard` union with its own `CONFIRM` sentence, and a **Game**
  menu item calling a new `onGame` prop.
- **PATTERN:** the `drill` guard and the `Review` item already there
  ([NavMenu.tsx:19](src/components/NavMenu.tsx#L19)).
- **TESTS:** leaving a game prompts and stays put on cancel; `aria-current` marks the game screens.
- **VALIDATE:** `npx vitest run src/components/NavMenu.test.tsx`

**PHASE GATE:** `npm run typecheck && npm run lint && npm test`

---

## Phase 5 — The screens

### T5.1 CREATE `src/components/GameSetup.tsx` + `GameSetup.test.tsx`

- **IMPLEMENT:** plan.md § GameSetup. Component-owned `selected` / `source` / `count` (D-11),
  seeded from an optional `initial`.
- **GOTCHA (D-13):** the rows, their disabled state and the language line come from
  `listOptions` and `poolLanguages`, and the live count from the `count(spec)` prop. This screen
  **renders** the one-language-pair rule; it must not re-derive it. A second picker that decides
  compatibility slightly differently is precisely what putting the rule in `wordPool` prevents.
- **PATTERN:** [ReadyScreen.tsx](src/components/ReadyScreen.tsx) for the container, the chip row
  and the disabled-with-a-reason idiom; [ListEditor](src/components/ListEditor.tsx) for owning
  form state and emitting a finished value.
- **GOTCHA (NFR-2):** **Start game** must speak the first word from inside its own tap. Do not
  make it navigate and let something else speak later.
- **GOTCHA (R8):** memoise the count on `listIds` and `source` only — a `PoolSpec` has no `count`
  in it, so passing the whole settings object would rebuild the pool on every keystroke.
- **TESTS:** no lists → the empty state; selecting a list disables the incompatible ones and names
  their pair; deselecting all re-enables everything; the pool count updates on every change;
  chips above the pool are disabled; the **All N** chip appears only when needed; the number box
  clamps; below `MIN_POOL` start is disabled with the reason; misses-only with no misses shows the
  FR-10 sentence; `onStart` emits the exact settings chosen; `initial` pre-fills.
- **VALIDATE:** `npx vitest run src/components/GameSetup.test.tsx`

### T5.2 CREATE `src/components/GameCloud.tsx` + `GameCloud.test.tsx`

The hardest file in the feature. Re-read plan.md § The audio gesture chain and § The clock first.

- **IMPLEMENT:** header (`n / total`, points, Quit), the countdown ring, **Hear it again**
  (FR-16), the tile grid, and the `role="status"` verdict line.
- **PATTERN:** [TestCard.tsx](src/components/TestCard.tsx) for the drill-card header and quit
  affordance; `speakCurrent` / `act` ([App.tsx:224-334](src/App.tsx#L224-L334)) for the
  compute-next-once-then-speak-from-it discipline.
- **GOTCHA (R1, NFR-2):** `speak` for the next word is called **synchronously inside the tile's
  onClick**, before the `setTimeout` that advances the visual. The timeout branch speaks
  **nothing** — it renders **Next word**, and that tap speaks. Put the reason in a comment; the
  next person to "simplify" this will otherwise auto-advance the timeout and break iOS silently.
- **GOTCHA (NFR-3):** remaining time is `deadline - Date.now()`, never an accumulator.
- **GOTCHA (NFR-7):** the ticking digit is `aria-hidden`; give the timer a static sr-only
  description. Never a live region.
- **GOTCHA (NFR-8):** drive the ring with an inline `stroke-dashoffset`, not a CSS animation —
  `prefers-reduced-motion` zeroes animation durations globally
  ([index.css:284](src/index.css#L284)) and would freeze a CSS ring at full.
- **GOTCHA (R3):** `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`. Assert behaviour
  at a time, never the tick itself; the arithmetic is already covered in `scoring.test.ts`.
- **TESTS:** the first word is spoken on mount-after-start; a correct tap shows the right verdict
  and advances after `VERDICT_MS`; a wrong tap shows all three FR-19 channels; tiles are disabled
  during a verdict and a second tap changes nothing; a timeout shows the answer, does **not**
  auto-advance, and calls `speak` **zero** times until **Next word** is tapped; **Hear it again**
  re-speaks without touching the deadline; Quit calls `onQuit`.
- **VALIDATE:** `npx vitest run src/components/GameCloud.test.tsx`

### T5.3 CREATE `src/components/GameResults.tsx` + `GameResults.test.tsx`

- **IMPLEMENT:** plan.md § GameResults.
- **PATTERN:** [ResultsScreen.tsx](src/components/ResultsScreen.tsx); `bandBorder`
  ([scoreBand.ts:51](src/state/scoreBand.ts#L51)) takes a `Pick<>`, so pass
  `{ right: correct, total: asked, pct }` and change nothing there.
- **GOTCHA:** a partial (quit) game must say so rather than presenting a short game as a full one.
- **TESTS:** counts and points render; missed words listed with both sides; a clean sweep shows no
  empty "missed" section; the three buttons fire their callbacks; a partial game is labelled.
- **VALIDATE:** `npx vitest run src/components/GameResults.test.tsx`

**PHASE GATE:** `npm run typecheck && npm run lint && npm test`

---

## Phase 6 — Wiring

### T6.1 UPDATE `src/App.tsx`

- **IMPLEMENT:**
  - `games` state + a `subscribeGames` `useLayoutEffect`, mirroring the sessions one
    ([App.tsx:149](src/App.tsx#L149)), and a `visibleGames` derivation beside `visibleRecords`.
  - `missSources = useMemo(() => [...visibleRecords, ...visibleGames.flatMap(gameMissSources)], …)`
    and pass it to `missedForReady` and `pickWindow`.
  - Supply `GameSetup`'s `count` prop as `spec => poolSize(visibleLists, spec, { records: missSources, now })`.
  - Build the `Game` on start (`buildWordPool` → `createGame`) and dispatch `START_GAME`.
  - Write the record on entering `gameResults`, beside the existing `buildSessionRecord` branch
    ([App.tsx:271](src/App.tsx#L271)).
  - Render the three screens; pass `guard='game'` and `onGame` to `NavMenu`.
- **GOTCHA:** **`ReviewDetail.onPractiseMisses` keeps `[record]`** ([App.tsx:578](src/App.tsx#L578)).
  It asks about one drill on purpose; adding games there answers a different question.
- **GOTCHA:** the record write goes in `act`, not in the reducer — a pure reducer must not write
  ([App.tsx:260](src/App.tsx#L260)).
- **GOTCHA:** every game screen already falls into `act`'s `drillRepo.clear()` branch
  ([App.tsx:315](src/App.tsx#L315)). Correct — starting a game abandons a parked drill — but add
  a line to that comment saying so, and a test.
- **VALIDATE:** `npx vitest run src/App.test.tsx`

### T6.2 UPDATE `src/components/Home.tsx` + its test

- **IMPLEMENT:** a **Play a game** button under **New list**, via a new `onPlayGame` prop.
- **PATTERN:** the `New list` button ([Home.tsx:45](src/components/Home.tsx#L45)).
- **GOTCHA:** the prop is optional and the button renders only when supplied, matching how
  `onSeeAllHistory` is handled ([Home.tsx:63](src/components/Home.tsx#L63)) — several tests render
  `Home` directly.
- **VALIDATE:** `npx vitest run src/components/Home.test.tsx`

### T6.3 CREATE `src/App.game.test.tsx` — the end-to-end pass

- **IMPLEMENT:** home → **Play a game** → pick two lists → misses-only → count → **Start game** →
  answer right, answer wrong, let one time out → results → **Play again** (a different draw) →
  **New game** (settings pre-filled). Then assert the misses show up in the ready screen's chips.
- **PATTERN:** [App.test.tsx](src/App.test.tsx) and [renderApp](src/test/renderApp.tsx) — default
  to the local-only guest path; do not change `renderApp`'s `configured: false` default.
- **GOTCHA:** stub `speechSynthesis` as the existing tests do, and assert the FR-20 timeout case
  here as well as in the unit test — this is the only place the whole chain is exercised.
- **VALIDATE:** `npx vitest run src/App.game.test.tsx`

**PHASE GATE:** `npm run typecheck && npm run lint && npm test`

---

## Phase 7 — Guards and close-out

### T7.1 UPDATE `src/test/invariants.test.ts`

- **IMPLEMENT:** four new guards:
  1. **No clock in `src/game/` or `state/wordPool.ts`** — no `Date.now()` / `new Date()`
     (excluding tests). Mirrors the existing `missedWords` guard
     ([invariants.test.ts:60](src/test/invariants.test.ts#L60)).
  2. **No `Math.random()` in `src/game/`** — the engine takes an `Rng`.
  3. **`state/wordPool.ts` imports nothing from `src/game/`** (NFR-11). The module boundary is
     the entire point of D-13, and an import is how it would quietly stop being generic — no
     error, no test failure, just a shared module that no second feature can use. A source scan
     is the only thing that catches it.
  4. **`gameRepo` never bumps its schema version** — the same guard `sessionRepo` has
     ([invariants.test.ts:73](src/test/invariants.test.ts#L73)), with the same reason.
- **GOTCHA:** the file excludes itself from its own scan; keep that working.
- **VALIDATE:** `npx vitest run src/test/invariants.test.ts`

### T7.2 Add the scoring-identity guard

- **IMPLEMENT:** in `scoring.test.ts`, `expect(displayedSeconds).toBe(pointsFor)` and
  `expect(MAX_POINTS).toBe(QUESTION_MS / 1000)`.
- **GOTCHA (R2):** this is the cheapest possible insurance against the one bug this feature
  cannot ship with.
- **VALIDATE:** `npx vitest run src/game/scoring.test.ts`

### T7.3 Full validation

```bash
npm run typecheck
npm run lint
npm test
npm run test:rules      # Firestore emulator, JDK 21+
npm run build
node scripts/check-bundle.mjs   # signed-out users still download zero Firebase
```

**Expected:** all green, and a test-file count of 55 against the baseline's 45 — ten new files (five pure-engine, `gameRepo`, three screens, the end-to-end pass).

### T7.4 Manual pass — LOCAL DEV ONLY

```bash
npm run dev            # --host, so a phone on the same network can reach it
```

- [ ] Two lists, same pair → pool count is right; a third list with a different pair is disabled
      and says why.
- [ ] Misses-only reflects the drill history you actually have.
- [ ] The countdown digit and the points banked agree, at 10, at 7 and at 1.
- [ ] A wrong tap is unmistakable **with the colour ignored** — squint, or use a greyscale filter.
- [ ] A timeout waits for **Next word**, and the next word is audible after it.
- [ ] **On a real iPhone (Safari):** play a full game and deliberately let two words time out.
      Every subsequent word must still be audible. **This is R1 and no test in this suite can
      stand in for it.**
- [ ] Dark mode: every new surface reads correctly in both themes.
- [ ] Reload mid-game → home, nothing lost but the game (D-8).
- [ ] Reduced motion on → the ring still counts down.
- [ ] A game's misses appear in the drill ready screen's "words you missed" chips.

### T7.5 UPDATE `README.md`

- **IMPLEMENT:** the game in the feature list and in the storage-keys table (`pvt.games.v1`).
- **VALIDATE:** `grep -c 'pvt.games.v1' README.md`

---

## Completion checklist

- [ ] Every task done in order; every phase gate green before the next began
- [ ] 006's suite passes **unmodified** (T1.1 / R5)
- [ ] `state/wordPool.ts` imports nothing from `src/game/`, and its API is the one in the plan —
      no strategy objects, no registry, no field without a day-one caller (D-13 / R9)
- [ ] `toDrillPairs` and 006's call sites left untouched; the convergence is the follow-up
- [ ] No new runtime dependency (NFR-9)
- [ ] No hex colours and no `dark:` classes in the new components (NFR-5)
- [ ] `speak` is never called from a timer callback (NFR-2 / R1)
- [ ] Points shown and points scored come from one function (NFR-4 / R2)
- [ ] Rules changed with both an allow and a deny test (T3.6)
- [ ] The iPhone pass in T7.4 actually done, on a device
