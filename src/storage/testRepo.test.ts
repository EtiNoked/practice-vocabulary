import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_TESTS } from '../state/testPlan'
import type { SavedTest } from '../state/testPlan'
import { SCHEMA_VERSION, TEST_STORAGE_KEY, testRepo } from './testRepo'

const test = (over: Partial<SavedTest> = {}): SavedTest => ({
  id: 't1',
  name: 'Weak verbs',
  spec: { listIds: ['A', 'B'], source: 'missed' },
  count: 15,
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
})

function putRaw(value: unknown): void {
  localStorage.setItem(TEST_STORAGE_KEY, typeof value === 'string' ? value : JSON.stringify(value))
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('round trip', () => {
  it('saves and reads a test back whole', () => {
    expect(testRepo.save(test())).toEqual({ ok: true })
    const [read] = testRepo.getAll()
    expect(read).toEqual(test())
  })

  it('returns newest-updated first', () => {
    testRepo.save(test({ id: 'old', updatedAt: 1 }))
    testRepo.save(test({ id: 'new', updatedAt: 9 }))
    expect(testRepo.getAll().map((t) => t.id)).toEqual(['new', 'old'])
  })

  it('updates in place by id rather than adding a second copy', () => {
    testRepo.save(test())
    testRepo.save(test({ name: 'Weak verbs, harder', updatedAt: 2000 }))
    const all = testRepo.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]!.name).toBe('Weak verbs, harder')
  })

  it('removes one', () => {
    testRepo.save(test())
    testRepo.save(test({ id: 't2' }))
    expect(testRepo.remove('t1')).toEqual({ ok: true })
    expect(testRepo.getAll().map((t) => t.id)).toEqual(['t2'])
  })

  it('reports a removal of something that is not there', () => {
    expect(testRepo.remove('nope')).toEqual({ ok: false, reason: 'missing' })
  })

  it('keeps an uncapped test uncapped through a round trip', () => {
    testRepo.save(test({ count: null }))
    expect(testRepo.getAll()[0]!.count).toBeNull()
  })

  /*
   * A dangling listId is KEPT, not repaired. A test that quietly fixed itself would
   * become a different test; a broken one explains itself on screen instead (011 FR-17).
   */
  it('keeps a test whose lists have been deleted', () => {
    testRepo.save(test({ spec: { listIds: ['gone'], source: 'all' } }))
    expect(testRepo.getAll()[0]!.spec.listIds).toEqual(['gone'])
  })
})

describe('the read is total', () => {
  it('returns [] with no key at all', () => {
    expect(testRepo.getAll()).toEqual([])
  })

  it('returns [] on malformed JSON', () => {
    putRaw('{not json')
    expect(testRepo.getAll()).toEqual([])
  })

  it('returns [] on a non-object payload', () => {
    putRaw('42')
    expect(testRepo.getAll()).toEqual([])
  })

  it('returns [] on an unknown schema version', () => {
    putRaw({ schemaVersion: 99, tests: [test()] })
    expect(testRepo.getAll()).toEqual([])
  })

  it('returns [] when tests is not an array', () => {
    putRaw({ schemaVersion: SCHEMA_VERSION, tests: 'nope' })
    expect(testRepo.getAll()).toEqual([])
  })

  it('drops only the malformed entries, keeping the good ones', () => {
    putRaw({
      schemaVersion: SCHEMA_VERSION,
      tests: [test(), { id: 'bad' }, { ...test({ id: 't3' }), spec: null }],
    })
    expect(testRepo.getAll().map((t) => t.id)).toEqual(['t1'])
  })

  it('returns [] when storage itself is refused', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    expect(testRepo.getAll()).toEqual([])
  })
})

describe('writes never throw', () => {
  it('reports a quota failure instead', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(testRepo.save(test())).toEqual({ ok: false, reason: 'quota' })
  })

  it('reports storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    expect(testRepo.save(test())).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('the cap', () => {
  it('refuses a new test beyond MAX_TESTS, but still updates an existing one', () => {
    for (let i = 0; i < MAX_TESTS; i++) testRepo.save(test({ id: `t${i}`, updatedAt: i }))
    expect(testRepo.save(test({ id: 'one-too-many' }))).toEqual({ ok: false, reason: 'quota' })
    expect(testRepo.save(test({ id: 't0', name: 'renamed', updatedAt: 99 }))).toEqual({ ok: true })
    expect(testRepo.getAll()).toHaveLength(MAX_TESTS)
  })
})
