import type { SessionRecord } from '../state/types'
import type { WriteResult } from './types'

export const SESSION_STORAGE_KEY = 'pvt.sessions.v1'
export const SCHEMA_VERSION = 1

/**
 * Soft cap. A guest drilling daily would otherwise grow localStorage without
 * bound — the same reasoning as listRepo's MAX_LISTS.
 */
export const MAX_RECORDS = 200

interface Payload {
  schemaVersion: number
  records: SessionRecord[]
}

function isRecord(value: unknown): value is SessionRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.listId === 'string' &&
    typeof r.listName === 'string' &&
    typeof r.finishedAt === 'number' &&
    Array.isArray(r.wrongPairs)
  )
}

/**
 * Every failure mode — absent key, malformed JSON, wrong shape, unknown schema
 * version, storage disabled — returns an empty array. Losing history is bad;
 * white-screening the app over it is worse. Same contract as listRepo.
 */
function read(): SessionRecord[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(SESSION_STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return []
    const payload = parsed as Partial<Payload>
    if (payload.schemaVersion !== SCHEMA_VERSION) return []
    if (!Array.isArray(payload.records)) return []
    return payload.records.filter(isRecord)
  } catch {
    return []
  }
}

function write(records: SessionRecord[]): WriteResult {
  const capped = [...records].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, MAX_RECORDS)
  try {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, records: capped } satisfies Payload),
    )
    return { ok: true }
  } catch (error) {
    const isQuota = error instanceof DOMException && error.name === 'QuotaExceededError'
    return { ok: false, reason: isQuota ? 'quota' : 'unavailable' }
  }
}

export const sessionRepo = {
  /** Newest-finished first. `listId === null` returns every record. */
  getAll(listId: string | null = null): SessionRecord[] {
    return read()
      .filter((r) => listId === null || r.listId === listId)
      .sort((a, b) => b.finishedAt - a.finishedAt)
  },

  add(record: SessionRecord): WriteResult {
    return write([...read().filter((r) => r.id !== record.id), record])
  },

  /** Used by account deletion and sign-out, never by ordinary use. */
  clear(): WriteResult {
    return write([])
  },
}
