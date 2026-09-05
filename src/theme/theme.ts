/**
 * Which palette to paint — remembered for this browser, on this device, forever.
 *
 * `localStorage`, and the contrast with its near-twin `auth/guestChoice.ts` is
 * the entire behaviour of both files. That one uses `sessionStorage` on purpose,
 * so a fresh visit is a fresh decision about signing in. A theme is the opposite:
 * it is set once, deliberately, and expected to still be there next week. The two
 * modules otherwise look identical, so the difference is worth saying out loud.
 *
 * A view concern and nothing else. It grants no access and gates no data, and it
 * is deliberately reachable from neither `auth/` nor `storage/`.
 *
 * Note what is NOT here: any reading of `prefers-color-scheme`. The OS preference
 * is answered entirely in CSS (`index.css`, the `@media` block), which is what
 * makes the default path paint correctly on the very first frame with no
 * JavaScript at all. This module only ever writes an OVERRIDE of that.
 */

/** A palette that can actually be painted. */
export type Theme = 'light' | 'dark'

/**
 * What the control offers. `null` is "follow the system", and it is represented
 * by the ABSENCE of the stored key rather than by a stored `'system'` — one
 * state, one representation, nothing to get out of step.
 */
export type ThemeChoice = Theme | null

export const THEME_KEY = 'pvt.theme'

/** Each theme's `--color-ground`. Kept in step with index.css by theme.test.ts. */
const GROUND: Record<Theme, string> = {
  light: '#f6fbfa',
  dark: '#0b1a1d',
}

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    // Anything unrecognised degrades to "follow the system". A stale or
    // hand-edited value must not become an attribute that matches no selector.
    return isTheme(stored) ? stored : null
  } catch {
    /*
     * Safari in private browsing throws on access rather than returning null.
     * A device that cannot store this follows the OS instead of the choice its
     * user made — degraded, never broken.
     */
    return null
  }
}

export function writeTheme(choice: ThemeChoice): void {
  try {
    if (choice) localStorage.setItem(THEME_KEY, choice)
    else localStorage.removeItem(THEME_KEY)
  } catch {
    /* See readTheme. */
  }
}

/**
 * Paint it: one attribute on `<html>`, which the two `[data-theme]` blocks in
 * index.css out-specify Tailwind's `:root` with.
 *
 * Idempotent, because `main.tsx` renders under `StrictMode`.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice) root.setAttribute('data-theme', choice)
  else root.removeAttribute('data-theme')

  syncThemeColor(choice)
}

/**
 * Keep the Android address bar and the installed PWA's status band in step.
 *
 * index.html ships two media-scoped `theme-color` tags, which answer the
 * follow-the-system case correctly and without JavaScript. An override is the
 * one case the browser cannot work out for itself, so it gets a single
 * media-less tag — inserted FIRST, because the spec has the browser take the
 * first `theme-color` whose media matches, and a media-less one always matches.
 *
 * Cosmetic: getting this wrong tints a strip of chrome, not the app.
 */
function syncThemeColor(choice: ThemeChoice): void {
  const id = 'theme-color-override'
  const existing = document.getElementById(id)

  if (!choice) {
    existing?.remove()
    return
  }

  const tag = (existing as HTMLMetaElement | null) ?? document.createElement('meta')
  tag.id = id
  tag.setAttribute('name', 'theme-color')
  tag.setAttribute('content', GROUND[choice])
  // Re-inserting an element that is already in the DOM moves it, so this stays
  // idempotent and cannot stack up a tag per change.
  document.head.insertBefore(tag, document.head.firstChild)
}

/**
 * Read the stored choice and paint it, returning what it found.
 *
 * Called once from `main.tsx` BEFORE `render`, not from an effect: an effect
 * runs after the first paint, so a user who chose dark would watch the app flash
 * light and then snap — the exact thing they opted out of.
 */
export function initTheme(): ThemeChoice {
  const choice = readTheme()
  applyTheme(choice)
  return choice
}
