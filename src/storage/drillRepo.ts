import { isFinished } from '../state/session'
import type {
  DrillMode,
  PersistedDrill,
  Session,
  SessionRecord,
  WordList,
} from '../state/types'
import type { WriteResult } from './types'

/**
 * Its own key, deliberately.
 *
 * Separate from `pvt.lists.v1` (the user's words, which must never be at risk
 * from a drill bug) and from `pvt.sessions.v1` (finished-drill history, a
 * different module with a different lifetime — see sessionRepo.ts).
 */
export const DRILL_STORAGE_KEY = 'pvt.drill.v1'
export const SCHEMA_VERSION = 1

/**
 * How long a parked drill stays resumable (spec A5).
 *
 * Long enough for "I came back after dinner", short enough that a forgotten
 * drill from last week does not ambush you when you open the app.
 */
export const TTL_MS = 24 * 60 * 60 * 1000

/** What a caller gets back, ready to spread into the practising state. */
export interface RestoredDrill {
  list: WordList
  session: Session
  runKind: SessionRecord['mode']
}

const MODES: readonly DrillMode[] = ['practice', 'test']

function isWordList(value: unknown): value is WordList {
  if (typeof value !== 'object' || value === null) return false
  const l = value as Record<string, unknown>
  return typeof l.id === 'string' && typeof l.name === 'string' && Array.isArray(l.pairs)
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    typeof s.listId === 'string' &&
    (MODES as readonly unknown[]).includes(s.mode) &&
    Array.isArray(s.pairs) &&
    Array.isArray(s.order) &&
    typeof s.index === 'number' &&
    Number.isFinite(s.index) &&
    s.index >= 0 &&
    typeof s.revealed === 'boolean' &&
    typeof s.marks === 'object' &&
    s.marks !== null
  )
}

/**
 * Read the parked drill.
 *
 * TOTAL. Every failure mode — absent key, malformed JSON, wrong shape, unknown
 * schema version, expired, already finished, storage disabled — returns null and
 * the app opens at home (FR-5). This is the same contract as listRepo's read():
 * a corrupt key must never white-screen the app, and the worst acceptable
 * outcome here is only "you start this drill again".
 *
 * `now` is injectable so the TTL is testable without faking the clock.
 */
function read(now: number): RestoredDrill | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(DRILL_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const payload = parsed as Partial<PersistedDrill>

    if (payload.schemaVersion !== SCHEMA_VERSION) return null
    if (typeof payload.savedAt !== 'number' || !Number.isFinite(payload.savedAt)) return null
    if (now - payload.savedAt > TTL_MS) return null
    if (!isWordList(payload.list)) return null
    if (!isSession(payload.session)) return null

    // A finished drill is not a resumable one: restoring it would land the user
    // on a card that does not exist. Only reachable from a stale key written by
    // an older build — App clears on reaching results.
    if (isFinished(payload.session)) return null

    return {
      list: payload.list,
      session: {
        ...payload.session,
        /*
         * COERCED here rather than required in isSession, and the difference
         * matters: a drill parked by a build older than 009 has no such key, so
         * requiring it would return null for every run in flight the moment this
         * shipped — ending someone's practice to gain a default we can simply
         * write ourselves (009 FR-7).
         *
         * `=== true` and not a truthiness test, so a hand-edited "yes" lands
         * covered rather than open.
         */
        answersOpen: payload.session.answersOpen === true,
      },
      // COERCED, not rejected. Throwing away a drill in progress over this one
      // label would be a worse outcome than logging it as a full run — the same
      // trade-off listRepo makes for an unknown language code.
      runKind: payload.runKind === 'wrong-only' ? 'wrong-only' : 'full',
    }
  } catch {
    return null
  }
}

export const drillRepo = {
  /**
   * Park the drill in progress.
   *
   * Returns a WriteResult and NEVER throws: persistence is a convenience layer,
   * and a full disk or a private-mode refusal must degrade to 001's in-memory
   * behaviour rather than kill the drill (FR-6). Callers are expected to ignore
   * the result.
   */
  save(drill: RestoredDrill, now: number = Date.now()): WriteResult {
    const payload: PersistedDrill = {
      schemaVersion: SCHEMA_VERSION,
      savedAt: now,
      screen: 'practising',
      list: drill.list,
      session: drill.session,
      runKind: drill.runKind,
    }
    try {
      localStorage.setItem(DRILL_STORAGE_KEY, JSON.stringify(payload))
      return { ok: true }
    } catch (error) {
      const isQuota = error instanceof DOMException && error.name === 'QuotaExceededError'
      return { ok: false, reason: isQuota ? 'quota' : 'unavailable' }
    }
  },

  load(now: number = Date.now()): RestoredDrill | null {
    return read(now)
  },

  /**
   * Forget the parked drill — on finishing, quitting, going home, or signing out
   * (FR-4). Swallows a storage refusal: there is nothing useful a caller could
   * do about it, and the drill is over either way.
   */
  clear(): void {
    try {
      localStorage.removeItem(DRILL_STORAGE_KEY)
    } catch {
      /* storage disabled — nothing was persisted to begin with */
    }
  },
}
