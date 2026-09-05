import { describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from './memoryStore'
import type { SessionRecord, WordList } from '../state/types'

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
