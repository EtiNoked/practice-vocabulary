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
