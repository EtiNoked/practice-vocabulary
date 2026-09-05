import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from './memoryStore'
import { hasMigrated, markMigrated, migrateLists, readListsOnce } from './migrate'
import type { ListStore } from './types'
import type { WordList } from '../state/types'

const makeList = (id: string, over: Partial<WordList> = {}): WordList => ({
  id,
  name: `List ${id}`,
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [{ id: 'p1', col1: 'daughter', col2: 'dochter' }],
  createdAt: 1000,
  updatedAt: 1000,
  origin: 'manual',
  ...over,
})

const countIn = async (store: ListStore) => (await readListsOnce(store)).length

beforeEach(() => localStorage.clear())

describe('migrateLists', () => {
  it('copies every list into the destination', async () => {
    const from = createMemoryStore([makeList('a'), makeList('b')])
    const to = createMemoryStore()

    const result = await migrateLists(from, to)
    expect(result.copied).toBe(2)
    expect(result.failed).toEqual([])
    expect(await countIn(to)).toBe(2)
  })

  it('preserves list ids', async () => {
    const from = createMemoryStore([makeList('keep-me')])
    const to = createMemoryStore()
    await migrateLists(from, to)
    expect((await readListsOnce(to))[0]!.id).toBe('keep-me')
  })

  it('NEVER removes anything from the source', async () => {
    // Story 3: declining, migrating and signing out must all leave the device
    // exactly as it was found.
    const from = createMemoryStore([makeList('a'), makeList('b')])
    await migrateLists(from, createMemoryStore())
    expect(await countIn(from)).toBe(2)
  })

  it('is idempotent — running it twice does not duplicate', async () => {
    const from = createMemoryStore([makeList('a'), makeList('b')])
    const to = createMemoryStore()

    await migrateLists(from, to)
    await migrateLists(from, to)

    // Idempotency comes from preserving ids: the second run overwrites the same
    // documents rather than creating new ones.
    expect(await countIn(to)).toBe(2)
  })

  it('merges into a destination that already has other lists', async () => {
    const from = createMemoryStore([makeList('a')])
    const to = createMemoryStore([makeList('existing')])
    await migrateLists(from, to)
    expect((await readListsOnce(to)).map((l) => l.id).sort()).toEqual(['a', 'existing'])
  })

  it('copies nothing and reports zero when the source is empty', async () => {
    const result = await migrateLists(createMemoryStore(), createMemoryStore())
    expect(result).toEqual({ copied: 0, failed: [] })
  })
})

describe('partial failure', () => {
  function flakyDestination(failIds: string[]): ListStore {
    const store = createMemoryStore()
    return {
      ...store,
      saveList: async (list) =>
        failIds.includes(list.id)
          ? { ok: false, reason: 'offline' }
          : store.saveList(list),
    }
  }

  it('reports which lists failed while still copying the rest', async () => {
    const from = createMemoryStore([makeList('a'), makeList('b'), makeList('c')])
    const to = flakyDestination(['b'])

    const result = await migrateLists(from, to)
    expect(result.copied).toBe(2)
    expect(result.failed.map((f) => f.list.id)).toEqual(['b'])
    expect(result.failed[0]!.reason).toBe('offline')
  })

  it('does not abort the whole run on the first failure', async () => {
    const from = createMemoryStore([makeList('a'), makeList('b')])
    const result = await migrateLists(from, flakyDestination(['a']))
    expect(result.copied).toBe(1)
  })

  it('completes the job when retried after the failure clears', async () => {
    const from = createMemoryStore([makeList('a'), makeList('b')])
    const to = createMemoryStore()
    const failing = { ...to, saveList: vi.fn(async () => ({ ok: false, reason: 'offline' as const })) }

    await migrateLists(from, failing)
    const second = await migrateLists(from, to)
    expect(second.copied).toBe(2)
    expect(await countIn(to)).toBe(2)
  })
})

describe('per-account completion flag', () => {
  it('is false before migrating', () => {
    expect(hasMigrated('uid-1')).toBe(false)
  })

  it('is true once marked', () => {
    markMigrated('uid-1')
    expect(hasMigrated('uid-1')).toBe(true)
  })

  it('is tracked per account, so a second account is still offered the copy', () => {
    markMigrated('uid-1')
    expect(hasMigrated('uid-2')).toBe(false)
  })

  it('records a decline too, so the prompt does not reappear', () => {
    // Story 3: "I'm not asked again on this device once I've answered."
    markMigrated('uid-1')
    expect(hasMigrated('uid-1')).toBe(true)
  })

  it('survives unavailable storage without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('nope', 'QuotaExceededError')
    })
    expect(() => markMigrated('uid-1')).not.toThrow()
    vi.restoreAllMocks()
  })
})
