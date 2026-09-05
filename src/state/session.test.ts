import { describe, expect, it } from 'vitest'
import type { WordPair } from './types'
import {
  createSession,
  currentPair,
  isFinished,
  mark,
  nextCard,
  otherMode,
  prevCard,
  restartShuffled,
  restartWrongOnly,
  reveal,
  score,
  seededRng,
} from './session'

const pairs: WordPair[] = [
  { id: '1', col1: 'daughter', col2: 'dochter' },
  { id: '2', col1: 'to die', col2: 'doodgaan' },
  { id: '3', col1: 'twins', col2: 'tweeling' },
  { id: '4', col1: 'uncle', col2: 'oom' },
]

/**
 * Identity RNG. Fisher-Yates swaps out[i] with out[floor(rng * (i+1))], so a value
 * just under 1 always picks j === i and leaves the order untouched. Returning 0
 * would rotate the array, not preserve it.
 */
const noShuffle = () => 0.999999999

describe('createSession', () => {
  it('includes every pair exactly once', () => {
    const s = createSession(pairs, seededRng(1))
    expect([...s.order].sort()).toEqual(['1', '2', '3', '4'])
  })

  it('starts at the first card, unrevealed, with no marks', () => {
    const s = createSession(pairs, noShuffle)
    expect(s.index).toBe(0)
    expect(s.revealed).toBe(false)
    expect(s.marks).toEqual({})
  })

  it('shuffles deterministically for a given seed', () => {
    const a = createSession(pairs, seededRng(42))
    const b = createSession(pairs, seededRng(42))
    expect(a.order).toEqual(b.order)
  })

  it('produces different orders for different seeds', () => {
    const many = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => createSession(pairs, seededRng(s)).order.join())
    expect(new Set(many).size).toBeGreaterThan(1)
  })

  // The session must survive the underlying list being edited mid-drill.
  it('snapshots the pairs rather than referencing the caller array', () => {
    const mutable = [...pairs]
    const s = createSession(mutable, noShuffle)
    mutable.length = 0
    expect(s.pairs).toHaveLength(4)
    expect(currentPair(s)).not.toBeNull()
  })
})

describe('drill modes', () => {
  /**
   * The default is what keeps 001's whole test suite honest: every call site
   * written before modes existed described TEST behaviour, so defaulting to it
   * means those tests still assert what they were written to assert.
   */
  it('defaults to test mode', () => {
    expect(createSession(pairs, noShuffle).mode).toBe('test')
  })

  it('carries the requested mode', () => {
    expect(createSession(pairs, noShuffle, 'l1', 'practice').mode).toBe('practice')
    expect(createSession(pairs, noShuffle, 'l1', 'test').mode).toBe('test')
  })

  // Spec A3: studying benefits from the order you wrote the list in.
  it('practice preserves list order even when handed a shuffling rng', () => {
    const s = createSession(pairs, seededRng(42), 'l1', 'practice')
    expect(s.order).toEqual(['1', '2', '3', '4'])
  })

  // The counterpart: testing must not reward positional memory.
  it('test shuffles with the same rng that practice ignores', () => {
    const shuffled = createSession(pairs, seededRng(42), 'l1', 'test')
    expect(shuffled.order).not.toEqual(['1', '2', '3', '4'])
  })

  it('practice still snapshots the pairs', () => {
    const mutable = [...pairs]
    const s = createSession(mutable, noShuffle, 'l1', 'practice')
    mutable.length = 0
    expect(s.pairs).toHaveLength(4)
  })

  /**
   * Correct, and never displayed: a practice session marks nothing, so there is
   * nothing to score. ResultsScreen must not take the score branch for one.
   */
  it('scores a practice session as nothing answered', () => {
    const s = createSession(pairs, noShuffle, 'l1', 'practice')
    expect(score(s)).toMatchObject({ right: 0, wrong: 0, total: 0, pct: 0 })
  })

  it('restartShuffled carries the mode through', () => {
    const practice = createSession(pairs, noShuffle, 'l1', 'practice')
    expect(restartShuffled(practice, seededRng(3)).mode).toBe('practice')
    const test = createSession(pairs, noShuffle, 'l1', 'test')
    expect(restartShuffled(test, seededRng(3)).mode).toBe('test')
  })

  it('restartWrongOnly carries the mode through', () => {
    let s = createSession(pairs, noShuffle, 'l1', 'test')
    s = mark(reveal(s), 'wrong')
    expect(restartWrongOnly(s, seededRng(3)).mode).toBe('test')
  })

  /**
   * "Practice again" from the results screen must not silently reshuffle: the
   * mode owns the ordering rule, so a practice restart is still list order.
   */
  it('restarting a practice session keeps list order', () => {
    const practice = createSession(pairs, noShuffle, 'l1', 'practice')
    expect(restartShuffled(practice, seededRng(42)).order).toEqual(['1', '2', '3', '4'])
  })
})

describe('nextCard and prevCard', () => {
  const practice = () => createSession(pairs, noShuffle, 'l1', 'practice')

  it('nextCard advances one card', () => {
    expect(nextCard(practice()).index).toBe(1)
  })

  /**
   * Past the last card the index runs one BEYOND the order, which is exactly
   * what isFinished() already tests for. Clamping here instead would make a
   * finished practice run indistinguishable from sitting on the last card.
   */
  it('nextCard past the last card finishes the session', () => {
    let s = practice()
    for (let i = 0; i < 4; i++) s = nextCard(s)
    expect(isFinished(s)).toBe(true)
    expect(currentPair(s)).toBeNull()
  })

  it('prevCard goes back one card', () => {
    expect(prevCard(nextCard(nextCard(practice()))).index).toBe(1)
  })

  it('prevCard floors at the first card rather than going negative', () => {
    expect(prevCard(practice()).index).toBe(0)
    expect(prevCard(prevCard(practice())).index).toBe(0)
  })

  it('neither records a mark', () => {
    expect(nextCard(nextCard(practice())).marks).toEqual({})
  })

  it('leaves the pairs and order untouched', () => {
    const s = nextCard(practice())
    expect(s.order).toEqual(['1', '2', '3', '4'])
    expect(s.pairs).toHaveLength(4)
  })
})

describe('otherMode', () => {
  it('flips between the two modes', () => {
    expect(otherMode('test')).toBe('practice')
    expect(otherMode('practice')).toBe('test')
  })
})

describe('reveal and mark', () => {
  it('reveal exposes the answer for the current card only', () => {
    const s = reveal(createSession(pairs, noShuffle))
    expect(s.revealed).toBe(true)
  })

  it('marking advances to the next card and re-hides the answer', () => {
    const s = mark(reveal(createSession(pairs, noShuffle)), 'right')
    expect(s.index).toBe(1)
    expect(s.revealed).toBe(false)
  })

  it('records the mark against the pair id, not the position', () => {
    const s = mark(reveal(createSession(pairs, noShuffle)), 'wrong')
    expect(s.marks['1']).toBe('wrong')
  })

  it('re-marking the same card overwrites rather than duplicating', () => {
    let s = createSession(pairs, noShuffle)
    s = mark(reveal(s), 'right')
    expect(Object.keys(s.marks)).toHaveLength(1)
  })
})

describe('isFinished', () => {
  it('is false while cards remain', () => {
    expect(isFinished(createSession(pairs, noShuffle))).toBe(false)
  })

  it('is true once every card has been marked', () => {
    let s = createSession(pairs, noShuffle)
    for (let i = 0; i < 4; i++) s = mark(reveal(s), 'right')
    expect(isFinished(s)).toBe(true)
    expect(currentPair(s)).toBeNull()
  })
})

describe('score', () => {
  it('counts rights, wrongs and percentage', () => {
    let s = createSession(pairs, noShuffle)
    s = mark(reveal(s), 'right')
    s = mark(reveal(s), 'right')
    s = mark(reveal(s), 'wrong')
    s = mark(reveal(s), 'right')
    expect(score(s)).toMatchObject({ right: 3, wrong: 1, total: 4, pct: 75 })
  })

  // Quitting early must still produce a score for what was answered.
  it('scores only the cards answered when the user quits early', () => {
    let s = createSession(pairs, noShuffle)
    s = mark(reveal(s), 'right')
    s = mark(reveal(s), 'wrong')
    expect(score(s)).toMatchObject({ right: 1, wrong: 1, total: 2, pct: 50 })
  })

  it('returns the missed pairs with both columns', () => {
    let s = createSession(pairs, noShuffle)
    s = mark(reveal(s), 'wrong')
    expect(score(s).wrongPairs).toEqual([{ id: '1', col1: 'daughter', col2: 'dochter' }])
  })

  it('is 0/0 with 0% before anything is answered', () => {
    expect(score(createSession(pairs, noShuffle))).toMatchObject({ total: 0, pct: 0 })
  })

  it('handles a single-pair list', () => {
    const one = [pairs[0]!]
    let s = createSession(one, noShuffle)
    s = mark(reveal(s), 'right')
    expect(score(s)).toMatchObject({ right: 1, total: 1, pct: 100 })
    expect(isFinished(s)).toBe(true)
  })

  it('rounds percentage to a whole number', () => {
    let s = createSession(pairs.slice(0, 3), noShuffle)
    s = mark(reveal(s), 'right')
    s = mark(reveal(s), 'wrong')
    s = mark(reveal(s), 'wrong')
    expect(score(s).pct).toBe(33)
  })
})

describe('restart', () => {
  it('restartShuffled keeps every pair and clears the marks', () => {
    let s = createSession(pairs, noShuffle)
    s = mark(reveal(s), 'wrong')
    const next = restartShuffled(s, seededRng(3))
    expect(next.order).toHaveLength(4)
    expect(next.marks).toEqual({})
    expect(next.index).toBe(0)
  })

  it('restartWrongOnly keeps just the missed pairs', () => {
    let s = createSession(pairs, noShuffle)
    s = mark(reveal(s), 'wrong')
    s = mark(reveal(s), 'right')
    s = mark(reveal(s), 'wrong')
    s = mark(reveal(s), 'right')
    const next = restartWrongOnly(s, seededRng(3))
    expect([...next.order].sort()).toEqual(['1', '3'])
    expect(next.pairs).toHaveLength(2)
  })

  it('restartWrongOnly yields an empty session when nothing was missed', () => {
    let s = createSession(pairs, noShuffle)
    for (let i = 0; i < 4; i++) s = mark(reveal(s), 'right')
    expect(restartWrongOnly(s, seededRng(1)).order).toHaveLength(0)
  })
})
