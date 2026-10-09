import { useEffect, useState } from 'react'
import { isSameLanguage, type LangCode } from '../lang/languages'
import { availabilityFor } from './translator'

/**
 * How a list's rows can be translated on this device.
 *
 *   checking  → the browser has not answered yet; offer nothing, so neither kind of
 *               button flashes up and is then swapped for the other
 *   built-in  → the browser's own on-device translator (Chrome on a computer, today);
 *               the suggestion appears in the editor and nothing leaves the device
 *   web       → no on-device translator here (phones, Safari, Firefox); the row's
 *               button opens Google Translate with the word filled in instead, and the
 *               word only leaves the device when the user taps it
 *   none      → the list explains its words in their own language; nothing to translate
 *
 * `downloadable` counts as built-in. The model is not on the device yet, but the user can
 * have it by clicking, and the click is also the user gesture Chromium requires before it
 * will download one, so the button has to exist for that to be possible.
 */
export type TranslationMode = 'checking' | 'built-in' | 'web' | 'none'

export function useTranslationMode(from: LangCode, to: LangCode): TranslationMode {
  /**
   * The answer, recorded together with the pair it was an answer TO.
   *
   * Storing the pair is what lets a stale result be discarded during render: on a list
   * whose languages were just changed, the OLD pair's answer must not be on screen for
   * even one render.
   */
  const [checked, setChecked] = useState<{ from: LangCode; to: LangCode; builtIn: boolean } | null>(
    null,
  )

  useEffect(() => {
    let alive = true
    void availabilityFor(from, to).then((availability) => {
      if (alive) setChecked({ from, to, builtIn: availability !== 'unavailable' })
    })
    return () => {
      alive = false
    }
  }, [from, to])

  if (isSameLanguage(from, to)) return 'none'
  if (checked === null || checked.from !== from || checked.to !== to) return 'checking'
  return checked.builtIn ? 'built-in' : 'web'
}

/**
 * Google Translate, opened on one word in a given direction. Used where the browser has no
 * on-device translator. On a phone with the Google Translate app installed, the system opens
 * the link in the app.
 */
export function webTranslateUrl(text: string, from: LangCode, to: LangCode): string {
  const params = new URLSearchParams({ sl: from, tl: to, text: text.trim(), op: 'translate' })
  return `https://translate.google.com/?${params.toString()}`
}
