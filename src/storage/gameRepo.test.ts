import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameRecord } from '../game/types'
import {
  DETAIL_KEEP,
  GAME_STORAGE_KEY,
  MAX_GAME_RECORDS,
  SCHEMA_VERSION,
  gameRepo,
} from './gameRepo'

const rec = (over: Partial<GameRecord> = {}): GameRecord => ({
  id: Math.random().toString(36).slice(2),
  finishedAt: 1000,
  listIds: ['l1'],
  listNames: ['Food'],
  source: 'all',
  correct: 7,
  asked: 10,
  points: 52,
  available: 100,
  results: [
    { word: { id: 'w0', col1: 'bread', col2: 'brood', listId: 'l1', listName: 'Food' }, correct: true },
  ],
  partial: false,
  ...over,
})

const stored = (): GameRecord[] => {
  const raw = localStorage.getItem(GAME_STORAGE_KEY)
  return raw ? (JSON.parse(raw) as { records: GameRecord[] }).records : []
}

const quotaError = () => new DOMException('full', 'QuotaExceededError')

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('reading and writing', () => {
  it('round-trips a record, results included', () => {
    gameRepo.add(rec({ id: 'a' }))
    const [back] = gameRepo.getAll()
    expect(back?.id).toBe('a')
    expect(back?.results).toHaveLength(1)
  })

  it('returns records newest first', () => {
    gameRepo.add(rec({ id: 'old', finishedAt: 1 }))
    gameRepo.add(rec({ id: 'new', finishedAt: 9 }))
    expect(gameRepo.getAll().map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('does not filter by list — a game spans several, so filtering by one is meaningless', () => {
    gameRepo.add(rec({ id: 'a', listIds: ['l1', 'l2'] }))
    expect(gameRepo.getAll()).toHaveLength(1)
  })

  it('replaces a record written twice under one id rather than duplicating it', () => {
    gameRepo.add(rec({ id: 'a', points: 1 }))
    gameRepo.add(rec({ id: 'a', points: 2 }))
    expect(gameRepo.getAll()).toHaveLength(1)
    expect(gameRepo.getAll()[0]?.points).toBe(2)
  })

  it('clears', () => {
    gameRepo.add(rec())
    gameRepo.clear()
    expect(gameRepo.getAll()).toEqual([])
  })
})

describe('reads are total — a corrupt key must never white-screen the app', () => {
  it('returns [] with no key at all', () => {
    expect(gameRepo.getAll()).toEqual([])
  })

  it('returns [] on malformed JSON', () => {
    localStorage.setItem(GAME_STORAGE_KEY, '{not json')
    expect(gameRepo.getAll()).toEqual([])
  })

  it('returns [] on a payload that is not an object', () => {
    localStorage.setItem(GAME_STORAGE_KEY, '"a string"')
    expect(gameRepo.getAll()).toEqual([])
  })

  it('returns [] on an unknown schema version', () => {
    localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, records: [rec()] }),
    )
    expect(gameRepo.getAll()).toEqual([])
  })

  it('returns [] when records is not an array', () => {
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, records: 5 }))
    expect(gameRepo.getAll()).toEqual([])
  })

  it('drops individual malformed records but keeps the good ones', () => {
    localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, records: [rec({ id: 'ok' }), { id: 'bad' }, null] }),
    )
    expect(gameRepo.getAll().map((r) => r.id)).toEqual(['ok'])
  })

  it('returns [] when storage itself is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('disabled')
    })
    expect(gameRepo.getAll()).toEqual([])
  })
})

describe('writes never throw — persistence is a convenience layer', () => {
  it('reports a quota failure rather than throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError()
    })
    expect(gameRepo.add(rec())).toEqual({ ok: false, reason: 'quota' })
  })

  it('reports anything else as unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('nope', 'SecurityError')
    })
    expect(gameRepo.add(rec())).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('the cap', () => {
  it('keeps the newest MAX_GAME_RECORDS and drops the rest', () => {
    for (let i = 0; i < MAX_GAME_RECORDS + 10; i++) gameRepo.add(rec({ id: `g${i}`, finishedAt: i }))
    const all = gameRepo.getAll()
    expect(all).toHaveLength(MAX_GAME_RECORDS)
    expect(all[0]?.id).toBe(`g${MAX_GAME_RECORDS + 9}`)
  })
})

describe('under pressure, shed DETAIL before shedding HISTORY', () => {
  it('retries without results on the older records when quota is hit', () => {
    for (let i = 0; i < DETAIL_KEEP + 5; i++) gameRepo.add(rec({ id: `g${i}`, finishedAt: i }))

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

    expect(gameRepo.add(rec({ id: 'newest', finishedAt: 9999 })).ok).toBe(true)
    expect(calls).toBe(2)

    const rows = stored()
    // Nothing was dropped — history survives, detail is what goes.
    expect(rows).toHaveLength(DETAIL_KEEP + 6)
    expect(rows.slice(0, DETAIL_KEEP).every((r) => 'results' in r)).toBe(true)
    expect(rows.slice(DETAIL_KEEP).some((r) => 'results' in r)).toBe(false)
  })

  it('reports quota when even the slimmed payload will not fit', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError()
    })
    expect(gameRepo.add(rec())).toEqual({ ok: false, reason: 'quota' })
  })

  it('does not retry a SecurityError — a smaller payload will not help', () => {
    let calls = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      calls += 1
      throw new DOMException('nope', 'SecurityError')
    })
    gameRepo.add(rec())
    expect(calls).toBe(1)
  })

  it('a record that has lost its results still reads back, score intact', () => {
    const shed = rec({ id: 'shed' })
    delete (shed as { results?: unknown }).results
    localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, records: [shed] }),
    )
    const [back] = gameRepo.getAll()
    expect(back).toMatchObject({ id: 'shed', points: 52 })
    expect(back?.results).toBeUndefined()
  })
})

describe('the schema version is frozen', () => {
  it('is 1, and bumping it would delete every user’s game history', () => {
    // A version mismatch reads back as [], with no error and no way to recover.
    expect(SCHEMA_VERSION).toBe(1)
  })

  it('writes what it claims to write', () => {
    gameRepo.add(rec({ id: 'a' }))
    expect(stored().map((r) => r.id)).toEqual(['a'])
  })
})
