import { describe, expect, it } from 'vitest'
import { buildQuestions, pickDistractors } from './questions'
import { CLOUD_SIZE } from './types'
import { seededRng } from '../state/session'
import type { PooledWord } from '../state/wordPool'

const word = (i: number, col1: string, col2: string): PooledWord => ({
  id: `w${i}`,
  col1,
  col2,
  listId: 'l1',
  listName: 'Food',
})

/** Twelve distinct words — comfortably more than one cloud. */
const POOL: PooledWord[] = [
  'bread/brood',
  'cheese/kaas',
  'apple/appel',
  'money/geld',
  'water/water',
  'milk/melk',
  'sugar/suiker',
  'salt/zout',
  'egg/ei',
  'fish/vis',
  'meat/vlees',
  'rice/rijst',
].map((s, i) => word(i, s.split('/')[0]!, s.split('/')[1]!))

describe('buildQuestions', () => {
  it('asks for `count` words', () => {
    expect(buildQuestions(POOL, 5, seededRng(1))).toHaveLength(5)
  })

  it('never asks the same word twice — sampling is without replacement', () => {
    const qs = buildQuestions(POOL, POOL.length, seededRng(3))
    expect(new Set(qs.map((q) => q.word.id)).size).toBe(POOL.length)
  })

  it('clamps a count larger than the pool', () => {
    expect(buildQuestions(POOL, 999, seededRng(1))).toHaveLength(POOL.length)
  })

  it('is empty for an empty pool, rather than throwing', () => {
    expect(buildQuestions([], 10, seededRng(1))).toEqual([])
  })

  it('gives every question a full cloud', () => {
    for (const q of buildQuestions(POOL, 6, seededRng(9))) {
      expect(q.options).toHaveLength(CLOUD_SIZE)
    }
  })

  it('always includes the answer among the options', () => {
    for (const q of buildQuestions(POOL, 8, seededRng(11))) {
      expect(q.options.map((o) => o.id)).toContain(q.word.id)
    }
  })

  it('shrinks the cloud to the pool when the pool is smaller than CLOUD_SIZE', () => {
    const tiny = POOL.slice(0, 4)
    for (const q of buildQuestions(tiny, 4, seededRng(2))) {
      expect(q.options).toHaveLength(4)
    }
  })

  it('is deterministic under a seed, so a draw can be pinned', () => {
    const a = buildQuestions(POOL, 5, seededRng(77)).map((q) => q.word.id)
    const b = buildQuestions(POOL, 5, seededRng(77)).map((q) => q.word.id)
    expect(a).toEqual(b)
  })

  it('draws differently under a different seed — this is what replay relies on', () => {
    const a = buildQuestions(POOL, 8, seededRng(1)).map((q) => q.word.id)
    const b = buildQuestions(POOL, 8, seededRng(2)).map((q) => q.word.id)
    expect(a).not.toEqual(b)
  })

  it('tags every question with its kind', () => {
    expect(buildQuestions(POOL, 2, seededRng(1))[0]?.kind).toBe('hear-pick-meaning')
  })
})

describe('pickDistractors — no two tiles may read the same (008 FR-13)', () => {
  it('never repeats the answer', () => {
    const answer = POOL[0]!
    const options = pickDistractors(POOL, answer, seededRng(5))
    expect(options.map((o) => o.id)).not.toContain(answer.id)
  })

  it('never repeats itself', () => {
    const options = pickDistractors(POOL, POOL[0]!, seededRng(6))
    expect(new Set(options.map((o) => o.id)).size).toBe(options.length)
  })

  it('excludes a DIFFERENT word that happens to display the same text', () => {
    /*
     * Two senses of one word — "bank" the money place and "bank" the river edge — are
     * two pool entries with one col1. Showing both as tiles gives the user a question
     * with two right-looking answers and one of them scored wrong.
     */
    const ambiguous = [
      word(0, 'bank', 'bank'),
      word(1, 'bank', 'oever'),
      word(2, 'cheese', 'kaas'),
      word(3, 'apple', 'appel'),
    ]
    const options = pickDistractors(ambiguous, ambiguous[0]!, seededRng(4))
    expect(options.map((o) => o.col1)).not.toContain('bank')
  })

  it('folds on case and spacing when comparing displayed text', () => {
    const ambiguous = [
      word(0, 'Bread', 'brood'),
      word(1, ' bread ', 'stokbrood'),
      word(2, 'cheese', 'kaas'),
    ]
    const options = pickDistractors(ambiguous, ambiguous[0]!, seededRng(8))
    expect(options.map((o) => o.id)).toEqual(['w2'])
  })

  it('returns a short list rather than padding with a duplicate', () => {
    const crowded = [
      word(0, 'bread', 'brood'),
      ...Array.from({ length: 20 }, (_, i) => word(i + 1, 'bread', `variant-${i}`)),
      word(99, 'cheese', 'kaas'),
    ]
    const options = pickDistractors(crowded, crowded[0]!, seededRng(12))
    expect(options).toHaveLength(1)
  })

  it('takes CLOUD_SIZE - 1 when the pool allows', () => {
    expect(pickDistractors(POOL, POOL[0]!, seededRng(13))).toHaveLength(CLOUD_SIZE - 1)
  })
})

describe('the answer is not biased to a position (008 FR-14)', () => {
  it('lands in every slot across many seeded draws', () => {
    const positions = new Set<number>()
    for (let seed = 0; seed < 300; seed++) {
      for (const q of buildQuestions(POOL, 3, seededRng(seed))) {
        positions.add(q.options.findIndex((o) => o.id === q.word.id))
      }
    }
    expect([...positions].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('never leaves the answer unfound', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const q of buildQuestions(POOL, 3, seededRng(seed))) {
        expect(q.options.findIndex((o) => o.id === q.word.id)).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
