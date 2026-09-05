import type { WordList } from '../state/types'

export const STORAGE_KEY = 'pvt.lists.v1'
export const SCHEMA_VERSION = 1

/** Soft cap. Lists are small, but localStorage is not infinite. */
export const MAX_LISTS = 50

export type WriteResult = { ok: true } | { ok: false; reason: 'quota' | 'missing' | 'unavailable' }

interface Payload {
  schemaVersion: number
  lists: WordList[]
}

function isWordList(value: unknown): value is WordList {
  if (typeof value !== 'object' || value === null) return false
  const l = value as Record<string, unknown>
  return typeof l.id === 'string' && typeof l.name === 'string' && Array.isArray(l.pairs)
}

/**
 * Read the stored lists.
 *
 * Every failure mode — absent key, malformed JSON, wrong shape, unknown schema
 * version, storage disabled — returns an empty array. A corrupted key must never
 * white-screen the app; the worst acceptable outcome is "your lists are gone".
 */
function read(): WordList[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return []
    const payload = parsed as Partial<Payload>
    if (payload.schemaVersion !== SCHEMA_VERSION) return []
    if (!Array.isArray(payload.lists)) return []
    return payload.lists.filter(isWordList)
  } catch {
    return []
  }
}

function write(lists: WordList[]): WriteResult {
  const capped = [...lists].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_LISTS)
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, lists: capped } satisfies Payload),
    )
    return { ok: true }
  } catch (error) {
    // Private-mode Safari throws here, as does a full quota. Either way the caller
    // keeps working in memory; only persistence is lost.
    const isQuota = error instanceof DOMException && error.name === 'QuotaExceededError'
    return { ok: false, reason: isQuota ? 'quota' : 'unavailable' }
  }
}

export const listRepo = {
  /** Newest-updated first. */
  getAll(): WordList[] {
    return read().sort((a, b) => b.updatedAt - a.updatedAt)
  },

  getById(id: string): WordList | null {
    return read().find((l) => l.id === id) ?? null
  },

  save(list: WordList): WriteResult {
    const lists = read().filter((l) => l.id !== list.id)
    lists.push(list)
    return write(lists)
  },

  /** Update in place. Preserves id and name; bumps updatedAt. */
  update(id: string, patch: Partial<Omit<WordList, 'id' | 'name' | 'createdAt'>>): WriteResult {
    const lists = read()
    const index = lists.findIndex((l) => l.id === id)
    const existing = lists[index]
    if (index === -1 || !existing) return { ok: false, reason: 'missing' }
    lists[index] = { ...existing, ...patch, updatedAt: Date.now() }
    return write(lists)
  },

  rename(id: string, name: string): WriteResult {
    const lists = read()
    const index = lists.findIndex((l) => l.id === id)
    const existing = lists[index]
    if (index === -1 || !existing) return { ok: false, reason: 'missing' }
    lists[index] = { ...existing, name, updatedAt: Date.now() }
    return write(lists)
  },

  remove(id: string): WriteResult {
    return write(read().filter((l) => l.id !== id))
  },
}
