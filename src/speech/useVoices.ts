import { useEffect, useState } from 'react'
import type { LangCode } from '../lang/languages'
import { hasVoiceFor, loadVoices, onSpeechOutcome, watchVoices } from './tts'

export interface VoicesState {
  voices: SpeechSynthesisVoice[]
  /** False until the first load settles, so the UI does not flash a false warning. */
  ready: boolean
  /** Languages that failed when the device actually tried to speak them. */
  failed: ReadonlySet<LangCode>
  /** Languages that the device has actually spoken this visit. */
  spoken: ReadonlySet<LangCode>
}

/**
 * Load the device voice list once, at app start, and keep it current.
 *
 * Deliberately not per-card: getVoices() is empty on Chrome's first call, and
 * re-running that dance for every word would make the first card of a session
 * silent on some devices.
 */
export function useVoices(): VoicesState {
  const [state, setState] = useState<VoicesState>({
    voices: [],
    ready: false,
    failed: new Set(),
    spoken: new Set(),
  })

  useEffect(() => {
    let alive = true
    void loadVoices().then((voices) => {
      if (alive) setState((s) => ({ ...s, voices, ready: true }))
    })
    // Voices that arrive after loadVoices() gave up, e.g. a slow Android speech engine.
    const stopWatching = watchVoices((voices) => {
      if (alive && voices.length > 0) setState((s) => ({ ...s, voices }))
    })
    const stopListening = onSpeechOutcome(({ lang, spoken }) => {
      if (!alive) return
      setState((s) => {
        const failed = new Set(s.failed)
        const heard = new Set(s.spoken)
        if (spoken) {
          failed.delete(lang)
          heard.add(lang)
        } else {
          failed.add(lang)
          heard.delete(lang)
        }
        return { ...s, failed, spoken: heard }
      })
    })
    return () => {
      alive = false
      stopWatching()
      stopListening()
    }
  }, [])

  return state
}

/**
 * Whether to tell the user a language has no voice (and show the word as text instead).
 *
 * Trusts what speaking actually did over what the voice list says, because the list is only
 * a hint and on Android an unreliable one:
 *
 *   it failed when spoken        → missing
 *   it was spoken this visit     → not missing, whatever the list says
 *   the list is empty            → unknown, so not missing: the browser just won't say
 *   the list lacks the language  → missing, until speaking proves otherwise
 */
export function voiceMissingFor(lang: LangCode, state: VoicesState): boolean {
  if (!state.ready) return false
  if (state.failed.has(lang)) return true
  if (state.spoken.has(lang)) return false
  if (state.voices.length === 0) return false
  return !hasVoiceFor(lang, state.voices)
}
