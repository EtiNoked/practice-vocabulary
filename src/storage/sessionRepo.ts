import type { SessionRecord } from '../state/types'
import type { WriteResult } from './types'

export const SESSION_STORAGE_KEY = 'pvt.sessions.v1'
export const SCHEMA_VERSION = 1

/**
 * Soft cap. A guest drilling daily would otherwise grow localStorage without
 * bound — the same reasoning as listRepo's MAX_LISTS.
 */
export const MAX_RECORDS = 200

/**
 * How many of the newest records keep their right-answer detail when space runs
 * short. See `write()` below for why detail is shed before history.
 */
export const DETAIL_KEEP = 20

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

/** A record with its right-answer snapshot removed — the KEY dropped, not blanked. */
function withoutDetail(record: SessionRecord): SessionRecord {
  const { rightPairs: _dropped, ...rest } = record
  return rest
}

function write(records: SessionRecord[]): WriteResult {
  const capped = [...records].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, MAX_RECORDS)

  const attempt = (rows: SessionRecord[]): WriteResult => {
    try {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ schemaVersion: SCHEMA_VERSION, records: rows } satisfies Payload),
      )
      return { ok: true }
    } catch (error) {
      // Private-mode Safari throws here, as does a full quota. Either way the
      // caller keeps working in memory; only persistence is lost.
      const isQuota = error instanceof DOMException && error.name === 'QuotaExceededError'
      return { ok: false, reason: isQuota ? 'quota' : 'unavailable' }
    }
  }

  const first = attempt(capped)
  if (first.ok || first.reason !== 'quota') return first

  /*
   * Out of room. Shed DETAIL before shedding HISTORY.
   *
   * 006 roughly doubled what a record weighs by adding `rightPairs`. What a user
   * would actually miss is the record itself — the score, the date, the evidence
   * that they practised at all. Right-answer detail on a month-old drill is the
   * cheapest thing in here.
   *
   * Dropping it is safe because it lands those records in exactly the same
   * "recorded before right answers were saved" path that every pre-006 record
   * already takes, and which the review screens are built to explain. It is a
   * degradation the UI already knows how to describe, not a new failure mode.
   *
   * Only retried for 'quota'. A SecurityError will not be helped by a smaller
   * payload, and retrying would just throw a second time for nothing.
   */
  return attempt(capped.map((r, i) => (i < DETAIL_KEEP ? r : withoutDetail(r))))
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
