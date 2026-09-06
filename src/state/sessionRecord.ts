import { score } from './session'
import type { Session, SessionRecord, WordList } from './types'

/**
 * Above this many right answers, a record stores its misses only.
 *
 * A record is a log entry, not an archive. 300 right answers is already a longer
 * drill than this app is built for, and the cap is what stops MAX_RECORDS (200)
 * multiplied by a 500-word list from turning history into megabytes of
 * localStorage. The misses are never capped — they are the half a re-drill is
 * built from.
 */
export const MAX_RIGHT_PAIRS = 300

/**
 * Build the log entry for a finished drill.
 *
 * A pure function, kept OUT of appMachine.ts on purpose: the reducer must stay
 * free of side effects, and the write itself belongs to the component that owns
 * the store. This is just the shaping step, so it stays unit-testable.
 *
 * Returns null when nothing was answered — an empty log entry is noise, and it
 * would drag a user's average around for a drill they never really took.
 */
export function buildSessionRecord(
  list: WordList,
  session: Session,
  options: { mode: SessionRecord['mode']; partial: boolean; now?: number; id?: string },
): SessionRecord | null {
  const result = score(session)
  if (result.total === 0) return null

  const finishedAt = options.now ?? Date.now()

  return {
    id: options.id ?? `${finishedAt}-${Math.random().toString(36).slice(2, 10)}`,
    listId: list.id,
    // Captured now, not looked up later: history must still read sensibly after
    // the list is renamed or deleted.
    listName: list.name,
    right: result.right,
    wrong: result.wrong,
    total: result.total,
    pct: result.pct,
    wrongPairs: result.wrongPairs,
    // A CONDITIONAL SPREAD, not `rightPairs: undefined`: exactOptionalPropertyTypes
    // is on, so an explicit undefined is a type error — and, more to the point, a
    // present-but-undefined key would read back as "recorded, nothing right"
    // instead of "not recorded at all".
    ...(result.rightPairs.length <= MAX_RIGHT_PAIRS ? { rightPairs: result.rightPairs } : {}),
    finishedAt,
    mode: options.mode,
    partial: options.partial,
  }
}
