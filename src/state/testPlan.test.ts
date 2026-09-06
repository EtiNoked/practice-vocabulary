import { describe, expect, it } from 'vitest'
import { MAX_TESTS, TEST_COUNT_CHIPS, describeTest, isRunnable } from './testPlan'
import type { TestPlan } from './drillRun'
import type { WordList } from './types'

const makeList = (id: string, name: string): WordList => ({
  id,
  name,
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [{ id: 'p1', col1: 'a', col2: 'b' }],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
})

const LISTS = [makeList('A', 'Chapter 1'), makeList('B', 'Chapter 2'), makeList('C', 'Chapter 3')]

const plan = (over: Partial<TestPlan> = {}): TestPlan => ({
  spec: { listIds: ['A', 'B', 'C'], source: 'all' },
  count: 15,
  ...over,
})

describe('describeTest', () => {
  it('says how many lists, which words, and how many of them', () => {
    expect(describeTest(plan({ spec: { listIds: ['A', 'B', 'C'], source: 'missed' } }), LISTS, 34))
      .toBe('3 lists · words I got wrong · 15 of 34')
  })

  it('names a single list rather than counting it', () => {
    expect(describeTest(plan({ spec: { listIds: ['A'], source: 'all' }, count: 10 }), LISTS, 40))
      .toBe('Chapter 1 · all words · 10 of 40')
  })

  it('says "all" when nothing is capped', () => {
    expect(describeTest(plan({ spec: { listIds: ['A'], source: 'all' }, count: null }), LISTS, 12))
      .toBe('Chapter 1 · all words · all 12')
  })

  it('caps the shown number at what is actually there', () => {
    // A test saved at 15 whose pool has since shrunk to 6 asks 6 questions, and says so.
    expect(describeTest(plan({ spec: { listIds: ['A'], source: 'missed' }, count: 15 }), LISTS, 6))
      .toBe('Chapter 1 · words I got wrong · all 6')
  })

  it('says the lists are gone rather than describing a test that cannot run', () => {
    expect(describeTest(plan({ spec: { listIds: ['gone'], source: 'all' } }), LISTS, 0))
      .toBe('No lists left — this test can’t run')
  })

  it('counts only the lists that still exist', () => {
    expect(describeTest(plan({ spec: { listIds: ['A', 'gone'], source: 'all' } }), LISTS, 20))
      .toBe('Chapter 1 · all words · 15 of 20')
  })

  it('says so when a test selects nothing, even though its lists are alive', () => {
    expect(describeTest(plan({ spec: { listIds: ['A'], source: 'missed' }, count: 15 }), LISTS, 0))
      .toBe('Chapter 1 · words I got wrong · nothing to practise yet')
  })
})

describe('isRunnable', () => {
  it('needs at least one word', () => {
    expect(isRunnable(0)).toBe(false)
    expect(isRunnable(1)).toBe(true)
  })
})

describe('constants', () => {
  it('offers the three caps the ask named', () => {
    expect(TEST_COUNT_CHIPS).toEqual([10, 15, 20])
  })

  it('caps saved tests where lists are capped', () => {
    expect(MAX_TESTS).toBe(50)
  })
})
