import { MAX_TESTS, type SavedTest } from '../state/testPlan'
import type { WriteResult } from './types'

/**
 * Saved tests, on this device.
 *
 * Its own key and its own module, parallel to `listRepo` rather than to `sessionRepo`: a
 * saved test is a DOCUMENT — mutable, deletable, updated in place — where a record is a
 * log entry that nothing rewrites. That difference shows up again in the security rules,
 * where this collection allows `update` and the two log collections forbid it.
 */
export const TEST_STORAGE_KEY = 'pvt.tests.v1'

/**
 * FROZEN AT 1.
 *
 * `read()` returns [] on a mismatch, so bumping this deletes every user's saved tests
 * with no error and no way back. New fields go on as optional ones — a v1 reader ignoring
 * an unknown key is exactly the forward compatibility already designed for. Guarded in
 * test/invariants.test.ts, the same way sessionRepo's and gameRepo's are.
 */
export const SCHEMA_VERSION = 1

interface Payload {
  schemaVersion: number
  tests: SavedTest[]
}

/**
 * Structural validation, deliberately shallow.
 *
 * Enough that nothing downstream dereferences a missing `spec`; not so much that a test
 * is thrown away over a field nobody reads. Note what is NOT checked: whether `listIds`
 * name lists that still exist. A test that quietly repaired itself would become a
 * different test, so a dangling id survives and the screen explains it (011 FR-17).
 */
function isSavedTest(value: unknown): value is SavedTest {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  const spec = t.spec as Record<string, unknown> | null | undefined
  return (
    typeof t.id === 'string' &&
    typeof t.name === 'string' &&
    typeof spec === 'object' &&
    spec !== null &&
    Array.isArray(spec.listIds) &&
    (spec.source === 'all' || spec.source === 'missed') &&
    (t.count === null || typeof t.count === 'number') &&
    typeof t.updatedAt === 'number'
  )
}

/**
 * Every failure mode — absent key, malformed JSON, wrong shape, unknown version, storage
 * disabled — returns []. Losing saved tests is bad; white-screening the app over one
 * corrupt key is worse. The same contract listRepo, sessionRepo and gameRepo all keep.
 */
function read(): SavedTest[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(TEST_STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return []
    const payload = parsed as Partial<Payload>
    if (payload.schemaVersion !== SCHEMA_VERSION) return []
    if (!Array.isArray(payload.tests)) return []
    // Per ENTRY, not all-or-nothing: one corrupt row must not cost the other forty-nine.
    return payload.tests.filter(isSavedTest)
  } catch {
    return []
  }
}

function write(tests: SavedTest[]): WriteResult {
  try {
    localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, tests } satisfies Payload),
    )
    return { ok: true }
  } catch (error) {
    const isQuota = error instanceof DOMException && error.name === 'QuotaExceededError'
    return { ok: false, reason: isQuota ? 'quota' : 'unavailable' }
  }
}

export const testRepo = {
  /** Newest-updated first, which is the order a list of them should read in. */
  getAll(): SavedTest[] {
    return read().sort((a, b) => b.updatedAt - a.updatedAt)
  },

  /**
   * Create or update, keyed by id.
   *
   * The cap applies to NEW tests only. Refusing an update at the limit would trap a user
   * with fifty tests into being unable to correct any of them — the limit is about
   * unbounded growth, and an update grows nothing.
   */
  save(test: SavedTest): WriteResult {
    const existing = read()
    const at = existing.findIndex((t) => t.id === test.id)
    if (at === -1 && existing.length >= MAX_TESTS) return { ok: false, reason: 'quota' }

    const next = at === -1 ? [...existing, test] : existing.map((t) => (t.id === test.id ? test : t))
    return write(next)
  },

  remove(id: string): WriteResult {
    const existing = read()
    if (!existing.some((t) => t.id === id)) return { ok: false, reason: 'missing' }
    return write(existing.filter((t) => t.id !== id))
  },
}
