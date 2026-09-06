import { describe, expect, it } from 'vitest'
import {
  buildWordPool,
  listOptions,
  poolLanguages,
  poolSize,
  toPairs,
  type PoolContext,
  type PoolSpec,
} from './wordPool'
import { collectMissed, type MissSource } from './missedWords'
import type { WordList, WordPair } from './types'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 8, 6, 12, 0, 0)

const pair = (id: string, col1: string, col2: string): WordPair => ({ id, col1, col2 })

const makeList = (over: Partial<WordList> & Pick<WordList, 'id' | 'name' | 'pairs'>): WordList => ({
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
  ...over,
})

/** en → nl. */
const food = makeList({
  id: 'l1',
  name: 'Food',
  pairs: [pair('p1', 'bread', 'brood'), pair('p2', 'cheese', 'kaas'), pair('p3', 'apple', 'appel')],
})

/** en → nl, and it shares "cheese" with Food. */
const market = makeList({
  id: 'l2',
  name: 'Market',
  pairs: [pair('q1', 'cheese', 'kaas'), pair('q2', 'money', 'geld')],
})

/** en → fr. Cannot join a pool that an en→nl list started. */
const paris = makeList({
  id: 'l3',
  name: 'Paris',
  col2Lang: 'fr',
  pairs: [pair('r1', 'bread', 'pain')],
})

const LISTS = [food, market, paris]

const spec = (over: Partial<PoolSpec> = {}): PoolSpec => ({
  listIds: ['l1'],
  source: 'all',
  ...over,
})

const ctx = (over: Partial<PoolContext> = {}): PoolContext => ({
  records: [],
  now: NOW,
  ...over,
})

/** A miss source, at its structural minimum — no SessionRecord required (008 D-3). */
const missed = (
  listId: string,
  finishedAt: number,
  wrongPairs: WordPair[],
  rightPairs: WordPair[] = [],
): MissSource => ({ listId, finishedAt, wrongPairs, rightPairs })

describe('buildWordPool — source: all', () => {
  it('is empty when nothing is selected', () => {
    expect(buildWordPool(LISTS, spec({ listIds: [] }), ctx())).toEqual([])
  })

  it('takes every word of one list', () => {
    expect(buildWordPool(LISTS, spec(), ctx()).map((w) => w.col1)).toEqual([
      'bread',
      'cheese',
      'apple',
    ])
  })

  it('spans several lists in selection order', () => {
    const pool = buildWordPool(LISTS, spec({ listIds: ['l1', 'l2'] }), ctx())
    expect(pool.map((w) => w.col1)).toEqual(['bread', 'cheese', 'apple', 'money'])
  })

  it('skips a listId that no longer exists rather than throwing', () => {
    // A list can be deleted between choosing it and building the pool.
    const pool = buildWordPool(LISTS, spec({ listIds: ['l1', 'gone'] }), ctx())
    expect(pool).toHaveLength(3)
  })

  it('carries the origin list on every word', () => {
    const pool = buildWordPool(LISTS, spec({ listIds: ['l1', 'l2'] }), ctx())
    const money = pool.find((w) => w.col1 === 'money')
    expect(money).toMatchObject({ listId: 'l2', listName: 'Market' })
  })

  it('drops a word that is blank on either side', () => {
    const ragged = makeList({
      id: 'l9',
      name: 'Ragged',
      pairs: [pair('a', 'ok', 'goed'), pair('b', '   ', 'leeg'), pair('c', 'empty', '')],
    })
    const pool = buildWordPool([ragged], spec({ listIds: ['l9'] }), ctx())
    expect(pool.map((w) => w.col1)).toEqual(['ok'])
  })
})

describe('buildWordPool — de-duplication', () => {
  it('folds a word that appears in two lists into one entry', () => {
    const pool = buildWordPool(LISTS, spec({ listIds: ['l1', 'l2'] }), ctx())
    expect(pool.filter((w) => w.col1 === 'cheese')).toHaveLength(1)
  })

  it('gives the duplicate to the FIRST selected list', () => {
    const pool = buildWordPool(LISTS, spec({ listIds: ['l1', 'l2'] }), ctx())
    expect(pool.find((w) => w.col1 === 'cheese')?.listId).toBe('l1')
  })

  it('follows selection order, so reversing it hands the word to the other list', () => {
    const pool = buildWordPool(LISTS, spec({ listIds: ['l2', 'l1'] }), ctx())
    expect(pool.find((w) => w.col1 === 'cheese')?.listId).toBe('l2')
  })

  it('folds on wordKey, so case and spacing do not split one word in two', () => {
    const shouty = makeList({ id: 'l8', name: 'Shouty', pairs: [pair('z', ' CHEESE ', 'Kaas')] })
    const pool = buildWordPool([food, shouty], spec({ listIds: ['l1', 'l8'] }), ctx())
    expect(pool.filter((w) => w.col1.trim().toLowerCase() === 'cheese')).toHaveLength(1)
  })
})

describe('buildWordPool — ids', () => {
  it('re-mints ids, because ids from different lists guarantee nothing', () => {
    const pool = buildWordPool(LISTS, spec({ listIds: ['l1', 'l2'] }), ctx())
    expect(pool.map((w) => w.id)).toEqual(['w0', 'w1', 'w2', 'w3'])
  })

  it('mints them unique even across lists whose own ids collide', () => {
    const clashing = makeList({ id: 'l7', name: 'Clash', pairs: [pair('p1', 'water', 'water')] })
    const pool = buildWordPool([food, clashing], spec({ listIds: ['l1', 'l7'] }), ctx())
    expect(new Set(pool.map((w) => w.id)).size).toBe(pool.length)
  })

  it('honours idPrefix', () => {
    const pool = buildWordPool(LISTS, spec(), ctx({ idPrefix: 'q' }))
    expect(pool.map((w) => w.id)).toEqual(['q0', 'q1', 'q2'])
  })
})

describe('buildWordPool — source: missed', () => {
  const records = [
    missed('l1', NOW - 2 * DAY, [pair('p1', 'bread', 'brood')], [pair('p2', 'cheese', 'kaas')]),
    missed('l2', NOW - 2 * DAY, [pair('q2', 'money', 'geld')], []),
  ]

  it('takes only what is still missed, per list', () => {
    const pool = buildWordPool(LISTS, spec({ listIds: ['l1', 'l2'], source: 'missed' }), ctx({ records }))
    expect(pool.map((w) => w.col1).sort()).toEqual(['bread', 'money'])
  })

  it('agrees exactly with collectMissed run per list — one still-missed rule, not two', () => {
    const pool = buildWordPool(LISTS, spec({ listIds: ['l1'], source: 'missed' }), ctx({ records }))
    const direct = collectMissed(records, { listId: 'l1', window: 'all', now: NOW, list: food })
    expect(pool.map((w) => w.col1)).toEqual(direct.words.map((w) => w.pair.col1))
  })

  it('drops a word once it has been answered right again', () => {
    const later = [
      ...records,
      missed('l1', NOW - DAY, [], [pair('p1', 'bread', 'brood')]),
    ]
    const pool = buildWordPool(LISTS, spec({ listIds: ['l1'], source: 'missed' }), ctx({ records: later }))
    expect(pool.map((w) => w.col1)).toEqual([])
  })

  it('defaults to the all-time window', () => {
    const old = [missed('l1', NOW - 90 * DAY, [pair('p1', 'bread', 'brood')], [])]
    const pool = buildWordPool(LISTS, spec({ listIds: ['l1'], source: 'missed' }), ctx({ records: old }))
    expect(pool.map((w) => w.col1)).toEqual(['bread'])
  })

  it('honours an explicit window when one is given', () => {
    const old = [missed('l1', NOW - 90 * DAY, [pair('p1', 'bread', 'brood')], [])]
    const pool = buildWordPool(
      LISTS,
      spec({ listIds: ['l1'], source: 'missed', window: 'week' }),
      ctx({ records: old }),
    )
    expect(pool).toEqual([])
  })

  it('prefers the live list, so a corrected translation is what gets drilled', () => {
    const stale = [missed('l1', NOW - DAY, [pair('p1', 'bread', 'brooood')], [])]
    const pool = buildWordPool(LISTS, spec({ listIds: ['l1'], source: 'missed' }), ctx({ records: stale }))
    expect(pool).toEqual([])
  })

  it('is empty when there is no history at all', () => {
    expect(buildWordPool(LISTS, spec({ source: 'missed' }), ctx())).toEqual([])
  })
})

describe('poolSize', () => {
  it('is the length of the pool it describes — one computation, not two', () => {
    for (const s of [
      spec({ listIds: [] }),
      spec(),
      spec({ listIds: ['l1', 'l2'] }),
      spec({ listIds: ['l1', 'l2'], source: 'missed' }),
      spec({ listIds: ['nope'] }),
    ]) {
      const c = ctx({ records: [missed('l1', NOW - DAY, [pair('p1', 'bread', 'brood')], [])] })
      expect(poolSize(LISTS, s, c)).toBe(buildWordPool(LISTS, s, c).length)
    }
  })
})

describe('poolLanguages', () => {
  it('is null while nothing is selected', () => {
    expect(poolLanguages(LISTS, [])).toBeNull()
  })

  it('is the first selected list’s pair', () => {
    expect(poolLanguages(LISTS, ['l1', 'l2'])).toEqual({ col1Lang: 'en', col2Lang: 'nl' })
  })

  it('is null when the only selected id does not resolve', () => {
    expect(poolLanguages(LISTS, ['gone'])).toBeNull()
  })
})

describe('listOptions', () => {
  it('offers everything while nothing is selected', () => {
    expect(listOptions(LISTS, []).every((o) => o.selectable && o.blocked === null)).toBe(true)
  })

  it('blocks a different language pair once one is chosen', () => {
    const options = listOptions(LISTS, ['l1'])
    expect(options.find((o) => o.list.id === 'l3')).toMatchObject({
      selectable: false,
      blocked: 'language',
    })
  })

  it('keeps compatible lists selectable', () => {
    expect(listOptions(LISTS, ['l1']).find((o) => o.list.id === 'l2')?.selectable).toBe(true)
  })

  it('marks what is selected', () => {
    const options = listOptions(LISTS, ['l1'])
    expect(options.filter((o) => o.selected).map((o) => o.list.id)).toEqual(['l1'])
  })

  it('always leaves a selected list selectable, so it can be turned off again', () => {
    expect(listOptions(LISTS, ['l3']).find((o) => o.list.id === 'l3')?.selectable).toBe(true)
  })

  it('releases the block when the selection empties (008 FR-4)', () => {
    expect(listOptions(LISTS, []).find((o) => o.list.id === 'l3')?.blocked).toBeNull()
  })

  it('returns every list, in the order given', () => {
    expect(listOptions(LISTS, ['l1']).map((o) => o.list.id)).toEqual(['l1', 'l2', 'l3'])
  })
})

describe('toPairs', () => {
  it('drops the origin and keeps id and both sides', () => {
    const pool = buildWordPool(LISTS, spec(), ctx())
    expect(toPairs(pool)).toEqual([
      { id: 'w0', col1: 'bread', col2: 'brood' },
      { id: 'w1', col1: 'cheese', col2: 'kaas' },
      { id: 'w2', col1: 'apple', col2: 'appel' },
    ])
  })
})

describe('the module stays feature-agnostic (008 NFR-11)', () => {
  /*
   * The boundary IS the feature here (008 D-13): this module answers "which words does
   * this spec select?" for anybody, and the moment it learns what a question or a score
   * is, the next caller has to fight that back out.
   *
   * Asserted as an export surface rather than by scanning prose — a comment naming the
   * first caller is useful, an import from it is the actual leak. The import itself is
   * guarded in test/invariants.test.ts, which can see the source.
   */
  it('exports exactly the selection API and nothing feature-shaped', async () => {
    const module = await import('./wordPool')
    expect(Object.keys(module).sort()).toEqual([
      'buildWordPool',
      'listOptions',
      'poolLanguages',
      'poolSize',
      'toPairs',
    ])
  })
})
