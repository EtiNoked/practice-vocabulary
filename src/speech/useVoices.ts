import { useEffect, useState } from 'react'
import type { LangCode } from '../lang/languages'
import { hasVoiceFor, loadVoices } from './tts'

export interface VoicesState {
  voices: SpeechSynthesisVoice[]
  /** False until the first load settles, so the UI does not flash a false warning. */
  ready: boolean
}

/**
 * Load the device voice list once, at app start.
 *
 * Deliberately not per-card: getVoices() is empty on Chrome's first call, and
 * re-running that dance for every word would make the first card of a session
 * silent on some devices.
 */
export function useVoices(): VoicesState {
  const [state, setState] = useState<VoicesState>({ voices: [], ready: false })

  useEffect(() => {
    let alive = true
    void loadVoices().then((voices) => {
      if (alive) setState({ voices, ready: true })
    })
    return () => {
      alive = false
    }
  }, [])

  return state
}

/** Convenience for the missing-voice banner. Reports false until voices load. */
export function useHasVoice(lang: LangCode): { available: boolean; ready: boolean } {
  const { voices, ready } = useVoices()
  return { available: ready && hasVoiceFor(lang, voices), ready }
}
