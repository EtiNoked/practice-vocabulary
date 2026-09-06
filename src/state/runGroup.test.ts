import { describe, expect, it } from 'vitest'
import { groupKey, groupRuns, type RunGroup } from './runGroup'
import { bandBorder } from './scoreBand'
import type { SessionRecord } from './types'

const record = (over: Partial<SessionRecord> & Pick<SessionRecord, 'id'>): SessionRecord => ({
  listId: 'A',
  listName: 'List A',
  right: 1,
  wrong: 0,
  total: 1,
  pct: 100,
  wrongPairs: [],
  finishedAt: 1000,
  mode: 'full',
  partial: false,
  ...over,
})

describe('groupKey', () => {
  it('is the record id when there is no run — every legacy record is a group of one', () => {
    expect(groupKey(record({ id: 'r1' }))).toBe('r1')
  })

  it('is the runId when there is one', () => {
    expect(groupKey(record({ id: 'r1', runId: 'run-7' }))).toBe('run-7')
  })
})

describe('groupRuns', () => {
  it('leaves a legacy record alone, as a group of one', () => {
    const [group] = groupRuns([record({ id: 'r1', right: 3, wrong: 1, total: 4, pct: 75 })])
    expect(group).toMatchObject({ id: 'r1', right: 3, wrong: 1, total: 4, pct: 75 })
    expect(group!.records).toHaveLength(1)
    expect(group!.listNames).toEqual(['List A'])
  })

  it('folds three records of one run into one group', () => {
    const groups = groupRuns([
      record({ id: 'a', runId: 'r7', listId: 'A', listName: 'A', right: 4, wrong: 1, total: 5, pct: 80 }),
      record({ id: 'b', runId: 'r7', listId: 'B', listName: 'B', right: 5, wrong: 1, total: 6, pct: 83 }),
      record({ id: 'c', runId: 'r7', listId: 'C', listName: 'C', right: 2, wrong: 2, total: 4, pct: 50 }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ id: 'r7', right: 11, wrong: 4, total: 15 })
    expect(groups[0]!.listNames).toEqual(['A', 'B', 'C'])
  })

  it('recomputes pct from the SUMS, never by averaging the parts', () => {
    const [group] = groupRuns([
      record({ id: 'a', runId: 'r1', right: 1, wrong: 1, total: 2, pct: 50 }),
      record({ id: 'b', runId: 'r1', listId: 'B', right: 9, wrong: 1, total: 10, pct: 90 }),
    ])
    // 10 of 12 is 83%. Averaging 50 and 90 would say 70, weighting a 2-word list
    // exactly like a 10-word one.
    expect(group!.pct).toBe(83)
  })

  it('comes back newest first', () => {
    const groups = groupRuns([
      record({ id: 'old', finishedAt: 1 }),
      record({ id: 'new', finishedAt: 9 }),
      record({ id: 'mid', finishedAt: 5 }),
    ])
    expect(groups.map((g) => g.id)).toEqual(['new', 'mid', 'old'])
  })

  it('dates a group by its newest record', () => {
    const [group] = groupRuns([
      record({ id: 'a', runId: 'r1', finishedAt: 100 }),
      record({ id: 'b', runId: 'r1', finishedAt: 140 }),
    ])
    expect(group!.finishedAt).toBe(140)
  })

  it('is wrong-only only when every part is', () => {
    const [mixed] = groupRuns([
      record({ id: 'a', runId: 'r1', mode: 'wrong-only' }),
      record({ id: 'b', runId: 'r1', mode: 'full' }),
    ])
    expect(mixed!.mode).toBe('full')

    const [both] = groupRuns([
      record({ id: 'a', runId: 'r2', mode: 'wrong-only' }),
      record({ id: 'b', runId: 'r2', mode: 'wrong-only' }),
    ])
    expect(both!.mode).toBe('wrong-only')
  })

  it('is partial when ANY part is — the run stopped early, whatever the rest say', () => {
    const [group] = groupRuns([
      record({ id: 'a', runId: 'r1', partial: false }),
      record({ id: 'b', runId: 'r1', partial: true }),
    ])
    expect(group!.partial).toBe(true)
  })

  it('keeps records within a group in the order they were given', () => {
    const [group] = groupRuns([
      record({ id: 'a', runId: 'r1', listName: 'First' }),
      record({ id: 'b', runId: 'r1', listName: 'Second' }),
    ])
    expect(group!.records.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('handles an empty history', () => {
    expect(groupRuns([])).toEqual([])
  })

  it('scores a zero-total group without dividing by zero', () => {
    const [group] = groupRuns([record({ id: 'a', right: 0, wrong: 0, total: 0, pct: 0 })])
    expect(group!.pct).toBe(0)
  })
})

describe('a group is score-shaped', () => {
  /*
   * Structural, deliberately: `bandBorder` takes `Pick<SessionRecord, 'right'|'total'|'pct'>`
   * and a group satisfies it, so every surface that colours a row by its score takes a
   * grouped run with no change at all. If a field is ever renamed, this fails here rather
   * than in three components.
   */
  it('can be handed straight to bandBorder', () => {
    const [group] = groupRuns([record({ id: 'a', right: 4, wrong: 0, total: 4, pct: 100 })])
    const scoreShaped: Pick<SessionRecord, 'right' | 'total' | 'pct'> = group as RunGroup
    expect(bandBorder(scoreShaped)).toBe('border-correct')
    expect(bandBorder(group!)).toBe('border-correct')
  })
})

describe('a group of one is its record, exactly (011 D-4)', () => {
  it('keeps a stored percentage rather than recomputing one', () => {
    // Contrived counts, deliberately: the point is that nothing recomputes what the
    // record was written with. Every surface has displayed this number since 001.
    const [group] = groupRuns([record({ id: 'r1', right: 8, wrong: 2, total: 10, pct: 75 })])
    expect(group!.pct).toBe(75)
  })
})
