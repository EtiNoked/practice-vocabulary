# Spec: Repair the comments on five test-only exports

**ID:** 015-stale-comment-repair
**Status:** PLANNED
**Created:** 2026-09-09
**Baseline:** `main` @ `27dc31c` (`Chore/dead code removal (#15)`) — 71 test files, **1417 tests, all
green**, `typecheck` and `lint` clean (verified, not assumed — full run at 14:37, 11.84s)
**Feature Type:** Refactor (documentation-only). No code deleted, no behaviour changed, no test touched.
**Complexity:** Low. Six files, comment blocks only. Zero emitted-JS difference.
**Depends on:** 014 (merged as #15). This is its category-B follow-up.
**Branch:** `chore/stale-comment-repair`, cut from `main`.

---

## The ask

> **B. Dead in production, alive only in tests.** Removing these means editing test files, which
> you've ruled out. My recommendation for all of B is **leave the code, fix the stale comments** —
> a wrong comment is the actual hazard here.
>
> B1 `trend()` · B2 `buildSessionRecord()` · B3 `parseText()` · B4 `toPairs()` · B5 `seededRng()`

The brief's central judgement is adopted in full: **nothing is deleted.** Every one of the five is
reachable only from tests, and every one earns its keep for a reason a comment should be stating.
Four of the five comments are repaired as the brief describes.

**The brief is wrong about B5, and that is the most valuable finding in this spec.** It marks
`seededRng` "correct as-is". Its comment claims a production caller that has never existed. See
§ *Deviations from the brief* — D-1.

---

## Verification — every claim in the brief, checked

`grep -rn` over `src/`, `tests/`, `scripts/`, `index.html`, `README.md` and `.claude/specs/`.
"Prod refs" counts references in `src/**` excluding `*.test.ts(x)` and the symbol's own definition.

| # | Symbol | Site | Prod refs | Test refs | Brief's claim | Verdict |
|---|---|---|---|---|---|---|
| B1 | `trend()` | [scoreTrend.ts:29](src/state/scoreTrend.ts#L29) | **0** (1 comment: [Home.tsx:128](src/components/Home.tsx#L128)) | 10 | dead in prod; app uses `trendOfRuns` | **confirmed** — [App.tsx:363](src/App.tsx#L363) |
| B2 | `buildSessionRecord()` | [sessionRecord.ts:26](src/state/sessionRecord.ts#L26) | **0** (2 comments) | 17 | comment is false | **confirmed** — comment names three callers, there are none |
| B3 | `parseText()` | [textParse.ts:166](src/parse/textParse.ts#L166) | **0** | 5 | PastePanel calls the two primitives directly | **confirmed** — [PastePanel.tsx:31,34](src/components/PastePanel.tsx#L31-L34) |
| B4 | `toPairs()` | [wordPool.ts:224](src/state/wordPool.ts#L224) | **0** | 3 | no production caller | **confirmed** |
| B5 | `seededRng()` | [session.ts:10](src/state/session.ts#L10) | **0** | 90+ across 9 files | "test-only **by design and documented as such** — correct as-is" | **half wrong** — test-only ✓, documented as such ✗ (D-1) |

### Why each one stays — the reason the repaired comment must carry

| # | The keep-reason, stated once |
|---|---|
| B1 | `trend` is the **only** entry point that pins folding and averaging *together*. A test spanning three lists writes three records (011 D-3); averaging those counts one run three times, silently, with a plausible-looking number. `trendOfRuns` takes pre-folded runs and cannot catch that. |
| B2 | Its 17-test suite includes a deep-equal against what a single-list drill stored *before* 011 split runs into per-list records ([sessionRecord.test.ts:171](src/state/sessionRecord.test.ts#L171)) — the proof the split changed nothing for a plain drill. |
| B3 | The composed detect-then-parse contract, driven at [textParse.test.ts:117-133](src/parse/textParse.test.ts#L117-L133). Legitimate for a future caller that wants the guess and the rows and nothing else. |
| B4 | Written in 008 for a convergence 008 itself deferred (008 spec § *Out of scope*: "`toDrillPairs` becomes `toPairs`"). Also pinned by an **export-surface assertion** ([wordPool.test.ts:293-301](src/state/wordPool.test.ts#L293-L301)) that names it — deleting it fails a test. |
| B5 | Determinism is what makes the shuffle, `runFromPool`'s draw and the game's distractor cloud testable at all. 90+ call sites. |

### The two "keeps" that are load-bearing, not just defensible

- **B4 cannot be deleted without editing a test.** [wordPool.test.ts:293-301](src/state/wordPool.test.ts#L293-L301)
  asserts `Object.keys(module).sort()` equals an exact five-name list including `toPairs`. This is
  the strongest keep-claim of the five, and the brief does not mention it.
- **B2's deep-equal is the regression net named in a previous spec.** 011 plan **R1** designates it
  "the specific proof for the storage half" of the `DrillRun` refactor.

---

## User story

> **As a** maintainer reading this codebase cold
> **I want** every export that no production code reaches to say so, and say why it is still here
> **So that** the next reader does not delete a regression net, restore a false claim about who
> calls what, or "simplify" a component onto a function that was deliberately routed around.

---

## Functional requirements

| ID | Requirement |
|---|---|
| **FR-1** | `trend`'s doc comment states it has no production caller and carries the folding+averaging keep-reason. The contract prose it currently monopolises (full runs only, runs-not-records, null below two, the 012 provenance) **moves to `trendOfRuns`**, which is the live path and today has a one-line comment. |
| **FR-1a** | [Home.tsx:128](src/components/Home.tsx#L128) names `trendOfRuns`, not `trend()`, and notes the `average` prop arrives null from `App.tsx`'s brief. |
| **FR-2** | The false clause at [sessionRecord.ts:34-36](src/state/sessionRecord.ts#L34-L36) — "Kept because 002, 006 and 008 all call it" — is replaced by the truth: no production caller; kept for the suite, with the deep-equal test named by line. |
| **FR-2a** | `buildSessionRecord`'s doc comment (lines 16-25) points a skimming reader at `buildRunRecords` as the live path. |
| **FR-2b** | [gameRecord.ts:9](src/game/gameRecord.ts#L9) cites `buildRunRecords`, not `buildSessionRecord`, as the purity precedent. (Sixth site, not in the brief — see D-3.) |
| **FR-3** | `parseText`'s comment states it has no production caller **and why PastePanel is not one**: the panel renders `detection.delimiter` ([PastePanel.tsx:77](src/components/PastePanel.tsx#L77)) and `detection.confidence` against `CONFIDENCE_FLOOR` ([PastePanel.tsx:103-108](src/components/PastePanel.tsx#L103-L108)), both of which `parseText` discards when overridden (it reports `confidence: 1`). |
| **FR-4** | `toPairs`'s comment records its 008 provenance, the deferred convergence, the three inlined copies of the same projection ([drillRun.ts:77](src/state/drillRun.ts#L77), [drillRun.ts:142](src/state/drillRun.ts#L142), [gameRecord.ts:87](src/game/gameRecord.ts#L87)), and that it is the module-level one to route the next caller through. |
| **FR-5** | `seededRng`'s comment no longer claims "shuffle & restart" uses it. It states test-only, names `randomRng` + [appMachine.ts:229](src/state/appMachine.ts#L229) as the production path, and says why a seeded restart would be wrong. |
| **FR-5a** | `randomRng` ([session.ts:21](src/state/session.ts#L21)) gains the one-line rationale removed from `seededRng` — a fresh order each time, no cryptographic quality — since that sentence describes *it*. |
| **FR-6** | **No function body, signature, export or type is added, removed or changed.** Every edit is inside a comment or a JSDoc block. |

## Non-functional requirements

| ID | Requirement |
|---|---|
| **NFR-1** | `npm run typecheck`, `npm run lint` and `npm test` pass at every task boundary. |
| **NFR-2** | **No test file is opened.** The suite ends at **1417 tests in 71 files** — the count it starts at. |
| **NFR-3** | Zero runtime change and zero emitted-JS change. `git diff --stat` shows comment lines only; `npm run build` output is byte-identical bar the hash. |
| **NFR-4** | Every file/line reference written into a comment resolves at the commit that lands it. A comment citing a wrong line is the exact defect this spec exists to remove. |
| **NFR-5** | No comment gains a claim that a `grep` in this spec did not verify. |

---

## Out of scope

Named so they are decisions rather than oversights:

- **Deleting any of the five.** The brief's call, adopted. B4 additionally cannot go without editing
  a test (FR-4's export-surface assertion).
- **Editing the test-file comments that name `trend()`** — [App.test.tsx:1327](src/App.test.tsx#L1327),
  [Home.test.tsx:164](src/components/Home.test.tsx#L164). Both say "`trend()` returns null below
  two", which is **true**: `trend` does that, and the app inherits it through `trendOfRuns`. Not
  stale, and reaching into test files for prose is what 014 D-1 already isolated as optional.
- **Collapsing the three inlined pair projections onto `toPairs`.** Real (FR-4 documents it), and a
  behaviour-touching refactor. It belongs in the 008 convergence follow-up, not in a comment PR.
- **Adding `invariants.test.ts` guards that these five stay exported.** One already exists for B4.
  For the rest, the repaired comment *is* the guard, and a new assertion file would put test
  authoring inside a change whose whole discipline is NFR-2.
- **Hunting further stale comments.** This spec covers the five in the brief plus the one sixth site
  they strand (D-3). Nothing else.

---

## Deviations from the brief

- **D-1 — B5 is not "correct as-is". Its comment states a production caller that has never
  existed.** [session.ts:6-8](src/state/session.ts#L6-L8) reads "Used by tests **and by 'shuffle &
  restart'**, which wants a fresh order each time but no cryptographic quality." Production
  shuffling arrives through `reduce(state, action, rng: Rng = randomRng)`
  ([appMachine.ts:229](src/state/appMachine.ts#L229)); `grep -n "rng" src/App.tsx` returns **nothing**,
  so no call site ever overrides that default. `git log -S "seededRng"` on `session.ts`, `App.tsx`
  and `appMachine.ts` returns a single commit — `be671a0`, the first — so this was never true and
  was not left behind by a later change. It is also the one claim of the five that would make a
  reader do the wrong thing: a seeded "shuffle & restart" deals the *same* order every time, the
  exact opposite of the button's promise. **B5 gets an edit (FR-5, FR-5a).**

- **D-2 — B3 and B4's comments are not false, they are false-by-implication, and the fix is
  bigger than a reword.** "for a caller that has no use for the origin" and "Detect and parse in
  one step" are both accurate sentences that imply a caller. Stating "no production caller" alone
  would invite the next reader to delete them, so each repaired comment must carry the keep-reason
  and, for B3, the reason the obvious caller was deliberately routed around.

- **D-3 — a sixth site.** [gameRecord.ts:9](src/game/gameRecord.ts#L9) holds up
  `buildSessionRecord` as the precedent for keeping record-shaping out of the reducer. The sentence
  is true, but it points a reader at the vestigial twin instead of the live `buildRunRecords`.
  One word (FR-2b), folded into the B2 task.

- **D-4 — B1's repair moves prose rather than rewording it.** All the contract documentation
  (16 lines) sits on the dead `trend`; the live `trendOfRuns` has "The same, for a caller that has
  already folded its records." A reader arriving from `App.tsx:363` finds the one-liner and must
  jump to a function the app never calls to learn the rules. Fixing the attribution without moving
  the prose would leave that inversion in place.

---

## Definition of done

- [ ] All six files edited; `git diff` contains **no non-comment line**.
- [ ] `npm test` → 1417 passed, 71 files. `npm run typecheck` → clean. `npm run lint` → clean.
- [ ] Every `grep` in the verification table re-run at HEAD and still returning the same counts.
- [ ] No comment in `src/` names `trend()`, `buildSessionRecord`, `parseText`, `toPairs` or
      `seededRng` as something production calls.
- [ ] Every file:line citation added by this change verified to resolve.
