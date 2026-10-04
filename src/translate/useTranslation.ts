import { useEffect, useState } from 'react'
import type { LangCode } from '../lang/languages'
import { availabilityFor } from './translator'

/**
 * Whether to offer translation for a language pair at all.
 *
 * Deliberately starts FALSE and turns true only once the browser has confirmed it:
 * asking is asynchronous, and starting from true would flash a Translate button on
 * every row of a Safari user's list and then take it away again.
 *
 * `downloadable` counts as ready. The model is not on the device yet, but the user
 * can have it by clicking — and the click is also the user gesture Chromium requires
 * before it will download one, so the button has to exist for that to be possible.
 */
export function useTranslationReady(from: LangCode, to: LangCode): boolean {
  /**
   * The answer, recorded together with the pair it was an answer TO.
   *
   * Storing the pair is what lets the stale result be discarded during render. The
   * alternative — clearing a plain boolean at the top of the effect — leaves one
   * render in between where the OLD pair's answer is still on screen, which on a
   * list whose languages were just changed is a button offering to translate between
   * two languages the list no longer has.
   */
  const [checked, setChecked] = useState<{ from: LangCode; to: LangCode; ready: boolean } | null>(
    null,
  )

  useEffect(() => {
    let alive = true
    void availabilityFor(from, to).then((availability) => {
      if (alive) setChecked({ from, to, ready: availability !== 'unavailable' })
    })
    return () => {
      alive = false
    }
  }, [from, to])

  return checked !== null && checked.from === from && checked.to === to && checked.ready
}
