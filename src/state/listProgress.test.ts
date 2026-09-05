import { describe, expect, it } from 'vitest'
import { latestScores, scoreBand } from './listProgress'
import type { SessionRecord } from './types'

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: Math.random().toString(36).slice(2),
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
     * everything right" badge on a drill with a miss in it is a lie the user
     * cannot see. Perfect means every card, not a number that rounded there.
     */
    expect(scoreBand(rec({ right: 199, total: 200, pct: 100 }))).toBe('fair')
  })

  it('has no opinion about a run that answered nothing', () => {
    expect(scoreBand(rec({ right: 0, total: 0, pct: 0 }))).toBeNull()
  })
})

describe('latestScores', () => {
  it('takes the most recent run for each list', () => {
    const scores = latestScores([
      rec({ listId: 'l1', pct: 40, right: 4, finishedAt: 1 }),
      rec({ listId: 'l1', pct: 90, right: 9, finishedAt: 9 }),
      rec({ listId: 'l2', pct: 50, right: 5, finishedAt: 5 }),
    ])
    expect(scores.get('l1')?.pct).toBe(90)
    expect(scores.get('l2')?.pct).toBe(50)
  })

  it('does not trust the order it is handed', () => {
    const scores = latestScores([
      rec({ listId: 'l1', pct: 90, finishedAt: 9 }),
      rec({ listId: 'l1', pct: 40, finishedAt: 1 }),
    ])
    expect(scores.get('l1')?.pct).toBe(90)
  })

  it('ignores a wrong-only re-run', () => {
    /*
     * The same reasoning ScoreHistory's trend already applies: a wrong-only run
     * is a deliberately harder subset. Colouring a list red because you just
     * drilled its three hardest words would be actively misleading.
     */
    const scores = latestScores([
      rec({ listId: 'l1', pct: 90, right: 9, finishedAt: 1 }),
      rec({ listId: 'l1', pct: 30, right: 3, finishedAt: 9, mode: 'wrong-only' }),
    ])
    expect(scores.get('l1')?.pct).toBe(90)
  })

  it('ignores a run that was stopped early', () => {
    // Two cards of forty says nothing about the list.
    const scores = latestScores([
      rec({ listId: 'l1', pct: 90, finishedAt: 1 }),
      rec({ listId: 'l1', pct: 0, finishedAt: 9, partial: true }),
    ])
    expect(scores.get('l1')?.pct).toBe(90)
  })

  it('ignores a run that answered nothing', () => {
    const scores = latestScores([rec({ listId: 'l1', right: 0, total: 0, pct: 0 })])
    expect(scores.has('l1')).toBe(false)
  })

  it('says nothing about a list that has never been drilled', () => {
    expect(latestScores([]).has('l1')).toBe(false)
  })
})
