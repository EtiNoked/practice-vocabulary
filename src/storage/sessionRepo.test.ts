import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionRecord } from '../state/types'
import {
  DETAIL_KEEP,
  MAX_RECORDS,
  SCHEMA_VERSION,
  SESSION_STORAGE_KEY,
  sessionRepo,
} from './sessionRepo'

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: Math.random().toString(36).slice(2),
  listId: 'l1',
  listName: 'Lesson 3',
  right: 8,
  wrong: 2,
  total: 10,
  pct: 80,
  wrongPairs: [{ id: 'p1', col1: 'daughter', col2: 'dochter' }],
  rightPairs: [{ id: 'p2', col1: 'son', col2: 'zoon' }],
  finishedAt: 1000,
  mode: 'full',
  partial: false,
  ...over,
})

const stored = (): SessionRecord[] => {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY)
  return raw ? (JSON.parse(raw) as { records: SessionRecord[] }).records : []
}

/** A quota failure as the browser actually reports it. */
const quotaError = () => new DOMException('full', 'QuotaExceededError')

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  // A leaked setItem stub takes down every later file that touches localStorage.
  vi.restoreAllMocks()
})

describe('reading and writing', () => {
  it('round-trips a record, right answers included', () => {
    sessionRepo.add(rec({ id: 'a' }))
    const [back] = sessionRepo.getAll()
    expect(back?.id).toBe('a')
    expect(back?.rightPairs).toHaveLength(1)
  })

  it('returns records newest-finished first', () => {
    sessionRepo.add(rec({ id: 'old', finishedAt: 1 }))
    sessionRepo.add(rec({ id: 'new', finishedAt: 9 }))
    expect(sessionRepo.getAll().map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('filters by list', () => {
    sessionRepo.add(rec({ id: 'a', listId: 'l1' }))
    sessionRepo.add(rec({ id: 'b', listId: 'l2' }))
    expect(sessionRepo.getAll('l2').map((r) => r.id)).toEqual(['b'])
  })

  it('keeps a record that carries no rightPairs at all', () => {
    // A pre-006 record. It must survive a read unchanged — there is no backfill,
    // so this shape is permanent.
    const legacy = rec({ id: 'legacy' })
    delete legacy.rightPairs
    sessionRepo.add(legacy)
    expect('rightPairs' in (sessionRepo.getAll()[0] ?? {})).toBe(false)
  })

  it('caps the stored records', () => {
    for (let i = 0; i < MAX_RECORDS + 5; i++) {
      sessionRepo.add(rec({ id: `r${i}`, finishedAt: i }))
    }
    expect(sessionRepo.getAll()).toHaveLength(MAX_RECORDS)
  })
})

describe('running out of room sheds detail, never history', () => {
  /*
   * 006 roughly doubled what a record weighs. What a user would actually miss is
   * the record — the score, the date, that they practised at all. Right-answer
   * detail on a month-old drill is the cheapest thing here, and dropping it lands
   * those records in exactly the same "recorded before right answers were saved"
   * path every pre-006 record already takes.
   */
  it('retries without the older right answers, and reports success', () => {
    const many = Array.from({ length: DETAIL_KEEP + 5 }, (_, i) =>
      rec({ id: `r${i}`, finishedAt: i }),
    )
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, records: many }),
    )

    // Fail the first write with a quota error, then let the real one through.
    const real = Storage.prototype.setItem
    let calls = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      calls += 1
      if (calls === 1) throw quotaError()
      real.call(this, key, value)
    })

    expect(sessionRepo.add(rec({ id: 'newest', finishedAt: 999 })).ok).toBe(true)
    expect(calls).toBe(2)

    const rows = stored()
    // Nothing was dropped.
    expect(rows).toHaveLength(DETAIL_KEEP + 6)
    // The newest keep their detail; everything past DETAIL_KEEP loses it.
    expect(rows.slice(0, DETAIL_KEEP).every((r) => 'rightPairs' in r)).toBe(true)
    expect(rows.slice(DETAIL_KEEP).some((r) => 'rightPairs' in r)).toBe(false)
  })

  it('reports quota when even the slimmed payload will not fit', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError()
    })
    expect(sessionRepo.add(rec())).toEqual({ ok: false, reason: 'quota' })
  })

  it('does not retry a failure that is not about space', () => {
    // Private-mode Safari throws SecurityError. Shedding detail would not help,
    // and a second attempt is a second thrown exception for nothing.
    let calls = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      calls += 1
      throw new DOMException('denied', 'SecurityError')
    })
    expect(sessionRepo.add(rec())).toEqual({ ok: false, reason: 'unavailable' })
    expect(calls).toBe(1)
  })
})

describe('a corrupted key never takes the app down', () => {
  it('returns nothing for malformed JSON', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{{{')
    expect(sessionRepo.getAll()).toEqual([])
  })

  it('returns nothing for an unknown schema version', () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, records: [rec()] }),
    )
    expect(sessionRepo.getAll()).toEqual([])
  })
})
