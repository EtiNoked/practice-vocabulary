import type { SessionRecord } from './types'

/**
 * How a finished drill went, at a glance.
 *
 * Named for the standing rather than for the colour: a band is a fact about the
 * score, and which colour draws it is the component's business. Renaming a
 * colour later should not mean renaming a concept here.
 */
export type ScoreBand = 'perfect' | 'fair' | 'weak'

/** Below this, a run needs another go rather than a polish. */
const FAIR_PCT = 70

/**
 * The band a run falls into, or null when it says nothing.
 *
 * `right === total` rather than `pct >= 100` for perfect, deliberately. `pct` is
 * rounded at write time, so 199/200 is stored as 100 — and a green "everything
 * right" on a run with a miss in it is a lie the user has no way to spot. Every
 * coloured row prints `right / total (pct%)` for the same reason.
 *
 * Takes the run's OWN score, with no filtering by mode: a wrong-only re-run that
 * went badly genuinely went badly on the words it covered, and each row already
 * says which kind of run it was. Filtering belongs to `ScoreHistory`'s average,
 * where a harder subset really would distort a number that spans runs.
 */
export function scoreBand(
  record: Pick<SessionRecord, 'right' | 'total' | 'pct'>,
): ScoreBand | null {
  if (record.total === 0) return null
  if (record.right === record.total) return 'perfect'
  return record.pct >= FAIR_PCT ? 'fair' : 'weak'
}

/**
 * The border a band wears.
 *
 * Tokens, so both themes come for free — `--color-correct` is a dark green in
 * light and a light green in dark, and no component has to know which.
 */
const BAND_BORDER: Record<ScoreBand, string> = {
  perfect: 'border-correct',
  fair: 'border-accent',
  weak: 'border-incorrect',
}

/**
 * The border class for a run, including the neutral case.
 *
 * The only thing the components need, and therefore the only presentation
 * export: shared by all three surfaces that show a practice, so the review
 * screen, the home log and the drill's own page cannot drift apart.
 */
export function bandBorder(record: Pick<SessionRecord, 'right' | 'total' | 'pct'>): string {
  const band = scoreBand(record)
  return band ? BAND_BORDER[band] : 'border-line'
}
