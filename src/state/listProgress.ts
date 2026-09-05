import type { SessionRecord } from './types'

/**
 * How a list is going, at a glance.
 *
 * Named for the standing, not for the colour: a band is a fact about the score,
 * and which colour draws it is the component's business. Renaming a colour later
 * should not mean renaming a concept here.
 */
export type ScoreBand = 'perfect' | 'fair' | 'weak'

/** Below this, a list needs work rather than polish. */
export const FAIR_PCT = 70

/**
 * The band a finished run falls into, or null when it says nothing.
 *
 * `right === total` rather than `pct >= 100` for perfect, deliberately. `pct` is
 * rounded at write time, so 199/200 is stored as 100 — and a green "everything
 * right" on a run with a miss in it is a lie the user has no way to spot. The
 * row shows `right / total` alongside the percentage for the same reason.
 */
export function scoreBand(record: Pick<SessionRecord, 'right' | 'total' | 'pct'>): ScoreBand | null {
  if (record.total === 0) return null
  if (record.right === record.total) return 'perfect'
  return record.pct >= FAIR_PCT ? 'fair' : 'weak'
}

/**
 * The most recent COMPARABLE run for each list.
 *
 * Comparable means a full run that was not stopped early — the same filter
 * `ScoreHistory`'s trend applies, and for the same reason. A wrong-only re-run
 * is a deliberately harder subset, so colouring a list red because the user just
 * drilled its three hardest words would be actively misleading; and a run
 * abandoned after two cards of forty says nothing about the list at all.
 *
 * Most RECENT rather than best or averaged: the question a colour on a list
 * answers is "where do I stand now", and an average keeps a bad first attempt
 * alive long after it stopped being true.
 */
export function latestScores(records: readonly SessionRecord[]): Map<string, SessionRecord> {
  const latest = new Map<string, SessionRecord>()
  for (const record of records) {
    if (record.mode !== 'full' || record.partial || record.total === 0) continue
    const held = latest.get(record.listId)
    // Sorted here rather than trusted from the caller: records arrive
    // newest-first today, but that is not this function's to assume.
    if (!held || record.finishedAt > held.finishedAt) latest.set(record.listId, record)
  }
  return latest
}
