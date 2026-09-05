import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WordList } from '../state/types'
import { MAX_LISTS, STORAGE_KEY, listRepo } from './listRepo'

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

beforeEach(() => localStorage.clear())

describe('listRepo round-trip', () => {
  it('saves a list and reads it back', () => {
    listRepo.save(makeList())
    expect(listRepo.getAll()).toHaveLength(1)
    expect(listRepo.getById('a')?.name).toBe('Lesson 3')
  })

  it('returns an empty array when nothing is stored', () => {
    expect(listRepo.getAll()).toEqual([])
  })

  it('returns null for an unknown id', () => {
    expect(listRepo.getById('nope')).toBeNull()
  })

  it('lists newest-updated first', () => {
    listRepo.save(makeList({ id: 'a', updatedAt: 1 }))
    listRepo.save(makeList({ id: 'b', updatedAt: 5 }))
    expect(listRepo.getAll().map((l) => l.id)).toEqual(['b', 'a'])
  })
})

describe('update', () => {
  it('updates in place, preserving id and name and bumping updatedAt', () => {
    listRepo.save(makeList())
    const result = listRepo.update('a', {
      pairs: [
        { id: 'p1', col1: 'daughter', col2: 'dochter' },
        { id: 'p2', col1: 'son', col2: 'zoon' },
      ],
    })
    expect(result.ok).toBe(true)
    const stored = listRepo.getById('a')!
    expect(stored.id).toBe('a')
    expect(stored.name).toBe('Lesson 3')
    expect(stored.pairs).toHaveLength(2)
    expect(stored.updatedAt).toBeGreaterThan(1000)
  })

  it('does not create a list that does not exist', () => {
    expect(listRepo.update('ghost', { pairs: [] }).ok).toBe(false)
    expect(listRepo.getAll()).toHaveLength(0)
  })

  it('rename changes only the name', () => {
    listRepo.save(makeList())
    listRepo.rename('a', 'Lesson 4')
    expect(listRepo.getById('a')?.name).toBe('Lesson 4')
    expect(listRepo.getById('a')?.pairs).toHaveLength(1)
  })

  it('remove deletes the list', () => {
    listRepo.save(makeList())
    listRepo.remove('a')
    expect(listRepo.getAll()).toEqual([])
  })
})

describe('resilience', () => {
  // A corrupted key must never white-screen the app.
  it('returns an empty array when the stored value is not valid JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(listRepo.getAll()).toEqual([])
  })

  it('returns an empty array when the stored shape is wrong', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, lists: 'nope' }))
    expect(listRepo.getAll()).toEqual([])
  })

  /**
   * The language code set is open now, so an unrecognised code is reachable —
   * a list saved by a newer build, a hand-edited key, a document from another
   * device. Left unchecked it reaches BCP47[lang] as `undefined` and produces a
   * silent utterance with an empty language name.
   */
  describe('unknown language codes', () => {
    const seed = (over: Record<string, unknown>) =>
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ schemaVersion: 1, lists: [{ ...makeList(), ...over }] }),
      )

    it.each([
      ['an unknown string', 'xx'],
      ['a number', 42],
      ['null', null],
      ['absent', undefined],
    ])('coerces %s to a valid code rather than dropping the list', (_, value) => {
      seed({ col1Lang: value, col2Lang: value })
      const [list] = listRepo.getAll()
      expect(list).toBeDefined()
      expect(['en', 'nl', 'fr']).toContain(list!.col1Lang)
      expect(['en', 'nl', 'fr']).toContain(list!.col2Lang)
    })

    // Coerce, never destroy: the words matter more than the accent.
    it('keeps the list and its pairs intact when coercing', () => {
      seed({ col1Lang: 'xx' })
      const [list] = listRepo.getAll()
      expect(list!.name).toBe('Lesson 3')
      expect(list!.pairs).toHaveLength(1)
      expect(list!.col2Lang).toBe('nl')
    })

    it('leaves a valid code untouched, including a newly added one', () => {
      seed({ col1Lang: 'nl', col2Lang: 'fr' })
      const [list] = listRepo.getAll()
      expect(list!.col1Lang).toBe('nl')
      expect(list!.col2Lang).toBe('fr')
    })
  })

  it('ignores a payload from a future schema version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 99, lists: [makeList()] }))
    expect(listRepo.getAll()).toEqual([])
  })

  // Private-mode Safari throws on setItem. A failed save must not throw into the UI.
  it('reports a quota failure instead of throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const result = listRepo.save(makeList())
    if (result.ok) throw new Error('expected the save to fail')
    expect(result.reason).toBe('quota')
    spy.mockRestore()
  })

  it('caps the number of stored lists', () => {
    for (let i = 0; i < MAX_LISTS + 5; i++) {
      listRepo.save(makeList({ id: `id${i}`, updatedAt: i }))
    }
    expect(listRepo.getAll().length).toBeLessThanOrEqual(MAX_LISTS)
  })
})
