import { describe, expect, it } from 'vitest'
import { buildSessionRecord } from './sessionRecord'
import { createSession, mark, seededRng } from './session'
import type { WordList } from './types'

const list: WordList = {
  id: 'l1',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [
    { id: 'p1', col1: 'daughter', col2: 'dochter' },
    { id: 'p2', col1: 'son', col2: 'zoon' },
  ],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

const full = () => {
  let s = createSession(list.pairs, seededRng(1), list.id)
  s = mark(s, 'right')
  s = mark(s, 'wrong')
  return s
}

const opts = { mode: 'full' as const, partial: false, now: 5000, id: 'rec-1' }

describe('buildSessionRecord', () => {
  it('captures the score', () => {
    const record = buildSessionRecord(list, full(), opts)!
    expect(record).toMatchObject({ right: 1, wrong: 1, total: 2, pct: 50 })
  })

  it('captures the missed pairs for later review', () => {
    const record = buildSessionRecord(list, full(), opts)!
    expect(record.wrongPairs).toHaveLength(1)
  })

  it('denormalises the list name so history survives deletion', () => {
    const record = buildSessionRecord(list, full(), opts)!
    expect(record.listName).toBe('Lesson 3')
    expect(record.listId).toBe('l1')
  })

  it('returns null when nothing was answered', () => {
    // An empty entry is noise, and it would drag the average around for a
    // drill the user never really took.
    const untouched = createSession(list.pairs, seededRng(1), list.id)
    expect(buildSessionRecord(list, untouched, opts)).toBeNull()
  })

  it('scores a quit-early run over what was actually answered', () => {
    let s = createSession(list.pairs, seededRng(1), list.id)
    s = mark(s, 'right')
    const record = buildSessionRecord(list, s, { ...opts, partial: true })!
    expect(record).toMatchObject({ total: 1, pct: 100, partial: true })
  })

  it('marks a wrong-only re-run so it cannot flatter the average', () => {
    const record = buildSessionRecord(list, full(), { ...opts, mode: 'wrong-only' })!
    expect(record.mode).toBe('wrong-only')
  })

  it('generates a unique id when none is supplied', () => {
    const a = buildSessionRecord(list, full(), { mode: 'full', partial: false })!
    const b = buildSessionRecord(list, full(), { mode: 'full', partial: false })!
    expect(a.id).not.toBe(b.id)
  })
})

describe('capturing the right answers (006 F-1)', () => {
  it('captures the pairs answered correctly', () => {
    const record = buildSessionRecord(list, full(), opts)!
    expect(record.rightPairs).toHaveLength(1)
    expect(record.rightPairs?.[0]?.col2).toBe('dochter')
  })

  it('partitions with wrongPairs over what was answered', () => {
    const record = buildSessionRecord(list, full(), opts)!
    expect((record.rightPairs?.length ?? 0) + record.wrongPairs.length).toBe(record.total)
  })

  it('OMITS the key entirely above the cap, rather than storing an empty array', () => {
    /*
     * `'rightPairs' in record`, not `toBeUndefined()` — the latter passes for a
     * present-but-undefined key too, so it would prove nothing about the shape
     * that actually reaches storage. Absent and empty are different things here:
     * absent means "not recorded", empty means "you got none right".
     */
    const big: WordList = {
      ...list,
      pairs: Array.from({ length: 301 }, (_, i) => ({
        id: `p${i}`,
        col1: `en-${i}`,
        col2: `nl-${i}`,
      })),
    }
    let s = createSession(big.pairs, seededRng(1), big.id)
    for (let i = 0; i < 301; i++) s = mark(s, 'right')

    const record = buildSessionRecord(big, s, opts)!
    expect(record.right).toBe(301)
    expect('rightPairs' in record).toBe(false)
  })

  it('keeps the misses even when the right answers are dropped', () => {
    // The misses are the valuable half — they are what a re-drill is built from.
    const big: WordList = {
      ...list,
      pairs: Array.from({ length: 302 }, (_, i) => ({
        id: `p${i}`,
        col1: `en-${i}`,
        col2: `nl-${i}`,
      })),
    }
    let s = createSession(big.pairs, seededRng(1), big.id)
    for (let i = 0; i < 301; i++) s = mark(s, 'right')
    s = mark(s, 'wrong')

    const record = buildSessionRecord(big, s, opts)!
    expect('rightPairs' in record).toBe(false)
    expect(record.wrongPairs).toHaveLength(1)
  })

  it('still records an empty array when nothing was right', () => {
    let s = createSession(list.pairs, seededRng(1), list.id)
    s = mark(s, 'wrong')
    s = mark(s, 'wrong')
    const record = buildSessionRecord(list, s, opts)!
    expect(record.rightPairs).toEqual([])
  })
})
