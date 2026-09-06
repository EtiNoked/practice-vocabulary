/**
 * 'Today' / 'Yesterday' / an en-GB date, matching `formatDate` elsewhere.
 *
 * Compares LOCAL MIDNIGHTS rather than elapsed milliseconds. 23:30 yesterday and
 * 00:30 today are an hour apart and two different days, and subtracting raw time
 * would file them together.
 *
 * Deliberately a different notion of time from `missedWords.ts`, whose windows
 * roll from `now`. A heading is a calendar idea; a window is a duration. Do not
 * unify them.
 *
 * Extracted from `ReviewScreen` in 012, when the game log became a second caller. Two
 * call sites is normally not enough to share (the counter-precedent is written out in
 * `NavMenu.tsx`) — but that refusal is about differing BEHAVIOUR, and this is a pure
 * function whose entire subtlety is the paragraph above. Copied, the two logs would
 * eventually disagree about what "Yesterday" means, silently and only near midnight.
 */
export function dayLabel(ms: number, now: number): string {
  const startOf = (t: number) => new Date(t).setHours(0, 0, 0, 0)
  const days = Math.round((startOf(now) - startOf(ms)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(ms).toLocaleDateString('en-GB')
}

/**
 * Fold rows into day buckets, in the order given.
 *
 * ADJACENT rows only: the caller owns the ordering and must already have sorted
 * newest-first. Sorting in here would quietly paper over an unsorted caller instead of
 * letting its own test catch it — and the two callers get their order from different
 * places (`groupRuns` sorts for the drill log; the game log sorts for itself).
 */
export function byDay<T>(
  rows: readonly T[],
  at: (row: T) => number,
  now: number,
): Array<{ label: string; rows: T[] }> {
  const days: Array<{ label: string; rows: T[] }> = []
  for (const row of rows) {
    const label = dayLabel(at(row), now)
    const last = days[days.length - 1]
    if (last && last.label === label) last.rows.push(row)
    else days.push({ label, rows: [row] })
  }
  return days
}
