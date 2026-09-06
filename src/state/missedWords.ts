import type { MarkResult, WordList, WordPair } from './types'

/**
 * Which slice of history a missed-words drill is built from.
 *
 * Rolling from `now`, deliberately, rather than calendar-aligned: "the last
 * week" at 09:00 on Monday should reach back to last Tuesday, not to four days
 * ago. `ReviewScreen`'s day headings are the opposite — a calendar idea — and
 * the two are kept apart on purpose.
 */
export type ReviewWindow = 'day' | 'week' | 'month' | 'all'

export const REVIEW_WINDOWS: readonly ReviewWindow[] = ['day', 'week', 'month', 'all']

/** Chip labels. Prose ("in the last week") is assembled by the components. */
export const WINDOW_LABELS: Record<ReviewWindow, string> = {
  day: 'Today',
  week: 'This week',
  month: 'This month',
  all: 'All time',
}

/** For a sentence: "12 words you missed <this>". */
export const WINDOW_PHRASES: Record<ReviewWindow, string> = {
  day: 'today',
  week: 'in the last week',
  month: 'in the last month',
  all: 'so far',
}

const DAY_MS = 86_400_000

const WINDOW_MS: Record<ReviewWindow, number | null> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  all: null,
}

/**
 * The key separator: a NUL, which cannot occur in a pasted vocabulary list.
 *
 * A space would NOT be safe here — ('a', 'b c') and ('a b', 'c') would both fold
 * to "a b c" and merge two different words into one.
 */
const SEP = '\u0000'

/**
 * Word identity ACROSS sessions and across list edits.
 *
 * NOT `WordPair.id`. `ListEditor.handleConfirm` re-mints every pair id on every
 * save, updates included, so the same untouched word has a different id before
 * and after any edit to its list — and two records that straddle an edit
 * disagree about a word neither of them touched. Keying on id makes the missed
 * set silently empty the first time a user fixes a typo: no error, no symptom,
 * until weeks later when it reads as "it forgot everything".
 *
 * Content keying is also the more correct rule on its own terms. Change what a
 * word SAYS and it genuinely is a different word to practise: the old one should
 * fall out of the set and the new one should start clean. That behaviour comes
 * for free here rather than needing a rule of its own.
 *
 * NFC, not NFD: a French list can carry an accented letter precomposed from one
 * paste and decomposed from a hand-typed correction, and those are one word.
 *
 * `toLowerCase`, not `toLocaleLowerCase`: locale casing would make the key
 * depend on the device's locale rather than on the words, so Turkish dotless-i
 * would key the same word two ways on two phones.
 */
export function wordKey(pair: Pick<WordPair, 'col1' | 'col2'>): string {
  const fold = (value: string) => value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
  return fold(pair.col1) + SEP + fold(pair.col2)
}

/**
 * The shape `collectMissed` actually reads.
 *
 * `SessionRecord` satisfies this structurally, so widening the parameter to it was a
 * TYPE-ONLY change with no call-site churn — and it is what lets a finished GAME be read
 * by this same still-missed engine (008 D-3). A game spans several lists and has no
 * `SessionRecord` shape to offer, so it projects itself into one of these per contributing
 * list (`gameMissSources`) and arrives here indistinguishable from a drill.
 *
 * The alternative was a second implementation of "still missed" for games. There is
 * exactly one in this codebase, deliberately: the rule is subtle enough (see the
 * OLDEST-FIRST sort below) that a second copy would drift within a release.
 *
 * Do NOT narrow this back to `SessionRecord`. Every real call site passes one, so the
 * app would go on compiling and only the game would quietly lose its history.
 */
export interface MissSource {
  listId: string
  finishedAt: number
  wrongPairs: WordPair[]
  /** Absent means "predates right-answer recording" — see `SessionRecord.rightPairs`. */
  rightPairs?: WordPair[]
}

export interface MissedWord {
  pair: WordPair
  /** Times marked wrong within the window. */
  misses: number
  /** Times seen at all within the window. Captured for a future mastery view. */
  attempts: number
  lastMissedAt: number
}

export interface MissedSet {
  words: MissedWord[]
  /**
   * At least one record in the window predates right-answer recording, so a word
   * the user has since fixed may still be listed. Surfaced as one line of copy —
   * the alternative is presenting a stale set as a fresh one.
   */
  degraded: boolean
  /** Records considered. Separates "no practice in this window" from "nothing missed". */
  records: number
}

/**
 * The words from `listId` that the user is STILL getting wrong within `window`.
 *
 * Still-missed, not ever-missed: a word counts only if its most recent verdict in
 * the window was wrong. Answer it correctly in a later drill and it drops out,
 * so the set shrinks as the user learns — which is the entire point of storing
 * right answers at all.
 *
 * Pure, and `now` is a parameter: the whole suite runs without fake timers, and
 * every chip on a screen can be computed against one agreed millisecond.
 */
export function collectMissed(
  records: readonly MissSource[],
  options: {
    listId: string
    window: ReviewWindow
    now: number
    /** The live list, when it still exists. Absent or null means it was deleted. */
    list?: WordList | null
  },
): MissedSet {
  const span = WINDOW_MS[options.window]
  const cutoff = span === null ? Number.NEGATIVE_INFINITY : options.now - span

  const inWindow = records.filter((r) => r.listId === options.listId && r.finishedAt >= cutoff)

  /*
   * OLDEST FIRST, and the whole still-missed rule lives in this sort: a later
   * drill's verdict has to overwrite an earlier one. Reverse it — or trust the
   * caller's order, which is newest-first everywhere in this app — and
   * "still missed" collapses into "missed once, ever", so the set never shrinks.
   */
  const ordered = [...inWindow].sort((a, b) => a.finishedAt - b.finishedAt)

  interface Entry {
    pair: WordPair
    misses: number
    attempts: number
    last: MarkResult
    lastMissedAt: number
  }
  const seen = new Map<string, Entry>()

  const visit = (record: MissSource, pair: WordPair, result: MarkResult) => {
    const key = wordKey(pair)
    const entry = seen.get(key) ?? { pair, misses: 0, attempts: 0, last: result, lastMissedAt: 0 }
    // Keep the freshest spelling: a later drill saw a later version of the word.
    entry.pair = pair
    entry.attempts += 1
    entry.last = result
    if (result === 'wrong') {
      entry.misses += 1
      entry.lastMissedAt = record.finishedAt
    }
    seen.set(key, entry)
  }

  for (const record of ordered) {
    for (const pair of record.wrongPairs) visit(record, pair, 'wrong')
    /*
     * A record with no `rightPairs` contributes wrong marks and never a right
     * one. So for pre-006 history the still-missed rule degrades, ON ITS OWN,
     * into "every word missed at least once" — no branch, no special case, and
     * no second code path to keep correct. `degraded` below is the only thing
     * that has to know, and all it does is choose a sentence.
     */
    for (const pair of record.rightPairs ?? []) visit(record, pair, 'right')
  }

  /*
   * The live list wins over the snapshot, so a corrected translation is what
   * gets drilled. A word absent from it was deleted by the user, and you cannot
   * practise a word you removed.
   *
   * A word whose TEXT was edited has a different key, so it is absent here too
   * and drops out — which is correct: it is a new word with no history.
   */
  const live = options.list
    ? new Map(options.list.pairs.map((p) => [wordKey(p), p] as const))
    : null

  const words: MissedWord[] = []
  for (const entry of seen.values()) {
    if (entry.last !== 'wrong') continue
    let pair = entry.pair
    if (live) {
      const current = live.get(wordKey(entry.pair))
      if (!current) continue
      pair = current
    }
    words.push({
      pair,
      misses: entry.misses,
      attempts: entry.attempts,
      lastMissedAt: entry.lastMissedAt,
    })
  }

  // Worst first, then most recent — the order a user would choose to work in.
  words.sort((a, b) => b.misses - a.misses || b.lastMissedAt - a.lastMissedAt)

  return {
    words,
    degraded: ordered.some((r) => r.rightPairs === undefined),
    records: ordered.length,
  }
}

/**
 * Pairs for the drill, with fresh, guaranteed-unique ids.
 *
 * A missed set is assembled from several snapshots taken across several list
 * versions, so nothing guarantees its source ids are distinct — and
 * `currentPair` finds by id, so a duplicate would render the wrong card and mark
 * the wrong word. Re-minting removes that whole class of bug.
 *
 * Safe precisely because identity here is content rather than id (see
 * `wordKey`): the ids on the resulting `SessionRecord` mean nothing to anyone
 * and are never compared again.
 */
export function toDrillPairs(words: readonly MissedWord[]): WordPair[] {
  return words.map((w, i) => ({ id: `missed-${i}`, col1: w.pair.col1, col2: w.pair.col2 }))
}

/** How many words each window would drill. One pass per window. */
export function missedCounts(
  records: readonly MissSource[],
  options: { listId: string; now: number; list?: WordList | null },
): Record<ReviewWindow, number> {
  return Object.fromEntries(
    REVIEW_WINDOWS.map((w) => [w, collectMissed(records, { ...options, window: w }).words.length]),
  ) as Record<ReviewWindow, number>
}
