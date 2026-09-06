import { describe, expect, it } from 'vitest'
import { bandBorder, scoreBand } from './scoreBand'
import type { SessionRecord } from './types'

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 'r1',
  listId: 'l1',
  listName: 'Lesson 3',
  right: 8,
  wrong: 2,
  total: 10,
  pct: 80,
  wrongPairs: [],
  rightPairs: [],
  finishedAt: 1000,
  mode: 'full',
  partial: false,
  ...over,
})

describe('scoreBand', () => {
  it('calls a clean sweep perfect', () => {
    expect(scoreBand(rec({ right: 10, total: 10, pct: 100 }))).toBe('perfect')
  })

  it('calls 70 and above fair', () => {
    expect(scoreBand(rec({ right: 7, total: 10, pct: 70 }))).toBe('fair')
    expect(scoreBand(rec({ right: 99, total: 100, pct: 99 }))).toBe('fair')
  })

  it('calls below 70 weak', () => {
    expect(scoreBand(rec({ right: 69, total: 100, pct: 69 }))).toBe('weak')
    expect(scoreBand(rec({ right: 0, total: 10, pct: 0 }))).toBe('weak')
  })

  it('does not call a rounded-up 100% perfect', () => {
    /*
     * `pct` is rounded, so 199/200 stores as 100 — and a green "you got
     * everything right" on a drill with a miss in it is a lie the user cannot
     * see. Perfect means every card, not a number that rounded there.
     */
    expect(scoreBand(rec({ right: 199, total: 200, pct: 100 }))).toBe('fair')
  })

  it('has no opinion about a run that answered nothing', () => {
    // A practice-mode run marks nothing, so score() reports total: 0.
    expect(scoreBand(rec({ right: 0, total: 0, pct: 0 }))).toBeNull()
  })

  it('judges a run on its own score, whatever kind of run it was', () => {
    // A wrong-only re-run that went badly did go badly on the words it covered,
    // and the row it sits on already says it was a subset.
    expect(scoreBand(rec({ right: 0, total: 3, pct: 0, mode: 'wrong-only' }))).toBe('weak')
    expect(scoreBand(rec({ right: 3, total: 3, pct: 100, mode: 'wrong-only' }))).toBe('perfect')
  })
})

describe('bandBorder', () => {
  it('maps each band to its token border', () => {
    expect(bandBorder(rec({ right: 10, total: 10, pct: 100 }))).toBe('border-correct')
    expect(bandBorder(rec({ right: 8, total: 10, pct: 80 }))).toBe('border-accent')
    expect(bandBorder(rec({ right: 1, total: 10, pct: 10 }))).toBe('border-incorrect')
  })

  it('falls back to the neutral line for a run with no score', () => {
    expect(bandBorder(rec({ right: 0, total: 0, pct: 0 }))).toBe('border-line')
  })

  it('names no raw palette colour, so both themes follow the tokens', () => {
    for (const pct of [100, 80, 10]) {
      expect(bandBorder(rec({ right: pct, total: 100, pct }))).not.toMatch(/-\d{2,3}$/)
    }
  })
})
