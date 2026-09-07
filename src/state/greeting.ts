/**
 * How to say hello, given the hour and whatever name we have.
 *
 * `now` is a PARAMETER, like everything else time-dependent in this directory: the whole
 * suite runs without fake timers, and the greeting has to agree with the misses count
 * beside it about which instant the screen was drawn at.
 *
 * LOCAL hours, deliberately — the same choice `dayLabel` makes and for the same reason.
 * A UTC reading would wish someone in Auckland good evening over breakfast, and the bug
 * would be invisible to anyone developing in London.
 */
export function greeting(now: number, name?: string | null): string {
  const first = firstName(name)
  return first === null ? timeOfDay(now) : `${timeOfDay(now)}, ${first}`
}

/**
 * Before 05:00 is still last night.
 *
 * Every other boundary is the obvious one; this is the one worth writing down. "Good
 * morning" at 02:00 reads as a bug to anyone awake at it, where "Good evening" reads as
 * a late night — which is what it is.
 */
function timeOfDay(now: number): string {
  const hour = new Date(now).getHours()
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * The first word of a display name, or null when there is nothing to use.
 *
 * Null rather than a placeholder. Guests are the DEFAULT here — the local-only build has
 * no accounts at all — so the nameless greeting is the common case and must read as a
 * complete sentence rather than as a missing value.
 *
 * Deliberately NOT `AccountMenu`'s `displayName ?? email` fallback: that slot is an
 * identity check, where a full address is exactly right. A greeting is 24pt at the top of
 * a screen someone might be holding in front of a class.
 */
function firstName(name?: string | null): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? ''
  return first === '' ? null : first
}
