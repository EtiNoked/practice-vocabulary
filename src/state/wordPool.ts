import type { LangCode } from '../lang/languages'
import { collectMissed, wordKey, type MissSource, type ReviewWindow } from './missedWords'
import type { WordList, WordPair } from './types'

/**
 * Choosing words from settings — the shared answer to "given this, which words?".
 *
 * DELIBERATELY NOT inside a feature directory (008 D-13). The question is not a game
 * question: a scheduled-review mode, a flashcard deck, a printable worksheet and an
 * export all ask it identically, and only the verb afterwards differs. Written inside
 * the first caller it would have to be extracted under pressure later, by which time
 * that caller's vocabulary would be baked into it.
 *
 * What that costs the module, and what it must keep costing it (008 NFR-11):
 *
 *   no `count`, and no sampling. Taking n of them is the CALLER's business — a game
 *   takes 15 at random, an export takes all of them in list order, a flashcard mode
 *   would take the 20 least recently seen. Push sampling in here and the next caller
 *   has to fight it back out.
 *
 *   no clock, no Math.random. `now` arrives as a parameter, exactly as it does in
 *   missedWords.ts, so a screen's live count and the pool it eventually builds can be
 *   pinned to one agreed millisecond.
 *
 *   no import from any feature directory. Guarded in test/invariants.test.ts, because
 *   this is the kind of boundary that dissolves with no error and no failing test.
 */

export type PoolSource = 'all' | 'missed'

/**
 * WHICH words a caller wants, said declaratively.
 *
 * A VALUE, not an argument list, and that is the whole design. A spec can be stored in
 * a record, compared for equality, replayed and shown back to the user as the settings
 * they chose — so "the same words again, freshly drawn" costs a caller nothing. 008
 * carries one inside every Game for exactly that (008 D-9).
 */
export interface PoolSpec {
  /**
   * Source lists, IN THE ORDER THE USER PICKED THEM.
   *
   * Order is not cosmetic: it decides which list owns a word that appears in two of
   * them (see the dedupe below), and `poolLanguages` reads the first entry.
   */
  readonly listIds: readonly string[]
  readonly source: PoolSource
  /** Consulted only when `source` is 'missed'. Defaults to all time. */
  readonly window?: ReviewWindow
}

/**
 * One selected word, plus where it came from.
 *
 * NOT a WordPair, and the whole difference is `listId`. A pool spans lists, so a word
 * that has lost its origin cannot have a later verdict filed back against the right
 * list — which is how a game's misses reach the drill's missed chips (008 FR-29), and
 * how anything else will do the same.
 *
 * `listName` is denormalised for the reason `SessionRecord.listName` is
 * (sessionRecord.ts): a screen must still read sensibly after the list is deleted.
 */
export interface PooledWord {
  readonly id: string
  readonly col1: string
  readonly col2: string
  readonly listId: string
  readonly listName: string
}

export interface PoolContext {
  /** Every record the store holds. Only read when `source` is 'missed'. */
  readonly records: readonly MissSource[]
  /** Injected, never read from a clock in here. */
  readonly now: number
  /** Prefix for the re-minted ids. Defaults to 'w'. */
  readonly idPrefix?: string
}

export interface PoolListOption {
  list: WordList
  selected: boolean
  /** False when adding it would break the one-language-pair rule. */
  selectable: boolean
  /** Null when selectable. */
  blocked: 'language' | null
}

/** Resolve ids to lists, preserving SELECTION order and skipping what has gone. */
function resolve(lists: readonly WordList[], listIds: readonly string[]): WordList[] {
  const byId = new Map(lists.map((l) => [l.id, l] as const))
  const out: WordList[] = []
  for (const id of listIds) {
    const list = byId.get(id)
    // Skipped, not thrown on: a list can be deleted between choosing it and building.
    if (list) out.push(list)
  }
  return out
}

/**
 * The words `spec` selects.
 *
 * Pure and total. An unresolvable id, an empty selection and a list with no history all
 * return fewer words rather than an error — every caller of this is a screen, and none
 * of them has anything useful to do with a throw.
 */
export function buildWordPool(
  lists: readonly WordList[],
  spec: PoolSpec,
  context: PoolContext,
): PooledWord[] {
  const selected = resolve(lists, spec.listIds)
  const prefix = context.idPrefix ?? 'w'

  /*
   * Keyed by wordKey, so the same word from two lists folds into one entry and the
   * FIRST contributing list keeps it. A Map preserves insertion order, which is what
   * makes "first wins" fall out of the iteration rather than needing a rule of its own.
   */
  const seen = new Map<string, { pair: WordPair; list: WordList }>()

  for (const list of selected) {
    const pairs =
      spec.source === 'all'
        ? list.pairs
        : /*
           * ONE list at a time, because that is collectMissed's contract — it filters on
           * a single listId. Calling it per list keeps 006's still-missed rule intact
           * rather than reimplemented across several; there is exactly one implementation
           * of that rule in this codebase and this must not become the second.
           */
          collectMissed(context.records, {
            listId: list.id,
            window: spec.window ?? 'all',
            now: context.now,
            list,
          }).words.map((w) => w.pair)

    for (const pair of pairs) {
      // A word blank on either side is unpickable and unspeakable — it is not a word.
      if (pair.col1.trim() === '' || pair.col2.trim() === '') continue
      const key = wordKey(pair)
      if (seen.has(key)) continue
      seen.set(key, { pair, list })
    }
  }

  /*
   * Ids are RE-MINTED, never carried through.
   *
   * Ids from different lists guarantee nothing about each other, and ListEditor re-mints
   * every pair id on every save anyway (see wordKey's note in missedWords.ts). A caller
   * that looks a word up by id — which is the normal thing to do — would silently get
   * the wrong one. Safe precisely because identity here is content, not id.
   */
  return [...seen.values()].map(({ pair, list }, i) => ({
    id: `${prefix}${i}`,
    col1: pair.col1,
    col2: pair.col2,
    listId: list.id,
    listName: list.name,
  }))
}

/**
 * How many words `spec` selects.
 *
 * Deliberately the length of the real pool rather than a cheaper count. The number a
 * user is shown and the pool they then get must come from ONE computation — the same
 * reason 006 threads a single `now` through its four window chips. A count of 12 beside
 * a round of 11 is the class of bug this closes by construction rather than by care.
 */
export function poolSize(
  lists: readonly WordList[],
  spec: PoolSpec,
  context: PoolContext,
): number {
  return buildWordPool(lists, spec, context).length
}

/**
 * The language pair a selection has fixed, or null when nothing has fixed one yet.
 *
 * A pool may only combine lists sharing BOTH languages (008 D-6). Speech takes one
 * language code, and — the sharper reason — a lone French option among five Dutch ones
 * can be picked out with no vocabulary at all.
 */
export function poolLanguages(
  lists: readonly WordList[],
  listIds: readonly string[],
): { col1Lang: LangCode; col2Lang: LangCode } | null {
  const first = resolve(lists, listIds)[0]
  if (!first) return null
  return { col1Lang: first.col1Lang, col2Lang: first.col2Lang }
}

/**
 * Every list, with whether it can join the current selection and why not.
 *
 * Returned for ALL lists rather than filtered down, so a picker can disable an
 * incompatible row and state the reason. Disabled beats hidden here for the same reason
 * it does on 006's zero-count chips: a missing control invites the question a disabled
 * one answers.
 */
export function listOptions(
  lists: readonly WordList[],
  listIds: readonly string[],
): PoolListOption[] {
  const chosen = new Set(listIds)
  const pair = poolLanguages(lists, listIds)
  return lists.map((list) => {
    const selected = chosen.has(list.id)
    const compatible =
      pair === null || (list.col1Lang === pair.col1Lang && list.col2Lang === pair.col2Lang)
    // An already-selected list stays selectable whatever the pair says, or a user could
    // fix a selection they no longer want by no route at all.
    const selectable = selected || compatible
    return { list, selected, selectable, blocked: selectable ? null : 'language' }
  })
}

/** Project down to plain pairs, for a caller that has no use for the origin. */
export function toPairs(words: readonly PooledWord[]): WordPair[] {
  return words.map((w) => ({ id: w.id, col1: w.col1, col2: w.col2 }))
}
