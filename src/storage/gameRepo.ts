import type { GameRecord } from '../game/types'
import type { WriteResult } from './types'

/**
 * Finished games, on this device.
 *
 * Its own key and its own module, deliberately parallel to sessionRepo rather than a
 * generic shared with it. The two differ in their shape validator, their cap and what
 * they shed under pressure; the common part is about six lines of defensive JSON.parse,
 * and a generic over both would make each harder to read than it is here.
 */
export const GAME_STORAGE_KEY = 'pvt.games.v1'

/**
 * FROZEN AT 1.
 *
 * `read()` returns [] on a mismatch, so bumping this deletes every user's game history
 * with no error and no way back. New fields go on as optional ones — a v1 reader ignoring
 * an unknown key is exactly the forward compatibility already designed for. Guarded in
 * test/invariants.test.ts, the same way sessionRepo's is.
 */
export const SCHEMA_VERSION = 1

/** Soft cap, matching sessionRepo's reasoning: daily play must not grow without bound. */
export const MAX_GAME_RECORDS = 100

/** How many of the newest records keep their per-word detail when space runs short. */
export const DETAIL_KEEP = 20

interface Payload {
  schemaVersion: number
  records: GameRecord[]
}

function isRecord(value: unknown): value is GameRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.finishedAt === 'number' &&
    Array.isArray(r.listIds) &&
    typeof r.asked === 'number' &&
    typeof r.points === 'number'
  )
}

/**
 * Every failure mode — absent key, malformed JSON, wrong shape, unknown version, storage
 * disabled — returns []. Losing game history is bad; white-screening the app over it is
 * worse. Same contract as listRepo and sessionRepo.
 */
function read(): GameRecord[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(GAME_STORAGE_KEY)
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

/** A record with its per-word detail removed — the KEY dropped, not blanked. */
function withoutDetail(record: GameRecord): GameRecord {
  const { results: _dropped, ...rest } = record
  return rest
}

function write(records: GameRecord[]): WriteResult {
  const capped = [...records].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, MAX_GAME_RECORDS)

  const attempt = (rows: GameRecord[]): WriteResult => {
    try {
      localStorage.setItem(
        GAME_STORAGE_KEY,
        JSON.stringify({ schemaVersion: SCHEMA_VERSION, records: rows } satisfies Payload),
      )
      return { ok: true }
    } catch (error) {
      const isQuota = error instanceof DOMException && error.name === 'QuotaExceededError'
      return { ok: false, reason: isQuota ? 'quota' : 'unavailable' }
    }
  }

  const first = attempt(capped)
  if (first.ok || first.reason !== 'quota') return first

  /*
   * Out of room. Shed DETAIL before shedding HISTORY — sessionRepo's rule, and it holds
   * for the same reason: what a user would miss is the record itself, the score and the
   * evidence they played. Per-word detail on a month-old game is the cheapest thing here,
   * and a record that has lost it still reads back with its score intact.
   *
   * Only retried for 'quota'. A SecurityError will not be helped by a smaller payload,
   * and a second attempt is a second thrown exception for nothing.
   */
  return attempt(capped.map((r, i) => (i < DETAIL_KEEP ? r : withoutDetail(r))))
}

export const gameRepo = {
  /**
   * Newest first.
   *
   * NO listId filter, unlike sessionRepo.getAll: a game spans several lists, so asking
   * for "the games for list X" has no honest answer.
   */
  getAll(): GameRecord[] {
    return read().sort((a, b) => b.finishedAt - a.finishedAt)
  },

  add(record: GameRecord): WriteResult {
    return write([...read().filter((r) => r.id !== record.id), record])
  },

  /** Used by account deletion and sign-out, never by ordinary use. */
  clear(): WriteResult {
    return write([])
  },
}
