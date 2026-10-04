import { DEFAULT_DRILL_OPTIONS, PROMPT_MODES, type DrillOptions, type PromptMode } from '../state/types'

const key = (listId: string) => `pvt.drill.prefs.${listId}`

/**
 * The remembered prompt mode, reading a preference written before it was an enum.
 *
 * `showWord: true` was "say it and show it" and `false` was "say it" — 'both' and 'hear'.
 * Mapping them keeps everyone's existing choice rather than silently resetting the one
 * setting this feature touched. Anything unrecognized falls to the default.
 */
function storedPrompt(parsed: { prompt?: unknown; showWord?: unknown }): PromptMode {
  if (PROMPT_MODES.includes(parsed.prompt as PromptMode)) return parsed.prompt as PromptMode
  if (parsed.showWord === true) return 'both'
  return DEFAULT_DRILL_OPTIONS.prompt
}

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
    const parsed = JSON.parse(raw) as Partial<DrillOptions> & { showWord?: unknown }
    return {
      ordering: parsed.ordering === 'list' ? 'list' : 'random',
      prompt: storedPrompt(parsed),
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
