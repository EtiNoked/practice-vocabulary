import { groupRuns, type RunGroup } from './runGroup'
import type { SessionRecord } from './types'

/** How you have been doing lately: a rounded percentage, and what it is an average of. */
export interface Trend {
  readonly average: number
  readonly count: number
}

/** The most recent runs an average is taken over. Beyond this it stops being "lately". */
const RECENT = 5

/**
 * Full runs only — a wrong-only drill is a harder subset and would drag the average down,
 * and a run stopped early is not a real attempt.
 *
 * Over RUNS, not records. A test spanning three lists writes three records (011 D-3), and
 * averaging those would count one run three times — silently, and with a number that
 * still looks entirely plausible. `groupRuns` is the one place that folding happens.
 *
 * `null` from fewer than two comparable runs: a single score is not a trend, and calling
 * it one would put "averaging 80% over your last 1 full run" under a user's first drill.
 *
 * Lifted out of `ScoreHistory` when 012 emptied the home screen. The list it used to sit
 * above is `ReviewScreen`'s job now — day-grouped, filterable and openable, which the
 * ten-row log never was — but the average had nowhere else to live and is the one part of
 * that component worth keeping.
 */
export function trend(records: readonly SessionRecord[]): Trend | null {
  return trendOfRuns(groupRuns(records))
}

/** The same, for a caller that has already folded its records. */
export function trendOfRuns(runs: readonly RunGroup[]): Trend | null {
  const comparable = runs.filter((r) => r.mode === 'full' && !r.partial)
  if (comparable.length < 2) return null
  const recent = comparable.slice(0, RECENT)
  const average = Math.round(recent.reduce((sum, r) => sum + r.pct, 0) / recent.length)
  return { average, count: recent.length }
}
