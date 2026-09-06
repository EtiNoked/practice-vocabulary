import { describe, expect, it } from 'vitest'
import { trend } from './scoreTrend'
import type { SessionRecord } from './types'

/**
 * The rolling average, moved out of `ScoreHistory` when 012 emptied the home screen.
 *
 * Every case here came from that component's suite, with the assertions moved off the
 * rendered sentence and onto the number — which is where they always belonged.
 */

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: Math.random().toString(36),
  listId: 'l1',
  listName: 'Lesson 3',
  right: 8,
  wrong: 2,
  total: 10,
  pct: 80,
  wrongPairs: [],
  finishedAt: Date.UTC(2026, 8, 1),
  mode: 'full',
  partial: false,
  ...over,
})

describe('trend', () => {
  it('averages full runs once there are at least two', () => {
    expect(trend([rec({ pct: 100 }), rec({ pct: 50 })])).toEqual({ average: 75, count: 2 })
  })

  it('says nothing from a single run', () => {
    // "Averaging 80% over your last 1 full run" under a user's first drill is not a
    // trend; it is the same number said twice.
    expect(trend([rec()])).toBeNull()
  })

  it('says nothing at all from no runs', () => {
    expect(trend([])).toBeNull()
  })

  it('excludes wrong-only and partial runs', () => {
    // A missed-words drill is a harder subset; counting it would understate progress,
    // and a quit-early run is not a real attempt.
    expect(
      trend([
        rec({ pct: 100 }),
        rec({ pct: 100 }),
        rec({ pct: 0, mode: 'wrong-only' }),
        rec({ pct: 0, partial: true }),
      ]),
    ).toEqual({ average: 100, count: 2 })
  })

  it('looks at the last five and no further', () => {
    const runs = [100, 100, 100, 100, 100, 0, 0, 0].map((pct, i) =>
      rec({ id: `r${i}`, pct, finishedAt: Date.UTC(2026, 8, 20 - i) }),
    )
    expect(trend(runs)).toEqual({ average: 100, count: 5 })
  })
})

describe('a run over several lists counts once (011 D-3)', () => {
  const run = (runId: string, parts: Array<Partial<SessionRecord>>): SessionRecord[] =>
    parts.map((p) => rec({ runId, ...p }))

  /*
   * THE case this function exists in one piece for.
   *
   * Two runs — one at 0%, one at 100% — where the 0% one spanned three lists and so wrote
   * three records. Averaging the RECORDS gives 25%, which is wrong and looks entirely
   * reasonable. Averaging the RUNS gives 50%.
   */
  it('averages the runs, not the records', () => {
    const records = [
      ...run('r1', [
        { listId: 'A', right: 0, wrong: 10, total: 10, pct: 0, finishedAt: Date.UTC(2026, 8, 3) },
        { listId: 'B', right: 0, wrong: 10, total: 10, pct: 0, finishedAt: Date.UTC(2026, 8, 3) },
        { listId: 'C', right: 0, wrong: 10, total: 10, pct: 0, finishedAt: Date.UTC(2026, 8, 3) },
      ]),
      rec({ right: 10, wrong: 0, total: 10, pct: 100, finishedAt: Date.UTC(2026, 8, 2) }),
    ]
    expect(trend(records)).toEqual({ average: 50, count: 2 })
  })

  it('recomputes a split run’s percentage from its sums, not from its parts', () => {
    // 11 of 15 is 73%, which is not the mean of 80, 83 and 50.
    const records = run('r7', [
      { id: 'a', listId: 'A', right: 4, wrong: 1, total: 5, pct: 80 },
      { id: 'b', listId: 'B', right: 5, wrong: 1, total: 6, pct: 83 },
      { id: 'c', listId: 'C', right: 2, wrong: 2, total: 4, pct: 50 },
    ])
    expect(trend([...records, rec({ id: 'z', pct: 73 })])).toEqual({ average: 73, count: 2 })
  })
})
