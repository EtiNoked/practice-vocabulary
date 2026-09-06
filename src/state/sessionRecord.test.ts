import { describe, expect, it } from 'vitest'
import { MAX_RIGHT_PAIRS, buildRunRecords, buildSessionRecord } from './sessionRecord'
import { createSession, mark, seededRng } from './session'
import { runFromList, type DrillRun } from './drillRun'
import type { PooledWord } from './wordPool'
import type { MarkResult, Session, WordList } from './types'

/**
 * A session in LIST ORDER, so a test can name the card it is marking.
 *
 * Built in 'practice' mode purely for its ordering — record shaping does not read the
 * mode, and `mark()` is happy to mark any session. A constant rng does NOT give list
 * order: Fisher-Yates with `rng() === 0` swaps every element to the front.
 */
const noShuffle = () => 0

const SUBJECT = { name: '3 lists', col1Lang: 'en', col2Lang: 'nl' } as const

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

describe('buildRunRecords — one record per contributing list (011 D-3)', () => {
  const words = (over: Array<Partial<PooledWord> & Pick<PooledWord, 'id' | 'listId'>>): PooledWord[] =>
    over.map((w) => ({
      col1: `en-${w.id}`,
      col2: `nl-${w.id}`,
      listName: `List ${w.listId}`,
      ...w,
    }))

  const runOf = (ws: PooledWord[]): DrillRun => ({ subject: SUBJECT, pool: ws, words: ws })

  const sessionOver = (ws: PooledWord[], marks: MarkResult[]): Session => {
    let s = createSession(
      ws.map((w) => ({ id: w.id, col1: w.col1, col2: w.col2 })),
      noShuffle,
      '',
      'practice',
    )
    for (const m of marks) s = mark(s, m)
    return s
  }

  it('is deep-equal to buildSessionRecord for one list, and carries NO runId key', () => {
    const session = full()
    const legacy = buildSessionRecord(list, session, {
      mode: 'full',
      partial: false,
      now: 1000,
      id: 'fixed',
    })
    const [split] = buildRunRecords(runFromList(list, session.pairs), session, {
      mode: 'full',
      partial: false,
      now: 1000,
      id: 'fixed',
    })
    expect(split).toEqual(legacy)
    expect('runId' in split!).toBe(false)
  })

  it('splits three lists into three records sharing one runId, in selection order', () => {
    const ws = words([
      { id: 'a1', listId: 'A' },
      { id: 'b1', listId: 'B' },
      { id: 'b2', listId: 'B' },
      { id: 'c1', listId: 'C' },
    ])
    const session = sessionOver(ws, ['right', 'wrong', 'right', 'wrong'])
    const records = buildRunRecords(runOf(ws), session, {
      mode: 'full',
      partial: false,
      now: 2000,
      runId: 'r7',
    })

    expect(records.map((r) => r.listId)).toEqual(['A', 'B', 'C'])
    expect(records.every((r) => r.runId === 'r7')).toBe(true)
    expect(records.map((r) => `${r.right}/${r.total}`)).toEqual(['1/1', '1/2', '0/1'])
    expect(records[1]!.wrongPairs.map((p) => p.id)).toEqual(['b1'])
    expect(records[1]!.rightPairs?.map((p) => p.id)).toEqual(['b2'])
    expect(records[0]!.listName).toBe('List A')
  })

  it('gives each record its OWN percentage, not a share of the run', () => {
    const ws = words([
      { id: 'a1', listId: 'A' },
      { id: 'b1', listId: 'B' },
      { id: 'b2', listId: 'B' },
    ])
    const session = sessionOver(ws, ['wrong', 'right', 'right'])
    const records = buildRunRecords(runOf(ws), session, { mode: 'full', partial: false, now: 1 })
    expect(records.map((r) => r.pct)).toEqual([0, 100])
  })

  it('writes no record for a list whose words were never reached', () => {
    const ws = words([
      { id: 'a1', listId: 'A' },
      { id: 'b1', listId: 'B' },
    ])
    // Only the first card is answered, then the user quits.
    const session = sessionOver(ws, ['right'])
    const records = buildRunRecords(runOf(ws), session, { mode: 'full', partial: true, now: 1 })
    expect(records.map((r) => r.listId)).toEqual(['A'])
    // With one record there is no run to point at.
    expect('runId' in records[0]!).toBe(false)
  })

  it('returns [] when nothing was answered', () => {
    const ws = words([{ id: 'a1', listId: 'A' }])
    const session = sessionOver(ws, [])
    expect(buildRunRecords(runOf(ws), session, { mode: 'full', partial: true, now: 1 })).toEqual([])
  })

  it('carries mode and partial onto every record', () => {
    const ws = words([
      { id: 'a1', listId: 'A' },
      { id: 'b1', listId: 'B' },
    ])
    const session = sessionOver(ws, ['wrong', 'wrong'])
    const records = buildRunRecords(runOf(ws), session, {
      mode: 'wrong-only',
      partial: true,
      now: 1,
    })
    expect(records.every((r) => r.mode === 'wrong-only' && r.partial)).toBe(true)
  })

  it('gives each record a distinct id', () => {
    const ws = words([
      { id: 'a1', listId: 'A' },
      { id: 'b1', listId: 'B' },
    ])
    const session = sessionOver(ws, ['right', 'right'])
    const records = buildRunRecords(runOf(ws), session, { mode: 'full', partial: false, now: 1 })
    expect(new Set(records.map((r) => r.id)).size).toBe(2)
  })

  it('applies the right-answer cap per record', () => {
    const many = words(
      Array.from({ length: MAX_RIGHT_PAIRS + 1 }, (_, i) => ({ id: `a${i}`, listId: 'A' })),
    )
    const session = sessionOver(many, many.map(() => 'right' as MarkResult))
    const [record] = buildRunRecords(runOf(many), session, {
      mode: 'full',
      partial: false,
      now: 1,
    })
    expect(record!.rightPairs).toBeUndefined()
    expect(record!.right).toBe(MAX_RIGHT_PAIRS + 1)
  })
})
