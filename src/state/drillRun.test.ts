import { describe, expect, it } from 'vitest'
import {
  canRedraw,
  poolSubject,
  redraw,
  runFromList,
  runFromPool,
  runListId,
  runPairs,
  type DrillRun,
  type TestPlan,
} from './drillRun'
import { seededRng } from './session'
import type { PooledWord } from './wordPool'
import type { WordList, WordPair } from './types'

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

const food = makeList({
  id: 'l1',
  name: 'Food',
  pairs: [pair('p1', 'bread', 'brood'), pair('p2', 'cheese', 'kaas'), pair('p3', 'apple', 'appel')],
})

const paris = makeList({ id: 'l3', name: 'Paris', col2Lang: 'fr', pairs: [pair('r1', 'a', 'b')] })

const pooled = (n: number, listId = 'l1', listName = 'Food'): PooledWord[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `w${i}`,
    col1: `en${i}`,
    col2: `nl${i}`,
    listId,
    listName,
  }))

const plan = (over: Partial<TestPlan> = {}): TestPlan => ({
  spec: { listIds: ['l1'], source: 'all' },
  count: 10,
  ...over,
})

const SUBJECT = { name: '2 lists', col1Lang: 'en', col2Lang: 'nl' } as const

describe('runFromList', () => {
  it('keeps the list as its own subject, structurally', () => {
    const run = runFromList(food)
    // The whole point of DrillSubject's field names (011 D-8): a WordList IS one.
    expect(run.subject.name).toBe('Food')
    expect(run.subject.col1Lang).toBe('en')
    expect(run.subject.col2Lang).toBe('nl')
  })

  it('preserves pair ids and stamps every word with its origin list', () => {
    const run = runFromList(food)
    expect(run.words.map((w) => w.id)).toEqual(['p1', 'p2', 'p3'])
    expect(run.words.every((w) => w.listId === 'l1' && w.listName === 'Food')).toBe(true)
    expect(run.words[1]).toMatchObject({ col1: 'cheese', col2: 'kaas' })
  })

  it('uses an explicit subset over the list, for the missed-words route', () => {
    const subset = [pair('missed-0', 'cheese', 'kaas')]
    const run = runFromList(food, subset)
    expect(run.words.map((w) => w.id)).toEqual(['missed-0'])
    expect(run.words[0]!.listId).toBe('l1')
  })

  it('has no plan, and a pool equal to its words — there is no other sample to draw', () => {
    const run = runFromList(food)
    expect(run.plan).toBeUndefined()
    expect(run.pool).toEqual(run.words)
    expect(canRedraw(run)).toBe(false)
  })
})

describe('runFromPool', () => {
  it('draws the requested count without replacement', () => {
    const run = runFromPool(pooled(30), plan({ count: 10 }), SUBJECT, seededRng(1))
    expect(run.words).toHaveLength(10)
    expect(new Set(run.words.map((w) => w.id)).size).toBe(10)
  })

  it('is pinned by its rng', () => {
    const a = runFromPool(pooled(30), plan(), SUBJECT, seededRng(7))
    const b = runFromPool(pooled(30), plan(), SUBJECT, seededRng(7))
    expect(a.words).toEqual(b.words)
  })

  it('draws the whole pool when the count is null', () => {
    const run = runFromPool(pooled(12), plan({ count: null }), SUBJECT, seededRng(1))
    expect(run.words).toHaveLength(12)
  })

  it('clamps a count above the pool, and a negative one', () => {
    expect(runFromPool(pooled(4), plan({ count: 99 }), SUBJECT, seededRng(1)).words).toHaveLength(4)
    expect(runFromPool(pooled(4), plan({ count: -3 }), SUBJECT, seededRng(1)).words).toHaveLength(0)
  })

  it('carries the plan and the pool snapshot', () => {
    const pool = pooled(30)
    const run = runFromPool(pool, plan(), SUBJECT, seededRng(1))
    expect(run.plan).toEqual(plan())
    expect(run.pool).toEqual(pool)
  })

  it('carries a saved test id only when given one', () => {
    expect(runFromPool(pooled(9), plan(), SUBJECT, seededRng(1)).savedTestId).toBeUndefined()
    expect('savedTestId' in runFromPool(pooled(9), plan(), SUBJECT, seededRng(1))).toBe(false)
    expect(runFromPool(pooled(9), plan(), SUBJECT, seededRng(1), 't1').savedTestId).toBe('t1')
  })

  it('never mutates the pool it was handed', () => {
    const pool = Object.freeze(pooled(20)) as readonly PooledWord[]
    expect(() => runFromPool(pool, plan(), SUBJECT, seededRng(3))).not.toThrow()
    expect(pool).toHaveLength(20)
  })
})

describe('redraw', () => {
  it('draws a different sample of the same size from the same pool', () => {
    const pool = pooled(30)
    const first = runFromPool(pool, plan({ count: 10 }), SUBJECT, seededRng(1))
    const second = redraw(first, seededRng(2))
    expect(second.words).toHaveLength(10)
    expect(second.words.map((w) => w.id)).not.toEqual(first.words.map((w) => w.id))
    expect(second.pool).toEqual(pool)
    expect(second.plan).toEqual(first.plan)
  })

  it('returns a run with no plan unchanged, by reference', () => {
    const run = runFromList(food)
    expect(redraw(run, seededRng(1))).toBe(run)
  })
})

describe('canRedraw', () => {
  it('is false without a plan', () => {
    expect(canRedraw(runFromList(food))).toBe(false)
  })

  it('is false when the draw already covers the pool', () => {
    const run = runFromPool(pooled(10), plan({ count: 10 }), SUBJECT, seededRng(1))
    expect(canRedraw(run)).toBe(false)
  })

  it('is true when the pool is bigger than the draw', () => {
    const run = runFromPool(pooled(30), plan({ count: 10 }), SUBJECT, seededRng(1))
    expect(canRedraw(run)).toBe(true)
  })
})

describe('runPairs', () => {
  it('projects to plain pairs, ids preserved', () => {
    const run = runFromPool(pooled(3), plan({ count: 3 }), SUBJECT, seededRng(1))
    const pairs = runPairs(run)
    expect(pairs).toHaveLength(3)
    expect(pairs.map((p) => p.id).sort()).toEqual(run.words.map((w) => w.id).sort())
    expect(Object.keys(pairs[0]!).sort()).toEqual(['col1', 'col2', 'id'])
  })
})

describe('poolSubject', () => {
  const lists = [food, paris]

  it('names a saved test by its name', () => {
    const subject = poolSubject(lists, { listIds: ['l1'], source: 'all' }, 'Weak verbs')
    expect(subject).toEqual({ name: 'Weak verbs', col1Lang: 'en', col2Lang: 'nl' })
  })

  it('names one list by the list', () => {
    expect(poolSubject(lists, { listIds: ['l1'], source: 'all' })?.name).toBe('Food')
  })

  it('names an unsaved multi-list run for what it is', () => {
    expect(poolSubject(lists, { listIds: ['l1', 'l3'], source: 'all' })?.name).toBe('2 lists')
  })

  it('takes the language pair from the first resolvable list', () => {
    const subject = poolSubject(lists, { listIds: ['gone', 'l3'], source: 'all' })
    expect(subject).toMatchObject({ col1Lang: 'en', col2Lang: 'fr' })
  })

  it('is null when nothing resolves — there is no language pair to speak', () => {
    expect(poolSubject(lists, { listIds: ['gone'], source: 'all' })).toBeNull()
    expect(poolSubject(lists, { listIds: [], source: 'all' })).toBeNull()
  })
})

describe('the run is a value, not a handle', () => {
  it('does not mutate the run it redraws', () => {
    const run: DrillRun = runFromPool(pooled(30), plan(), SUBJECT, seededRng(1))
    const before = run.words.map((w) => w.id)
    redraw(run, seededRng(9))
    expect(run.words.map((w) => w.id)).toEqual(before)
  })
})

describe('runListId', () => {
  it('names the list when a run is of exactly one', () => {
    expect(runListId(runFromList(food))).toBe('l1')
  })

  it('is empty when a run spans several — the field has no honest answer', () => {
    const pool = [...pooled(2, 'l1', 'Food'), ...pooled(2, 'l2', 'Market')]
    const run = runFromPool(pool, plan({ count: 4 }), SUBJECT, seededRng(1))
    expect(runListId(run)).toBe('')
  })

  it('is empty for an empty run', () => {
    expect(runListId(runFromPool([], plan(), SUBJECT, seededRng(1)))).toBe('')
  })
})
