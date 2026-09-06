import type { GameRecord } from '../game/types'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from './memoryStore'
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

describe('memoryStore subscription contract', () => {
  it('emits the current state immediately on subscribe', () => {
    const store = createMemoryStore([makeList()])
    const onChange = vi.fn()
    store.subscribeLists(onChange, vi.fn())
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0]).toHaveLength(1)
  })

  it('emits an empty array immediately when there is nothing stored', () => {
    const onChange = vi.fn()
    createMemoryStore().subscribeLists(onChange, vi.fn())
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('re-emits after every write', async () => {
    const store = createMemoryStore()
    const onChange = vi.fn()
    store.subscribeLists(onChange, vi.fn())

    await store.saveList(makeList())
    await store.renameList('a', 'Renamed')
    await store.removeList('a')

    // 1 initial + 3 writes
    expect(onChange).toHaveBeenCalledTimes(4)
    expect(onChange.mock.lastCall![0]).toEqual([])
  })

  it('stops emitting once unsubscribed', async () => {
    const store = createMemoryStore()
    const onChange = vi.fn()
    const unsubscribe = store.subscribeLists(onChange, vi.fn())
    unsubscribe()
    await store.saveList(makeList())
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('notifies every live subscriber', async () => {
    const store = createMemoryStore()
    const a = vi.fn()
    const b = vi.fn()
    store.subscribeLists(a, vi.fn())
    store.subscribeLists(b, vi.fn())
    await store.saveList(makeList())
    expect(a).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenCalledTimes(2)
  })
})

describe('memoryStore list operations', () => {
  it('saves and overwrites by id', async () => {
    const store = createMemoryStore()
    await store.saveList(makeList({ name: 'First' }))
    await store.saveList(makeList({ name: 'Second' }))

    const onChange = vi.fn()
    store.subscribeLists(onChange, vi.fn())
    const lists = onChange.mock.calls[0]![0] as WordList[]
    expect(lists).toHaveLength(1)
    expect(lists[0]!.name).toBe('Second')
  })

  it('lists newest-updated first', async () => {
    const store = createMemoryStore()
    await store.saveList(makeList({ id: 'a', updatedAt: 1 }))
    await store.saveList(makeList({ id: 'b', updatedAt: 5 }))
    const onChange = vi.fn()
    store.subscribeLists(onChange, vi.fn())
    expect((onChange.mock.calls[0]![0] as WordList[]).map((l) => l.id)).toEqual(['b', 'a'])
  })

  it('reports a missing id on rename and remove', async () => {
    const store = createMemoryStore()
    expect(await store.renameList('nope', 'x')).toEqual({ ok: false, reason: 'missing' })
    expect(await store.removeList('nope')).toEqual({ ok: false, reason: 'missing' })
  })

  it('hands out copies, so a caller cannot mutate the store through them', async () => {
    const store = createMemoryStore()
    await store.saveList(makeList())
    const onChange = vi.fn()
    store.subscribeLists(onChange, vi.fn())
    const lists = onChange.mock.calls[0]![0] as WordList[]
    lists[0]!.name = 'mutated'

    const second = vi.fn()
    store.subscribeLists(second, vi.fn())
    expect((second.mock.calls[0]![0] as WordList[])[0]!.name).toBe('Lesson 3')
  })
})

describe('memoryStore session records', () => {
  it('records and emits newest first', async () => {
    const store = createMemoryStore()
    await store.recordSession(makeRecord({ id: 's1', finishedAt: 1 }))
    await store.recordSession(makeRecord({ id: 's2', finishedAt: 9 }))

    const onChange = vi.fn()
    store.subscribeSessions(null, onChange, vi.fn())
    expect((onChange.mock.calls[0]![0] as SessionRecord[]).map((r) => r.id)).toEqual(['s2', 's1'])
  })

  it('filters by listId when one is given', async () => {
    const store = createMemoryStore()
    await store.recordSession(makeRecord({ id: 's1', listId: 'a' }))
    await store.recordSession(makeRecord({ id: 's2', listId: 'b' }))

    const onChange = vi.fn()
    store.subscribeSessions('b', onChange, vi.fn())
    expect((onChange.mock.calls[0]![0] as SessionRecord[]).map((r) => r.id)).toEqual(['s2'])
  })

  it('re-emits to session subscribers after a new record', async () => {
    const store = createMemoryStore()
    const onChange = vi.fn()
    store.subscribeSessions(null, onChange, vi.fn())
    await store.recordSession(makeRecord())
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})

describe('memoryStore dispose', () => {
  it('stops emitting to existing subscribers', async () => {
    const store = createMemoryStore()
    const onChange = vi.fn()
    store.subscribeLists(onChange, vi.fn())
    await store.dispose()
    await store.saveList(makeList())
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('games — a first-class part of the contract, not a stub', () => {
  it('emits immediately on subscribe, like every other subscription here', () => {
    const store = createMemoryStore()
    const seen: GameRecord[][] = []
    store.subscribeGames((r) => seen.push(r), () => {})
    expect(seen).toEqual([[]])
  })

  it('emits again after a game is recorded', async () => {
    const store = createMemoryStore()
    const seen: GameRecord[][] = []
    store.subscribeGames((r) => seen.push(r), () => {})
    await store.recordGame(aGameRecord())
    expect(seen).toHaveLength(2)
    expect(seen[1]?.map((r) => r.id)).toEqual(['g1'])
  })

  it('emits newest first', async () => {
    const store = createMemoryStore()
    await store.recordGame(aGameRecord({ id: 'old', finishedAt: 1 }))
    await store.recordGame(aGameRecord({ id: 'new', finishedAt: 9 }))
    const seen: GameRecord[][] = []
    store.subscribeGames((r) => seen.push(r), () => {})
    expect(seen[0]?.map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('hands out clones, so a caller cannot mutate the store through what it read', async () => {
    const store = createMemoryStore()
    await store.recordGame(aGameRecord())
    let first: GameRecord[] = []
    store.subscribeGames((r) => (first = r), () => {})
    // Cast is the point of the test, not a workaround: GameRecord is readonly, so this
    // is what a caller with a bug would have to do — and the store must survive it.
    ;(first[0] as { points: number }).points = 999
    let second: GameRecord[] = []
    store.subscribeGames((r) => (second = r), () => {})
    expect(second[0]?.points).toBe(52)
  })

  it('stops emitting after unsubscribe', async () => {
    const store = createMemoryStore()
    const seen: GameRecord[][] = []
    const off = store.subscribeGames((r) => seen.push(r), () => {})
    off()
    await store.recordGame(aGameRecord())
    expect(seen).toHaveLength(1)
  })

  it('stops emitting after dispose', async () => {
    const store = createMemoryStore()
    const seen: GameRecord[][] = []
    store.subscribeGames((r) => seen.push(r), () => {})
    await store.dispose()
    await store.recordGame(aGameRecord())
    expect(seen).toHaveLength(1)
  })
})
