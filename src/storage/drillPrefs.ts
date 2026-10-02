import { DEFAULT_DRILL_OPTIONS, type DrillOptions } from '../state/types'

const key = (listId: string) => `pvt.drill.prefs.${listId}`

/**
 * The start screen's Order and Show-the-word choices for one list, as last used on this device.
 *
 * A per-device convenience, like the theme and the My lists order, and deliberately NOT
 * stored on the list: a shared list belongs to several people, and one member liking list
 * order must not change how the list deals for everyone else.
 *
 * Every failure (no storage, a missing or malformed value) reads as the defaults.
 */
export function readDrillPrefs(listId: string): DrillOptions {
  try {
    const raw = localStorage.getItem(key(listId))
    if (!raw) return DEFAULT_DRILL_OPTIONS
    const parsed = JSON.parse(raw) as Partial<DrillOptions>
    return {
      ordering: parsed.ordering === 'list' ? 'list' : 'random',
      showWord: parsed.showWord === true,
    }
  } catch {
    return DEFAULT_DRILL_OPTIONS
  }
}

export function writeDrillPrefs(listId: string, prefs: DrillOptions): void {
  try {
    localStorage.setItem(key(listId), JSON.stringify(prefs))
  } catch {
    /* A browser that cannot store it simply starts from the defaults next time. */
  }
}
