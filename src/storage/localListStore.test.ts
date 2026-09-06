import type { GameRecord } from '../game/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalListStore } from './localListStore'
import { listRepo } from './listRepo'
import { SESSION_STORAGE_KEY, MAX_RECORDS } from './sessionRepo'
import type { SessionRecord, WordList } from '../state/types'

const aGameRecord = (over: Partial<GameRecord> = {}): GameRecord => ({
  id: 'g1',
  finishedAt: 1000,
  listIds: ['l1'],
  listNames: ['Food'],
  source: 'all',
  correct: 7,
  asked: 10,
  points: 52,
  available: 100,
  results: [],
  partial: false,
  ...over,
})

const makeList = (over: Partial<WordList> = {}): WordList => ({
  id: 'a',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [{ id: 'p1', col1: 'daughter', col2: 'dochter' }],
  createdAt: 1000,
  updatedAt: 1000,
  origin: 'manual',
  ...over,
})

const makeRecord = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1',
  listId: 'a',
  listName: 'Lesson 3',
  right: 1,
  wrong: 0,
  total: 1,
  pct: 100,
  wrongPairs: [],
  finishedAt: 2000,
  mode: 'full',
  partial: false,
  ...over,
})

beforeEach(() => localStorage.clear())

describe('localListStore reads through listRepo', () => {
  it('emits what is already in localStorage on subscribe', () => {
    listRepo.save(makeList())
    const onChange = vi.fn()
    createLocalListStore().subscribeLists(onChange, vi.fn())
    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0]![0] as WordList[])[0]!.name).toBe('Lesson 3')
  })

  it('emits an empty array when nothing is stored', () => {
    const onChange = vi.fn()
    createLocalListStore().subscribeLists(onChange, vi.fn())
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('re-emits after save, rename and remove', async () => {
    const store = createLocalListStore()
    const onChange = vi.fn()
    store.subscribeLists(onChange, vi.fn())

    await store.saveList(makeList())
    await store.renameList('a', 'Renamed')
    await store.removeList('a')

    expect(onChange).toHaveBeenCalledTimes(4)
    expect(onChange.mock.lastCall![0]).toEqual([])
  })

  it('actually persists through listRepo, not just in memory', async () => {
    await createLocalListStore().saveList(makeList())
    expect(listRepo.getAll()).toHaveLength(1)
    expect(listRepo.getById('a')?.name).toBe('Lesson 3')
  })

  it('updates an existing list in place rather than duplicating it', async () => {
    const store = createLocalListStore()
    await store.saveList(makeList({ name: 'First' }))
    await store.saveList(makeList({ name: 'Second' }))
    expect(listRepo.getAll()).toHaveLength(1)
    expect(listRepo.getById('a')?.name).toBe('Second')
  })

  it('stops emitting once unsubscribed', async () => {
    const store = createLocalListStore()
    const onChange = vi.fn()
    store.subscribeLists(onChange, vi.fn())()
    await store.saveList(makeList())
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('localListStore write failures', () => {
  it('surfaces a quota failure as a WriteResult rather than throwing', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const result = await createLocalListStore().saveList(makeList())
    expect(result).toEqual({ ok: false, reason: 'quota' })
    vi.restoreAllMocks()
  })

  it('reports a missing id on rename', async () => {
    expect(await createLocalListStore().renameList('nope', 'x')).toEqual({
      ok: false,
      reason: 'missing',
    })
  })
})

describe('localListStore.dispose', () => {
  it('does NOT delete the local lists', async () => {
    // A signed-out user's lists predate any account. Sign-out swaps the store,
    // and destroying their data on the way past would be catastrophic.
    const store = createLocalListStore()
    await store.saveList(makeList())
    await store.dispose()
    expect(listRepo.getAll()).toHaveLength(1)
  })

  it('detaches subscribers', async () => {
    const store = createLocalListStore()
    const onChange = vi.fn()
    store.subscribeLists(onChange, vi.fn())
    await store.dispose()
    await store.saveList(makeList())
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('localListStore session history', () => {
  it('records a session and emits it back', async () => {
    const store = createLocalListStore()
    await store.recordSession(makeRecord())
    const onChange = vi.fn()
    store.subscribeSessions(null, onChange, vi.fn())
    expect((onChange.mock.calls[0]![0] as SessionRecord[])[0]!.id).toBe('s1')
  })

  it('survives a reload', async () => {
    await createLocalListStore().recordSession(makeRecord())
    const onChange = vi.fn()
    createLocalListStore().subscribeSessions(null, onChange, vi.fn())
    expect(onChange.mock.calls[0]![0]).toHaveLength(1)
  })

  it('filters by listId', async () => {
    const store = createLocalListStore()
    await store.recordSession(makeRecord({ id: 's1', listId: 'a' }))
    await store.recordSession(makeRecord({ id: 's2', listId: 'b' }))
    const onChange = vi.fn()
    store.subscribeSessions('b', onChange, vi.fn())
    expect((onChange.mock.calls[0]![0] as SessionRecord[]).map((r) => r.id)).toEqual(['s2'])
  })

  it('keeps history for a list that has been deleted', async () => {
    const store = createLocalListStore()
    await store.saveList(makeList())
    await store.recordSession(makeRecord())
    await store.removeList('a')

    const onChange = vi.fn()
    store.subscribeSessions(null, onChange, vi.fn())
    const records = onChange.mock.calls[0]![0] as SessionRecord[]
    expect(records).toHaveLength(1)
    // The name was captured at drill time, so it still reads sensibly.
    expect(records[0]!.listName).toBe('Lesson 3')
  })

  it('caps stored history, keeping the newest', async () => {
    const store = createLocalListStore()
    for (let i = 0; i < MAX_RECORDS + 10; i++) {
      await store.recordSession(makeRecord({ id: `s${i}`, finishedAt: i }))
    }
    const onChange = vi.fn()
    store.subscribeSessions(null, onChange, vi.fn())
    const records = onChange.mock.calls[0]![0] as SessionRecord[]
    expect(records).toHaveLength(MAX_RECORDS)
    expect(records[0]!.finishedAt).toBe(MAX_RECORDS + 9)
  })

  it('recovers from a corrupted history key instead of white-screening', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{ not json')
    const onChange = vi.fn()
    createLocalListStore().subscribeSessions(null, onChange, vi.fn())
    expect(onChange).toHaveBeenCalledWith([])
  })
})

describe('games survive a round trip through localStorage', () => {
  it('emits what gameRepo holds, immediately', () => {
    const store = createLocalListStore()
    const seen: GameRecord[][] = []
    store.subscribeGames((r) => seen.push(r), () => {})
    expect(seen).toEqual([[]])
  })

  it('re-emits after a write', async () => {
    const store = createLocalListStore()
    const seen: GameRecord[][] = []
    store.subscribeGames((r) => seen.push(r), () => {})
    await store.recordGame(aGameRecord())
    expect(seen[1]?.map((r) => r.id)).toEqual(['g1'])
  })

  it('does NOT re-emit when the write failed — a failed write changed nothing', async () => {
    const store = createLocalListStore()
    const seen: GameRecord[][] = []
    store.subscribeGames((r) => seen.push(r), () => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const result = await store.recordGame(aGameRecord())
    expect(result.ok).toBe(false)
    expect(seen).toHaveLength(1)
    // Restored HERE, not in an afterEach: this file has no global restore, and a
    // leaked setItem stub silently breaks every test after it.
    vi.restoreAllMocks()
  })

  it('leaves stored games alone on dispose — they outlive a sign-out', async () => {
    const store = createLocalListStore()
    await store.recordGame(aGameRecord())
    await store.dispose()
    const next = createLocalListStore()
    let seen: GameRecord[] = []
    next.subscribeGames((r) => (seen = r), () => {})
    expect(seen.map((r) => r.id)).toEqual(['g1'])
  })
})
