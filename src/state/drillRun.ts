import type { LangCode } from '../lang/languages'
import { shuffle, type Rng } from './session'
import type { WordList, WordPair } from './types'
import { poolLanguages, type PoolSpec, type PooledWord } from './wordPool'

/**
 * What a run is a run OF, for the screens that only need to name it and speak it.
 *
 * The field names are `WordList`'s ON PURPOSE. A `WordList` therefore satisfies this
 * structurally, which is what made widening `TestCard`, `StudyCard` and `ResultsScreen`
 * from `WordList` to this a TYPE-ONLY change — no call site moved, no test moved (011
 * D-8). Exactly the move 008 made when it widened `collectMissed` to `MissSource`.
 *
 * Do NOT add fields. The moment this needs `pairs` or `id`, every caller has to hold a
 * real list again and the widening is undone — silently, one prop at a time.
 */
export interface DrillSubject {
  readonly name: string
  readonly col1Lang: LangCode
  readonly col2Lang: LangCode
}

/**
 * WHICH words, and HOW MANY. A definition with no identity of its own.
 *
 * Separate from `SavedTest` (state/testPlan.ts) so that an ad-hoc run built in the
 * builder and never saved is the same kind of thing as a saved one, minus a name. A
 * single type carrying an empty id for the unsaved case would push "is this real?" out
 * to every reader.
 */
export interface TestPlan {
  readonly spec: PoolSpec
  /**
   * `null` means "everything this selects", however much that turns out to be later
   * (011 D-10).
   *
   * A saved test fixed at 15 and a saved test meaning *all my current mistakes* are
   * different questions, and only one of them can be written as a number.
   */
  readonly count: number | null
}

/**
 * A drill in flight, and everything needed to run it again.
 *
 * `pool` is a SNAPSHOT, carried for the reason `Game.pool` is (008 D-9): the results
 * screen's fresh draw re-samples the pool the user was shown a count for, not the lists
 * as they stand now. A saved test is the opposite act — asking the question again,
 * today — and rebuilds from live lists (011 D-6).
 *
 * `words` is the ask's "make sure the practice itself knows which words you tried": the
 * drawn words WITH their origin list. It is what lets a fifteen-word test over three
 * lists file each miss against the list it actually came from (011 D-3).
 */
export interface DrillRun {
  readonly subject: DrillSubject
  readonly pool: readonly PooledWord[]
  readonly words: readonly PooledWord[]
  /** Present when the run came from the builder; absent for a plain list drill. */
  readonly plan?: TestPlan
  /** The saved test this came from, when it came from one. For pre-filling, nothing else. */
  readonly savedTestId?: string
}

/**
 * A whole list, or a subset of it, as a run.
 *
 * `pairs` is a separate parameter rather than read off the list because the ready
 * screen's missed-words subset is a strict subset of it (006), and BOTH have to arrive
 * here as runs — otherwise there are two record-writing paths again, and the simple one
 * quietly stops matching the complicated one (011 D-9).
 *
 * `pool` is set to `words`: nothing was capped, so there is no other sample to draw, and
 * `canRedraw` says so without needing a special case for the list route.
 */
export function runFromList(list: WordList, pairs: readonly WordPair[] = list.pairs): DrillRun {
  const words: PooledWord[] = pairs.map((p) => ({
    id: p.id,
    col1: p.col1,
    col2: p.col2,
    listId: list.id,
    listName: list.name,
  }))
  // The list IS the subject — see DrillSubject. No projection, no copy.
  return { subject: list, pool: words, words }
}

/**
 * A pool, capped and drawn.
 *
 * Shuffle then slice: sampling WITHOUT replacement, so no word is asked twice — the same
 * two lines `buildQuestions` uses, deliberately not shared with it. That function also
 * builds distractors, and the common part is one expression.
 *
 * `rng` is injected, so a draw can be pinned in a test and a redraw can be given a
 * genuinely fresh one rather than hoping for it.
 */
export function runFromPool(
  pool: readonly PooledWord[],
  plan: TestPlan,
  subject: DrillSubject,
  rng: Rng,
  savedTestId?: string,
): DrillRun {
  const count = plan.count ?? pool.length
  const words = shuffle(pool, rng).slice(0, Math.max(0, Math.min(count, pool.length)))
  return {
    subject,
    pool,
    words,
    plan,
    // A CONDITIONAL SPREAD, not `savedTestId: undefined`: exactOptionalPropertyTypes is
    // on, so an explicit undefined is a type error.
    ...(savedTestId !== undefined ? { savedTestId } : {}),
  }
}

/**
 * A fresh sample of the same size from the same pool (011 D-6, FR-26).
 *
 * Returns a run with no plan UNCHANGED, by reference. A list drill has no other sample
 * to draw, and returning a copy would make "did anything happen?" unanswerable at the
 * call site.
 */
export function redraw(run: DrillRun, rng: Rng): DrillRun {
  if (!run.plan) return run
  return runFromPool(run.pool, run.plan, run.subject, rng, run.savedTestId)
}

/**
 * Whether a fresh draw would differ from the one in hand.
 *
 * Drives whether the button exists at all. Offering "another 15" over a pool of exactly
 * 15 promises a different set and cannot deliver one.
 */
export function canRedraw(run: DrillRun): boolean {
  return run.plan !== undefined && run.pool.length > run.words.length
}

/** The drawn words as plain pairs, for `createSession`. Ids are preserved. */
export function runPairs(run: DrillRun): WordPair[] {
  return run.words.map((w) => ({ id: w.id, col1: w.col1, col2: w.col2 }))
}

/**
 * What to call a pool run, and which languages it speaks.
 *
 * A saved test uses its own name. One list uses the list's. An ad-hoc run over several is
 * named for what it is — "3 lists" — because that is the only true thing available, and
 * inventing a title would put a name on screen the user never chose.
 *
 * Returns null when the spec resolves to no lists at all: there is then no language pair,
 * and a run that cannot be spoken cannot be started. The pair comes from the first
 * RESOLVABLE list, which is `poolLanguages`' rule already — reimplementing it here would
 * be a second answer to "which language is this pool in".
 */
export function poolSubject(
  lists: readonly WordList[],
  spec: PoolSpec,
  name?: string,
): DrillSubject | null {
  const langs = poolLanguages(lists, spec.listIds)
  if (!langs) return null

  const resolved = spec.listIds
    .map((id) => lists.find((l) => l.id === id))
    .filter((l): l is WordList => l !== undefined)

  return {
    name: name ?? (resolved.length === 1 ? resolved[0]!.name : `${resolved.length} lists`),
    col1Lang: langs.col1Lang,
    col2Lang: langs.col2Lang,
  }
}

/**
 * The one list this run is of, or `''` when it spans several.
 *
 * `Session.listId`'s honest value. Nothing reads that field for behaviour — `restartShuffled`
 * carries it and `drillRepo` validates its type — but `''` is already its "no list" value
 * (`createSession` defaults to it), so a multi-list run says so rather than quietly naming
 * whichever list happened to come first.
 */
export function runListId(run: DrillRun): string {
  const first = run.words[0]?.listId ?? ''
  return run.words.every((w) => w.listId === first) ? first : ''
}
