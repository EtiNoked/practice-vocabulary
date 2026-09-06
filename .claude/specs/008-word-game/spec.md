# Spec: Word Game — hear it, grab it from the cloud, before the clock runs out

**ID:** 008-word-game
**Status:** IMPLEMENTED — `feature/word-game`, 7 commits, all gates green
**Outstanding:** the on-device iPhone pass (tasks T7.4). See the note at the end.
**Created:** 2026-09-06
**Baseline:** `main` @ `84f258a` — 45 test files, 810 tests, all green
**Re-baselined:** 2026-09-06 at execution. The plan was drafted against `69400fd`; main has since
taken 009-practice-peek (#10) and the list-direction fix (#9). Both are additive — `missedWords.ts`
is untouched, `shuffle` is still private in `session.ts`, and 009 added no colour token (only a
`.answer-masked` component class). Every decision below survives unchanged.
**Feature Type:** New capability — three new screens, a new pure engine, a new storage collection
**Complexity:** High. The card is routine; pooling across lists, an honest clock, and keeping
iOS Safari's audio alive across a timeout are not.
**Depends on:** 006-practice-review — **landed on main** (`26a7848`, #8). `wordKey` and `collectMissed` are
in the tree at [missedWords.ts](src/state/missedWords.ts) and can be read, not assumed.

---

## The ask

> "I want to add another feature which is 'game' — when you start a game, you choose which lists
> you want to be part of the game, if it's just words you got wrong or all (see how many words you
> have after this selection), and then type how many words you want in the game (we can have
> 10/15/20 selection as first, or to have text box to fill). After the selection — the words for
> the game are being randomized. How the game works: you have a cloud of words, you hear a word,
> and need to pick the word from the cloud of words. You have 10 seconds for a word, and the timer
> goes back from 10 to 0 — the moment the user pick a word, it stops — and this is the point they
> get (so if they pick after 3 seconds, they have 7 points). At the end — the game show how many
> correct answers, and what is the score. You can either re-do a game (and you will get a new set
> of random words), or do a new game. A game has the settings it had — so each game randomize the
> words again."

Five things: a **multi-list pool**, a **misses-only filter with a live count**, a **length picker**,
a **timed multiple-choice round** scored by speed, and a **results screen with replay**.

---

## Decisions taken

Four were put to the user in session and answered; the rest follow from the codebase. Each is
numbered so the plan and tasks can cite it instead of re-arguing it.

| # | Decision | Why |
|---|---|---|
| **D-1** | **A fresh cloud per question** — the answer plus distractors drawn from the pool, `min(CLOUD_SIZE, what the pool can distinctly supply)`. Not one big cloud of all N words. | *(user)* A cloud that shrinks as words are used makes the last question a coin flip. A fresh one keeps difficulty flat from first word to last. **CLOUD_SIZE is 10** (raised from 6 in session): a blind guess drops from ~17% to ~10%, at the cost of nearly twice as much to read inside the same ten seconds. |
| **D-2** | **Chips 10 / 15 / 20, plus a number box**, every option capped at the pool size. | *(user)* Chips for the common case, the box for "all 34 of them". A chip whose count exceeds the pool is disabled with the reason shown, never hidden. |
| **D-3** | **A finished game is recorded, and its misses feed the same "words you got wrong" pool the drill fills.** | *(user)* A game that teaches the rest of the app nothing is a toy. Costs a `GameRecord` type, a `games` collection, Firestore rules and rules tests. |
| **D-4** | **One shot per word. A wrong tap scores nothing and the game moves on — but says so, unmistakably.** | *(user, verbatim: "one shot, next word - but get a signal that you got it wrong")* Matches "the moment the user picks a word, it stops". The signal is FR-19. |
| **D-5** | **You hear `col2`; the cloud is written in `col1`.** | The app's existing promise, in as many words, at [ReadyScreen.tsx:60](src/components/ReadyScreen.tsx#L60): "You'll hear **Dutch**, and answer in **English**." A game that inverted it would be a second, contradictory convention. |
| **D-6** | **A pool may only combine lists that share BOTH languages.** The first list picked fixes the pair; the rest are disabled with the reason stated. | `speak()` takes one `LangCode` ([tts.ts:113](src/speech/tts.ts#L113)). Worse than the plumbing: mixed-language distractors give the answer away — one French tile among five Dutch ones needs no vocabulary at all. |
| **D-7** | **Games write `GameRecord` to their own collection, never `SessionRecord`.** | A game has per-question timings, a points total and several source lists. `SessionRecord.listId` is a single string, and `drillRepo`'s validator, `score()`, `buildSessionRecord`, `ScoreHistory`, `ReviewScreen` and `ReviewDetail` all read that shape. An auto-marked score is also not comparable with a self-marked one and must not enter the same average. |
| **D-8** | **A game does NOT survive a reload.** Reloading abandons it and opens at home. | A deliberate divergence from 002's `drillRepo`, and the reason is the clock: there is no honest answer to "how much of the ten seconds was left", and the word cannot be re-spoken on restore because a restore has no user gesture (002 FR-3 met exactly this wall). Four minutes of play is a survivable loss; a resumed game that is silent and mis-timed is not. |
| **D-9** | **Replay re-samples from the SAME pool snapshot**, not from the lists as they stand now. | "A game has the settings it had." The user was shown a pool size; a replay that quietly grew because a list was edited in another tab would contradict the number they chose against. Same snapshot discipline as `Session.pairs` ([session.ts:39](src/state/session.ts#L39)). |
| **D-10** | **Game verdicts count BOTH ways in the missed pool** — a miss adds a word, a correct answer clears it. | The tempting alternative is asymmetry, on the grounds that 1-in-6 is guessable. Rejected: an asymmetric rule makes the missed pool monotonically grow, so a user who has genuinely learned a word watches the app refuse to notice. 006's rule is already "the most recent verdict wins", so a lucky guess is undone by the next honest miss. Reversing this is a one-line change in `gameMissSources` if it proves wrong. |
| **D-11** | **The setup form owns its own state; the reducer holds none of it.** | Precedent: `ListEditor` owns its rows and hands `App` a finished `WordList` in `onConfirm` ([App.tsx:472](src/App.tsx#L472)). Putting five setup fields and their four actions in `reduce` would double the reducer for a form with no cross-screen consequence. |
| **D-13** | **Choosing words from settings is a SHARED module, not part of the game.** `src/state/wordPool.ts` owns `PoolSpec` → `PooledWord[]`, and the game is its first caller rather than its owner. | *(user)* "We will later use it for different features." The question *"which words does this setting select?"* is not a game question — a scheduled-review feature, a flashcard mode, a printable worksheet or an export all ask it identically. Written inside `src/game/` it would have to be extracted under pressure later, by which time the game's vocabulary would be baked into it. The cost of doing it now is one directory choice and a `PoolSpec` parameter; the cost of doing it later is a refactor across two features. |
| **D-12** | **"Words you got wrong" means all time.** No day/week/month chips at setup. | The ask is binary — "just words you got wrong or all". 006's four windows are a drill-screen idea about one list; the extension point is noted in Out of Scope rather than built. |

---

## User stories

### Story 1 — Build a pool

**As** someone with four vocabulary lists
**I want** to pick which of them a game draws from, and whether it uses everything or only my misses
**So that** I can drill exactly the material I am weak on without editing a list

**Acceptance criteria**

- [ ] Every saved list is offered with its name, word count and language pair.
- [ ] Picking the first list fixes the language pair; lists with a different pair go disabled and
      say why ("French → English — a game uses one language pair").
- [ ] A source toggle offers **All words** and **Words I got wrong**.
- [ ] The resulting pool size is shown and updates on every change, before anything starts.
- [ ] A pool under `MIN_POOL` (4) cannot start a game, and the screen says what would fix it.

### Story 2 — Choose a length

**As** a player with five minutes
**I want** to say how many words the game should ask me
**So that** a game fits the time I actually have

**Acceptance criteria**

- [ ] Chips 10 / 15 / 20 are offered; a chip above the pool size is disabled, not hidden.
- [ ] A number box accepts 1 … min(pool, `MAX_GAME_WORDS`); out-of-range input is clamped and the
      cap is stated.
- [ ] When the pool is smaller than 10, an **All N words** chip is offered so there is always at
      least one tap target.

### Story 3 — Play

**As** a player
**I want** to hear a word and grab its meaning from the cloud before the clock runs out
**So that** recall gets fast, not just correct

**Acceptance criteria**

- [ ] The word is spoken in `col2Lang`; up to ten words show `col1` text — one right, the rest distractors.
- [ ] A countdown runs 10 → 0. The number on screen is the number of points a correct tap scores.
- [ ] A correct tap stops the clock, banks the points, and moves on.
- [ ] A wrong tap scores nothing, is unmistakably signalled, and moves on.
- [ ] Letting the clock reach 0 scores nothing, shows the answer, and waits for a tap to continue.
- [ ] Quitting mid-game is possible and lands on the results for what was answered.

### Story 4 — See how it went, and go again

**As** a player who has just finished
**I want** my score and my correct count, and one tap to play again
**So that** a bad round costs me nothing but ten seconds of pride

**Acceptance criteria**

- [ ] Correct count (`n / total`), points scored, and the maximum that was available.
- [ ] The words missed are listed, with what they meant.
- [ ] **Play again** re-runs the same settings over a freshly randomised set of words.
- [ ] **New game** returns to setup with the previous settings pre-filled.
- [ ] The result is recorded, and the misses appear in the drill's "words you missed" chips.

---

## Functional requirements

### Setup

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | A **Play a game** entry exists on the home screen and in the nav menu. | HIGH |
| FR-2 | The setup screen lists every saved list as a multi-select with name, count and language pair. | HIGH |
| FR-3 | Selecting the first list fixes the pair. Incompatible lists become disabled and state their own pair as the reason (D-6). | HIGH |
| FR-4 | Deselecting back to zero lists releases the pair, so a different one can be chosen. | HIGH |
| FR-5 | A source toggle offers **All words** / **Words I got wrong** (D-12: all time). | HIGH |
| FR-6 | The pool size is displayed and recomputed on every selection change (the ask's "see how many words you have after this selection"). | HIGH |
| FR-7 | The pool de-duplicates across lists by `wordKey`, so a word in two lists is one entry. Built by the shared `buildWordPool` (D-13), not by game code. | HIGH |
| FR-8 | Length: chips 10 / 15 / 20 capped at the pool, plus a number box for 1 … min(pool, 50) (D-2). | HIGH |
| FR-9 | Below `MIN_POOL` (4) the game cannot start, and the screen says why. | HIGH |
| FR-10 | With **Words I got wrong** selected and no misses on record, the screen says so rather than showing a bare zero. | MEDIUM |

### The round

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11 | Game words are sampled from the pool **without replacement** — no word is asked twice. | HIGH |
| FR-12 | Each question shows `min(CLOUD_SIZE, pool)` words: the answer plus distractors sampled from the pool. Never padded to reach the ceiling. | HIGH |
| FR-13 | Distractors are distinct from the answer and from each other **by displayed text**, not merely by id — two senses of "bank" must never appear as two tiles. | HIGH |
| FR-14 | Tile order is randomised per question; the answer is not biased to a position. | HIGH |
| FR-15 | The prompt is spoken in `col2Lang` on arrival at each question. | HIGH |
| FR-16 | A **replay** control re-speaks the current word without resetting or pausing the clock. | MEDIUM |
| FR-17 | A countdown runs from 10 to 0 over `QUESTION_MS` (10 000 ms). | HIGH |
| FR-18 | A correct tap scores `clamp(ceil(remainingMs / 1000), 0, 10)` — the number that was on screen. | HIGH |
| FR-19 | A wrong tap scores 0 and is signalled by **three** independent channels: the tapped tile turns `incorrect`, the right tile turns `correct`, and a `role="status"` line reads "Wrong — it was *X*". Never colour alone (D-4). | HIGH |
| FR-20 | A timeout scores 0, reveals the answer, and waits for an explicit **Next word** tap (see NFR-2 — this is the audio chain, not a stylistic choice). | HIGH |
| FR-21 | After a tap (right or wrong) the game auto-advances after `VERDICT_MS` (800 ms). | HIGH |
| FR-22 | Quit is available throughout and routes to results for what was answered. | HIGH |
| FR-23 | A running total of points and question position (`4 / 15`) is on screen throughout. | MEDIUM |

### Results

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-24 | Results show correct / asked, points scored, and points available. | HIGH |
| FR-25 | Missed words are listed with both sides. | HIGH |
| FR-26 | **Play again** re-samples from the same pool snapshot under the same settings (D-9). | HIGH |
| FR-27 | **New game** returns to setup with the previous settings pre-filled. | MEDIUM |
| FR-28 | A finished game writes one `GameRecord`, unless nothing was answered. | HIGH |
| FR-29 | A `GameRecord` projects into one miss source per contributing list, so `collectMissed` reads drills and games alike (D-3, D-10). | HIGH |
| FR-30 | A quit game is recorded as `partial: true`, mirroring `SessionRecord.partial`. | MEDIUM |

---

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | **The pure layer reads no clock and no `Math.random()`.** Everything under `src/game/` takes `now`, `remainingMs` and `rng` as parameters. Enforced by a new case in [invariants.test.ts](src/test/invariants.test.ts), not by review. |
| NFR-2 | **Every `speak()` descends from a user gesture.** The first word from the Start tap, each next word from inside the answer tap, and the word after a timeout from the **Next word** tap. iOS Safari drops speech that does not ([tts.ts:13](src/speech/tts.ts#L13)) — silently, which is why FR-20 exists. |
| NFR-3 | **The clock is a deadline, not an accumulator.** Remaining time is `deadline - now`, so a backgrounded tab cannot bank time it did not play. Returning to a tab whose deadline has passed lands on the timeout state. |
| NFR-4 | The number displayed and the points awarded come from **one** function. A score that contradicts the number the user was looking at is the one bug this feature cannot ship with. |
| NFR-5 | Colour tokens only — no hex, no `dark:` classes. Every new colour must already exist in all three blocks of [index.css](src/index.css); [theme.test.ts](src/theme/theme.test.ts) fails a name that does not. |
| NFR-6 | Tiles are ≥ 44 px via `.btn` ([index.css:303](src/index.css#L303)). They are hit under time pressure, which is exactly the case that rule exists for. |
| NFR-7 | The ticking number is `aria-hidden`; a screen reader gets a static description instead. A live region announcing "9… 8… 7…" would make the game unusable with a reader running. |
| NFR-8 | The countdown is driven by inline style from the interval, never by a CSS animation — [index.css:284](src/index.css#L284) zeroes every animation under `prefers-reduced-motion`, which would freeze a CSS-animated ring at full. |
| NFR-9 | No new runtime dependency. The project has three and a habit of not adding a fourth. |
| NFR-11 | **`wordPool.ts` knows nothing about games.** No import from `src/game/`, no `count`, no `Question`, no points. It answers one question — *which words does this spec select?* — and hands back `PooledWord[]`. Enforced by a case in [invariants.test.ts](src/test/invariants.test.ts): a `src/game/` import inside it fails the build. |
| NFR-10 | `subscribeGames` is bounded by `MAX_GAME_RECORDS`, matching what `subscribeSessions` already does ([firestoreListStore.ts:131](src/storage/firestoreListStore.ts#L131)) — two stores that disagree on how much history exists give one user two different missed-word sets on two devices. |

---

## Edge cases

| Case | Behaviour |
|------|-----------|
| No saved lists | Setup says so and offers **New list**; nothing to select. |
| One list selected, misses-only, zero misses | Pool 0. Explained in words (FR-10), start disabled. |
| Pool of 1–3 words | Start disabled below `MIN_POOL`. A cloud with two tiles is a coin toss, not a game. |
| Pool of exactly 4 or 5 | Cloud shrinks to the pool size; the game is playable and honest about being easy. |
| Requested count > pool | Clamped to the pool at build time, and the chip was already disabled. |
| Two lists share a word | One pool entry (FR-7). Its `listId` is the first contributing list; the record's miss projection files it there. |
| Two different words share a `col1` | Only one may appear in a cloud (FR-13). |
| A list is edited or deleted mid-game | The game is unaffected — the pool is a snapshot (D-9). |
| Device has no voice for `col2Lang` | The existing `VoiceWarning` banner applies; the game is playable but silent, and the words are still on screen. Not a blocker. |
| Tab backgrounded mid-question | The deadline runs on (NFR-3); returning shows the timeout state. |
| Reload mid-game | Game lost, app opens at home (D-8). Any parked drill is cleared, exactly as `GO_HOME` does. |
| Nothing answered before quitting | No record written, mirroring `buildSessionRecord` returning null ([sessionRecord.ts:31](src/state/sessionRecord.ts#L31)). |
| `localStorage` full or refused | The write fails and is ignored; the game already happened. Same contract as `drillRepo` (002 FR-6). |
| Signed out, then in | Games follow the store like lists and sessions do. Guest games stay on the device. |

---

## Out of scope

Named so it is a decision rather than an omission.

- **Other round types.** Hear→spell, read→pick, type-the-answer. The `Question` type is shaped so
  a second kind is additive, but only one is built.
- **A misses window at setup.** D-12. `collectMissed` already takes a `ReviewWindow`; adding chips
  later touches the setup screen and nothing else.
- **Personal bests / streak multipliers / leaderboards.** Speed already makes the score a game.
- **Resuming an interrupted game.** D-8.
- **Difficulty tuning of distractors** (near-misses, same-first-letter). Uniform sampling from the
  pool, and a note in the plan on where a smarter rule would go.
- **Mixed-language pools.** D-6.
- **Converging 006's ready screen onto `buildWordPool`.** Its per-list missed selection is a
  strict special case of the new module (`listIds: [one], source: 'missed'`), and `toDrillPairs`
  becomes `toPairs`. Deliberately NOT done here: 006's untouched suite is the regression net for
  the `MissSource` widening, and rewriting its call sites in the same change would remove exactly
  the net that proves the change was safe. The first follow-up, not this one.
- **A game-history screen.** Records are written and feed the missed pool, but a "past games" view
  is not built. `ReviewScreen` stays drills-only this round.


---

## Implementation note (2026-09-06)

Built on `feature/word-game`, cut from `main` @ `84f258a`, in seven commits following
[tasks.md](tasks.md) phase by phase. Final state: **56 test files, 1085 tests**, plus
**63 rules tests** against the emulator; typecheck, lint, build and the bundle guard all
clean. Baseline was 45 files / 810 tests.

Three things came out differently from the plan, each for a reason worth keeping:

1. **Points are scored from the number on screen, not from a fresh clock reading.**
   The plan said to read the clock at tap time. That is more precise and slightly wrong
   for it: the display repaints every 100 ms, so a tap landing just after a whole-second
   boundary the screen has not caught up with would award one point less than the digit
   the user tapped under — the exact NFR-4 failure. Scoring from the displayed value
   costs up to 100 ms of generosity and makes the mismatch unrepresentable.

2. **`GameCloud` and the end-to-end test use `fireEvent`, not `userEvent`** — the only
   place in this codebase that does. `userEvent` drives timers of its own, and against a
   100 ms interval under fake timers the two wind each other until a click hangs. Every
   interaction here is a plain click, so the realism `userEvent` buys is worth nothing
   against the deadlock it costs. Plan risk R3 anticipated the difficulty and picked the
   wrong remedy.

3. **`gameRecord.ts` is exempt from the no-clock invariant**, with the exemption stated
   in the guard and a second test pinning that `now` and `id` stay injectable. It mirrors
   `sessionRecord.ts` exactly; holding two sibling files to different rules would make
   the pair harder to read than either alone.

### Still to do

**T7.4, the on-device pass, has not been done** — in particular:

> Play a full game on a real iPhone (Safari) and deliberately let two words time out.
> Every subsequent word must still be audible.

That is risk R1, and no test in this suite can stand in for it. The guard that exists —
an invariant asserting `speak()` is never called from inside a `setTimeout` or
`setInterval` in `GameCloud` — proves the shape of the code, not the behaviour of the
platform. The dark-mode, reduced-motion and greyscale checks in T7.4 are likewise
unverified beyond the token and glyph rules the suite enforces.
