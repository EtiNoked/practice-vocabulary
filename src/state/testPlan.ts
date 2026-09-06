import type { TestPlan } from './drillRun'
import type { WordList } from './types'

/**
 * A test you have kept, under a name.
 *
 * A DEFINITION, not a snapshot of a run (011 D-5). Running it evaluates it against the
 * lists and the history as they stand today — which is the whole point of naming one:
 * "my weak verbs" has to still mean your weak verbs in March, not the twelve words that
 * were weak the day you saved it.
 *
 * Closer to a `WordList` than to a `SessionRecord`, and stored like one: its own
 * collection, mutable, deletable. History is a log and cannot be rewritten; this is a
 * document and is meant to be edited.
 */
export interface SavedTest extends TestPlan {
  readonly id: string
  readonly name: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** Matches `MAX_LISTS`. Tests are tiny, but localStorage is not infinite. */
export const MAX_TESTS = 50

/**
 * The offered caps.
 *
 * Deliberately NOT the game's `COUNT_CHIPS`, which holds the same three numbers today for
 * an unrelated reason: a game is bounded by its clock (50 words × 10s is eight minutes)
 * and a test is bounded only by its pool. One shared constant would couple two limits
 * that have nothing to do with each other, so the next change to either would silently
 * move both.
 */
export const TEST_COUNT_CHIPS: readonly number[] = [10, 15, 20]

/**
 * Whether a pool can be drilled at all.
 *
 * One word, unlike the game's `MIN_POOL` of 4. A cloud of six needs five distractors; a
 * drill card needs a word and its answer, and practising the single thing you keep
 * getting wrong is a perfectly reasonable thing to want.
 */
export function isRunnable(available: number): boolean {
  return available >= 1
}

/** How many of `listIds` still resolve to a list. */
function livingLists(plan: TestPlan, lists: readonly WordList[]): WordList[] {
  return plan.spec.listIds
    .map((id) => lists.find((l) => l.id === id))
    .filter((l): l is WordList => l !== undefined)
}

/**
 * A saved test's configuration, in one line: "3 lists · words I got wrong · 15 of 34".
 *
 * `available` is computed by the caller — it is `poolSize` against today's lists and
 * today's history, and it is deliberately NOT stored on the test (011 FR-14). A number
 * saved alongside the definition would be wrong by the next drill, and wrong in the
 * direction that matters: it would claim words the user has since learned.
 *
 * Written here rather than in the row that renders it so that the builder's preview and
 * the home screen's list cannot describe the same test two different ways.
 */
export function describeTest(
  plan: TestPlan,
  lists: readonly WordList[],
  available: number,
): string {
  const living = livingLists(plan, lists)
  // Said plainly, not shown as "0 lists": the test is not broken, its lists were deleted,
  // and only one of those two sentences tells the user what to do about it.
  if (living.length === 0) return 'No lists left — this test can’t run'

  const where = living.length === 1 ? living[0]!.name : `${living.length} lists`
  const which = plan.spec.source === 'missed' ? 'words I got wrong' : 'all words'

  const howMany =
    available === 0
      ? 'nothing to practise yet'
      : plan.count === null || plan.count >= available
        ? // "all 6" rather than "15 of 6": a cap above the pool asks the whole pool, and
          // repeating the saved number would describe a test that cannot happen.
          `all ${available}`
        : `${plan.count} of ${available}`

  return `${where} · ${which} · ${howMany}`
}
