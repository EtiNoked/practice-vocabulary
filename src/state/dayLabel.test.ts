import { describe, expect, it } from 'vitest'
import { byDay, dayLabel } from './dayLabel'

/**
 * A calendar heading, and the bucketing that uses it.
 *
 * Extracted from `ReviewScreen` in 012 so the game log cannot grow a second, subtly
 * different answer to "what does Yesterday mean" (012 D-10). The subtlety worth testing
 * is the local-midnight rule: an elapsed-milliseconds implementation passes every obvious
 * case and fails the one below.
 */

/** A fixed local instant, so nothing here depends on when the suite runs. */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime()

describe('dayLabel names the day, not the elapsed time', () => {
  const now = at(2026, 9, 6, 9, 0)

  it('calls the current day Today', () => {
    expect(dayLabel(at(2026, 9, 6, 1, 0), now)).toBe('Today')
    expect(dayLabel(at(2026, 9, 6, 23, 59), now)).toBe('Today')
  })

  it('calls the previous day Yesterday', () => {
    expect(dayLabel(at(2026, 9, 5, 8, 0), now)).toBe('Yesterday')
  })

  /*
   * THE case this rule exists for.
   *
   * 23:30 yesterday and 00:30 today are ONE HOUR apart. Subtracting raw milliseconds
   * files them together; comparing local midnights does not. Any rewrite that makes this
   * test go red has reintroduced the bug the comment in this module warns about.
   */
  it('splits an hour that straddles midnight into two days', () => {
    const justAfterMidnight = at(2026, 9, 6, 0, 30)
    const justBefore = at(2026, 9, 5, 23, 30)
    expect(justAfterMidnight - justBefore).toBe(3_600_000)
    expect(dayLabel(justAfterMidnight, now)).toBe('Today')
    expect(dayLabel(justBefore, now)).toBe('Yesterday')
  })

  it('dates anything older, en-GB', () => {
    expect(dayLabel(at(2026, 9, 4), now)).toBe('04/09/2026')
    expect(dayLabel(at(2025, 12, 31), now)).toBe('31/12/2025')
  })
})

describe('byDay buckets rows in the order given', () => {
  const now = at(2026, 9, 6)
  const row = (t: number, tag: string) => ({ t, tag })

  it('gives nothing back for nothing', () => {
    expect(byDay([], (r: { t: number }) => r.t, now)).toEqual([])
  })

  it('merges adjacent rows sharing a label', () => {
    const days = byDay(
      [row(at(2026, 9, 6, 10), 'a'), row(at(2026, 9, 6, 9), 'b'), row(at(2026, 9, 5), 'c')],
      (r) => r.t,
      now,
    )
    expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday'])
    expect(days[0]!.rows.map((r) => r.tag)).toEqual(['a', 'b'])
    expect(days[1]!.rows.map((r) => r.tag)).toEqual(['c'])
  })

  /*
   * ADJACENT only, deliberately. The caller is responsible for ordering, exactly as
   * `ReviewScreen` was when this loop lived inside it — sorting here would hide an
   * unsorted caller rather than expose it.
   */
  it('does not reunite a label that comes back after another', () => {
    const days = byDay(
      [row(at(2026, 9, 6), 'a'), row(at(2026, 9, 5), 'b'), row(at(2026, 9, 6), 'c')],
      (r) => r.t,
      now,
    )
    expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday', 'Today'])
  })

  it('preserves the rows it is given, untouched', () => {
    const rows = Object.freeze([row(at(2026, 9, 6), 'a')])
    expect(() => byDay(rows, (r) => r.t, now)).not.toThrow()
  })
})
