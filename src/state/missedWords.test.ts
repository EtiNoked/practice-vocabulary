import { describe, expect, it } from 'vitest'
import { collectMissed, missedCounts, toDrillPairs, wordKey } from './missedWords'
import type { MissSource } from './missedWords'
import type { SessionRecord, WordList, WordPair } from './types'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 8, 5, 12, 0, 0)

const pair = (id: string, col1: string, col2: string): WordPair => ({ id, col1, col2 })

const list: WordList = {
  id: 'l1',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [
    pair('p1', 'daughter', 'dochter'),
    pair('p2', 'son', 'zoon'),
    pair('p3', 'uncle', 'oom'),
  ],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

/**
 * A record. `rightPairs` is passed explicitly as `null` to mean "this is a
 * pre-006 record with no right-answer detail", because that case has to be
 * exercised deliberately rather than by forgetting an argument.
 */
const rec = (
  finishedAt: number,
  wrongPairs: WordPair[],
  rightPairs: WordPair[] | null = [],
  over: Partial<SessionRecord> = {},
): SessionRecord => ({
  id: `r-${finishedAt}-${Math.random().toString(36).slice(2, 6)}`,
  listId: 'l1',
  listName: 'Lesson 3',
  right: rightPairs?.length ?? 0,
  wrong: wrongPairs.length,
  total: wrongPairs.length + (rightPairs?.length ?? 0),
  pct: 0,
  wrongPairs,
  ...(rightPairs === null ? {} : { rightPairs }),
  finishedAt,
  mode: 'full',
  partial: false,
  ...over,
})

const missed = (records: SessionRecord[], over: Partial<Parameters<typeof collectMissed>[1]> = {}) =>
  collectMissed(records, { listId: 'l1', window: 'all', now: NOW, list, ...over })

const texts = (records: SessionRecord[], over = {}) =>
  missed(records, over).words.map((w) => w.pair.col2)

describe('wordKey — identity that survives an edit', () => {
  it('folds case, surrounding space and doubled inner space', () => {
    expect(wordKey(pair('a', '  The   Daughter ', 'DOCHTER'))).toBe(
      wordKey(pair('b', 'the daughter', 'dochter')),
    )
  })

  it('treats a precomposed and a decomposed accent as one word', () => {
    /*
     * A French list can carry one spelling from a paste and the other from a
     * hand-typed correction, and they are the same word. Written as explicit code
     * points, not as two literals that this file's own encoding would silently
     * normalise into each other — the test has to be able to fail.
     */
    const precomposed = '\u00e9t\u00e9' // e-acute
    const decomposed = 'e\u0301te\u0301' // e + combining acute
    expect(precomposed).not.toBe(decomposed)
    expect(wordKey(pair('a', 'summer', precomposed))).toBe(
      wordKey(pair('b', 'summer', decomposed)),
    )
  })

  it('does not let the two columns bleed into each other', () => {
    // A space separator would fold ('a', 'b c') and ('a b', 'c') into one key.
    expect(wordKey(pair('x', 'a', 'b c'))).not.toBe(wordKey(pair('y', 'a b', 'c')))
  })

  it('IGNORES the pair id entirely', () => {
    /*
     * 006 F-2, and the reason this module exists. ListEditor re-mints every pair
     * id on every save, so the same untouched word has a different id before and
     * after any edit to its list. Keying on id makes the missed set silently
     * empty the first time a user fixes a typo.
     */
    expect(wordKey(pair('before-edit', 'son', 'zoon'))).toBe(
      wordKey(pair('after-edit', 'son', 'zoon')),
    )
  })

  it('keeps genuinely different words apart', () => {
    expect(wordKey(pair('a', 'son', 'zoon'))).not.toBe(wordKey(pair('b', 'sun', 'zon')))
  })
})

describe('still-missed, not ever-missed', () => {
  it('drops a word answered right in a later drill', () => {
    const records = [
      rec(NOW - 3 * DAY, [pair('p1', 'daughter', 'dochter')], []),
      rec(NOW - 1 * DAY, [], [pair('p1', 'daughter', 'dochter')]),
    ]
    expect(texts(records)).toEqual([])
  })

  it('keeps a word missed again in a later drill, and counts both misses', () => {
    const records = [
      rec(NOW - 3 * DAY, [pair('p1', 'daughter', 'dochter')], []),
      rec(NOW - 1 * DAY, [pair('p1', 'daughter', 'dochter')], []),
    ]
    const [word] = missed(records).words
    expect(word?.pair.col2).toBe('dochter')
    expect(word?.misses).toBe(2)
    expect(word?.attempts).toBe(2)
  })

  it('keeps a word that was right first and wrong most recently', () => {
    const records = [
      rec(NOW - 3 * DAY, [], [pair('p1', 'daughter', 'dochter')]),
      rec(NOW - 1 * DAY, [pair('p1', 'daughter', 'dochter')], []),
    ]
    expect(texts(records)).toEqual(['dochter'])
  })

  it('sorts the records itself rather than trusting the order it is given', () => {
    // App hands these over newest-first. Folding in that order would make a fixed
    // word look permanently missed.
    const older = rec(NOW - 3 * DAY, [pair('p1', 'daughter', 'dochter')], [])
    const newer = rec(NOW - 1 * DAY, [], [pair('p1', 'daughter', 'dochter')])
    expect(texts([newer, older])).toEqual([])
    expect(texts([older, newer])).toEqual([])
  })

  it('matches a word across an edit that changed every id', () => {
    // F-2 end to end: same words, different ids, two records.
    const records = [
      rec(NOW - 3 * DAY, [pair('old-id-7', 'daughter', 'dochter')], []),
      rec(NOW - 1 * DAY, [pair('new-id-42', 'daughter', 'dochter')], []),
    ]
    const words = missed(records).words
    expect(words).toHaveLength(1)
    expect(words[0]?.misses).toBe(2)
  })
})

describe('records written before right answers were saved', () => {
  it('falls back to every-word-missed, and says so', () => {
    const records = [
      rec(NOW - 3 * DAY, [pair('p1', 'daughter', 'dochter')], null),
      // The word was answered right here, but a legacy record cannot say so.
      rec(NOW - 1 * DAY, [], null),
    ]
    const set = missed(records)
    expect(set.words.map((w) => w.pair.col2)).toEqual(['dochter'])
    expect(set.degraded).toBe(true)
  })

  it('is degraded when only some records are legacy', () => {
    expect(missed([rec(NOW - DAY, [], null), rec(NOW, [], [])]).degraded).toBe(true)
  })

  it('is not degraded when every record carries its right answers', () => {
    expect(missed([rec(NOW - DAY, [], []), rec(NOW, [], [])]).degraded).toBe(false)
  })

  it('lets a new record still clear a word first missed in a legacy one', () => {
    const records = [
      rec(NOW - 3 * DAY, [pair('p1', 'daughter', 'dochter')], null),
      rec(NOW - 1 * DAY, [], [pair('p1', 'daughter', 'dochter')]),
    ]
    expect(texts(records)).toEqual([])
  })
})

describe('windows', () => {
  const missedThen = (at: number, window: Parameters<typeof missed>[1]) =>
    missed([rec(at, [pair('p1', 'daughter', 'dochter')], [])], window)

  it('excludes a drill from 25 hours ago from today, but keeps it in the week', () => {
    expect(missedThen(NOW - 25 * 3_600_000, { window: 'day' }).words).toHaveLength(0)
    expect(missedThen(NOW - 25 * 3_600_000, { window: 'week' }).words).toHaveLength(1)
  })

  it('includes a drill exactly on the week boundary', () => {
    expect(missedThen(NOW - 7 * DAY, { window: 'week' }).words).toHaveLength(1)
  })

  it('excludes a drill just outside the month', () => {
    expect(missedThen(NOW - 31 * DAY, { window: 'month' }).words).toHaveLength(0)
    expect(missedThen(NOW - 31 * DAY, { window: 'all' }).words).toHaveLength(1)
  })

  it('reaches back a year for all time', () => {
    expect(missedThen(NOW - 365 * DAY, { window: 'all' }).words).toHaveLength(1)
  })

  it('never mixes in another list', () => {
    const other = rec(NOW - DAY, [pair('x', 'bread', 'brood')], [], { listId: 'l2' })
    expect(texts([other])).toEqual([])
  })

  it('reports how many records it considered', () => {
    const set = missed([rec(NOW - DAY, [], []), rec(NOW - 40 * DAY, [], [])], { window: 'month' })
    expect(set.records).toBe(1)
  })
})

describe('resolving against the live list', () => {
  it('drills the corrected translation, not the stale snapshot', () => {
    // The record remembers what the word said at drill time; the list is the
    // truth now.
    const fixed: WordList = {
      ...list,
      pairs: [pair('new1', 'daughter', 'de dochter'), pair('new2', 'son', 'zoon')],
    }
    const records = [rec(NOW - DAY, [pair('p1', 'daughter', 'de dochter')], [])]
    expect(texts(records, { list: fixed })).toEqual(['de dochter'])
  })

  it('drops a word that has since been deleted from the list', () => {
    const trimmed: WordList = { ...list, pairs: [pair('p2', 'son', 'zoon')] }
    const records = [rec(NOW - DAY, [pair('p1', 'daughter', 'dochter')], [])]
    expect(texts(records, { list: trimmed })).toEqual([])
  })

  it('treats a re-worded translation as a different word, so it drops out', () => {
    // Changing what a word SAYS makes it a new word to practise. The old one has
    // no history to carry forward and the new one starts clean.
    const reworded: WordList = { ...list, pairs: [pair('p1', 'daughter', 'het dochtertje')] }
    const records = [rec(NOW - DAY, [pair('p1', 'daughter', 'dochter')], [])]
    expect(texts(records, { list: reworded })).toEqual([])
  })

  it('keeps the snapshots when the list has been deleted', () => {
    const records = [rec(NOW - DAY, [pair('p1', 'daughter', 'dochter')], [])]
    expect(texts(records, { list: null })).toEqual(['dochter'])
  })
})

describe('ordering and drill pairs', () => {
  it('puts the most-missed word first, then the most recently missed', () => {
    const records = [
      rec(NOW - 5 * DAY, [pair('p2', 'son', 'zoon')], []),
      rec(NOW - 4 * DAY, [pair('p2', 'son', 'zoon')], []),
      rec(NOW - 3 * DAY, [pair('p3', 'uncle', 'oom')], []),
      rec(NOW - 1 * DAY, [pair('p1', 'daughter', 'dochter')], []),
    ]
    expect(texts(records)).toEqual(['zoon', 'dochter', 'oom'])
  })

  it('mints unique ids even when every source pair shares one', () => {
    /*
     * A missed set is assembled from snapshots taken across several list
     * versions, so nothing guarantees the source ids are distinct — and
     * currentPair() finds by id, so a duplicate would render the wrong card.
     */
    const words = [
      { pair: pair('same', 'a', 'x'), misses: 1, attempts: 1, lastMissedAt: 1 },
      { pair: pair('same', 'b', 'y'), misses: 1, attempts: 1, lastMissedAt: 1 },
    ]
    const ids = toDrillPairs(words).map((p) => p.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('carries the words through unchanged', () => {
    const words = [{ pair: pair('p1', 'daughter', 'dochter'), misses: 2, attempts: 3, lastMissedAt: 9 }]
    expect(toDrillPairs(words)[0]).toMatchObject({ col1: 'daughter', col2: 'dochter' })
  })
})

describe('missedCounts', () => {
  it('counts every window in one call', () => {
    const records = [
      rec(NOW - 2 * 3_600_000, [pair('p1', 'daughter', 'dochter')], []),
      rec(NOW - 3 * DAY, [pair('p2', 'son', 'zoon')], []),
      rec(NOW - 20 * DAY, [pair('p3', 'uncle', 'oom')], []),
    ]
    expect(missedCounts(records, { listId: 'l1', now: NOW, list })).toEqual({
      day: 1,
      week: 2,
      month: 3,
      all: 3,
    })
  })

  it('is all zeroes for a list with no history', () => {
    expect(missedCounts([], { listId: 'l1', now: NOW, list })).toEqual({
      day: 0,
      week: 0,
      month: 0,
      all: 0,
    })
  })
})

describe('MissSource — the structural minimum collectMissed actually reads (008 D-3)', () => {
  /*
   * These two tests exist to pin a TYPE, so they are deliberately thin on
   * assertions: the point is that the file compiles at all. `collectMissed` reads
   * four fields, and 008 needs a game's results — which are not SessionRecords and
   * never will be — to flow through the same still-missed engine as a drill's.
   *
   * Narrowing the parameter back to SessionRecord fails `npm run typecheck` here,
   * which is the only place that would catch it: every real call site passes a
   * SessionRecord and would go on compiling perfectly well.
   */
  const source: MissSource = {
    listId: 'l1',
    finishedAt: NOW - DAY,
    wrongPairs: [pair('x1', 'daughter', 'dochter')],
    rightPairs: [pair('x2', 'son', 'zoon')],
  }

  it('accepts a bare miss source that is not a SessionRecord', () => {
    const set = collectMissed([source], { listId: 'l1', window: 'all', now: NOW, list })
    expect(set.words.map((w) => w.pair.col1)).toEqual(['daughter'])
  })

  it('accepts one in missedCounts too', () => {
    expect(missedCounts([source], { listId: 'l1', now: NOW, list }).all).toBe(1)
  })

  it('is satisfied structurally by SessionRecord, so no call site had to change', () => {
    const record: MissSource = rec(NOW - DAY, [pair('p1', 'daughter', 'dochter')], [])
    expect(record.listId).toBe('l1')
  })
})
