# Quickstart: 015-stale-comment-repair

**TL;DR** — Five exports are dead in production and alive in tests. **Nothing is deleted.** Eight
comment blocks across seven files get repaired so the next reader doesn't bin a regression net or
"simplify" a component onto a function that was deliberately routed around.

**Branch:** `chore/stale-comment-repair` from `main` @ `27dc31c` · **8 commits, all `docs(015):`**
**Baseline:** 1417 tests / 71 files green · **Ended at 1417 / 71.**
**Rule:** no test file is opened, and no code line changes. **Status: implemented** — spec § *Outcome*.

---

## What changes, in one table

Line numbers are `main`'s — where each comment was *before* the repair.

| # | File | What the comment said | What it says now |
|---|---|---|---|
| B1 | [scoreTrend.ts:13-33](src/state/scoreTrend.ts#L13-L33) | 16 lines of contract on the **dead** `trend`; one line on the **live** `trendOfRuns` | contract moves to `trendOfRuns`; `trend` says no prod caller + why it's the only seam that pins folding *and* averaging |
| B1a | [Home.tsx:128](src/components/Home.tsx#L128) | "`trend()` returns null" | "`trendOfRuns` returns null … (App.tsx:363)" |
| B2 | [sessionRecord.ts:34-36](src/state/sessionRecord.ts#L34-L36) | **"Kept because 002, 006 and 008 all call it"** — false | no prod caller; kept for the deep-equal at `sessionRecord.test.ts:171` |
| B2b | [gameRecord.ts:9](src/game/gameRecord.ts#L9) | cites `buildSessionRecord` as the purity precedent | cites `buildRunRecords` (one word) |
| B3 | [textParse.ts:165](src/parse/textParse.ts#L165) | "Detect and parse in one step." — implies a caller | + why `PastePanel` calls the two primitives itself, and **don't fuse them** |
| B4 | [wordPool.ts:223](src/state/wordPool.ts#L223) | "for a caller that has no use for the origin" — no such caller | 008's deferred convergence, the **two** twin projections (and why drillRun.ts:77 is not a third), and the export-surface test that pins it |
| B5 | [session.ts:6-8](src/state/session.ts#L6-L8) | **"Used by tests and by 'shuffle & restart'"** — never true | test-only; production shuffles via `randomRng` (appMachine.ts:229) |
| B5a | [session.ts:21](src/state/session.ts#L21) | (nothing) | inherits the "fresh order each time, no crypto quality" line, which describes `randomRng` |

---

## The one place this departs from the brief

The brief marks **B5 `seededRng` "correct as-is — test-only by design and documented as such."**
Test-only ✓. Documented as such ✗ — its comment claims "shuffle & restart" uses it. Three checks:

```bash
grep -rn "seededRng" src --include="*.ts" --include="*.tsx" | grep -v "\.test\."  # only session.ts:10
grep -n "rng" src/App.tsx                                                          # nothing
sed -n '229p' src/state/appMachine.ts   # reduce(..., rng: Rng = randomRng) — the default, never overridden
git log --oneline -S "seededRng" -- src/state/session.ts src/App.tsx src/state/appMachine.ts
#   → be671a0 only, the first commit. Never true; not left behind by a later change.
```

It is also the only one of the five whose comment would make a reader do the wrong thing: a *seeded*
"shuffle & restart" deals the same order every time. **B5 gets an edit** — spec § D-1, task T6.

---

## Two facts worth knowing before you start

- **B4 can't be deleted even if you wanted to.** [wordPool.test.ts:293-301](src/state/wordPool.test.ts#L293-L301)
  asserts this module's exports by exact name list, and `toPairs` is in it. Deleting it = editing a
  test, which is ruled out.
- **B2's suite is named in an earlier spec as a regression net.** 011 plan **R1** calls its
  deep-equal "the specific proof for the storage half" of the `DrillRun` refactor. It is **13 of
  the file's 20 tests**, not the brief's 17 — counted, because the number went into a comment.

---

## Run it

```bash
git checkout main && git pull && git checkout -b chore/stale-comment-repair
# T1 → T3 → T2 → T4 → T5 → T6, one commit each — verbatim comment text in tasks.md
```

**Per-commit check (the whole discipline in one command)** — strip the comments from both versions
and diff the remainder; `strip()` is defined at the top of [tasks.md](./tasks.md):

```bash
diff <(git show "main:$f" | strip) <(strip < "$f") && echo "✓ code identical"
```

Not `git diff | grep -v '^[+-]\s*\*'`. That was the original check and it reports a *moved* comment
block as changed code — T1 tripped it (spec **O-1**).

**Final gate (T7):**

```bash
npm run typecheck && npm run lint && npm test        # 1417 passed, 71 files
git diff --name-only main | grep -E '\.test\.(ts|tsx)$'   # no output
git diff --stat main -- src                                 # 7 files (spec O-2)
npm run check:bundle                                       # 88.6 KB JS, unchanged
```

---

## Traps

1. **T1 moves a 16-line block between two adjacent functions that share a return type.** Swap the
   bodies by accident and it still compiles and mostly still passes. Neither `export function` line
   may enter the diff.
2. **Don't touch [sessionRecord.ts:64](src/state/sessionRecord.ts#L64)** — "for the reason
   `buildSessionRecord` always was" is past tense and correct. Only `gameRecord.ts:9`, which is
   present tense, changes.
3. **Don't chase `trend()` into the test files** ([App.test.tsx:1327](src/App.test.tsx#L1327),
   [Home.test.tsx:164](src/components/Home.test.tsx#L164)). Both statements are true, and both are
   in test files.
4. **Don't collapse the two twin pair projections** onto `toPairs` while writing T5's comment.
   Documented, not fixed — that's the 008 convergence follow-up. And check each site's *direction*
   before citing it: `runFromList` (drillRun.ts:77) is the INVERSE, not a third copy (spec **O-4**).
5. **Verify every file:line before writing it into a comment.** A comment citing a wrong line is
   the exact defect this spec exists to remove (NFR-4). T7 re-resolves all of them.
