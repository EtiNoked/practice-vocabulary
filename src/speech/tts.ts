import { BCP47, type LangCode } from '../lang/languages'

/**
 * Wrapper around the Web Speech API.
 *
 * This module carries most of v1's cross-browser risk. Three behaviours below are
 * workarounds, not preferences, and each is covered by a test:
 *
 *  1. getVoices() returns [] on the first call in Chrome; voices arrive later via
 *     the `voiceschanged` event.
 *  2. speechSynthesis hangs after a tab is backgrounded unless the queue is
 *     cancelled before each speak().
 *  3. iOS Safari only permits speech that descends from a user gesture — which is
 *     a constraint on CALLERS: never call speak() from a mount effect.
 */

let cachedVoices: SpeechSynthesisVoice[] = []

function synth(): SpeechSynthesis | null {
  return typeof globalThis.speechSynthesis === 'undefined' ? null : globalThis.speechSynthesis
}

/** True when the browser can speak at all. */
export function isSupported(): boolean {
  return synth() !== null
}

/**
 * Resolve the device's voice list, coping with Chrome's empty first call.
 *
 * Always resolves — never rejects — because a device with no voices is a
 * supported (if degraded) state, not an error.
 */
export function loadVoices(timeoutMs = 3000): Promise<SpeechSynthesisVoice[]> {
  const speech = synth()
  if (!speech) return Promise.resolve([])

  const immediate = speech.getVoices()
  if (immediate.length > 0) {
    cachedVoices = immediate
    return Promise.resolve(immediate)
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      speech.removeEventListener('voiceschanged', onChange)
      cachedVoices = voices
      resolve(voices)
    }
    const onChange = () => finish(speech.getVoices())
    const timer = setTimeout(() => finish(speech.getVoices()), timeoutMs)
    speech.addEventListener('voiceschanged', onChange)
  })
}

/** The voices most recently loaded. Empty until loadVoices() resolves. */
export function getCachedVoices(): SpeechSynthesisVoice[] {
  return cachedVoices
}

/**
 * Voices to use when a caller does not supply a list.
 *
 * Falls back to a live getVoices() when the cache is still empty, so a component
 * that speaks before loadVoices() has settled still gets a proper voice instead of
 * silently handing the platform an unqualified utterance.
 */
function effectiveVoices(): readonly SpeechSynthesisVoice[] {
  if (cachedVoices.length > 0) return cachedVoices
  return synth()?.getVoices() ?? []
}

/**
 * Best available voice for a language: exact BCP-47 tag first, then any voice
 * sharing the language prefix (so nl-BE serves for nl), then nothing.
 */
export function pickVoice(
  lang: LangCode,
  voices: readonly SpeechSynthesisVoice[] = effectiveVoices(),
): SpeechSynthesisVoice | null {
  const target = BCP47[lang].toLowerCase()
  const prefix = lang.toLowerCase()
  const tag = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-')

  return (
    voices.find((v) => tag(v) === target) ??
    voices.find((v) => tag(v).startsWith(`${prefix}-`) || tag(v) === prefix) ??
    null
  )
}

export function hasVoiceFor(
  lang: LangCode,
  voices: readonly SpeechSynthesisVoice[] = effectiveVoices(),
): boolean {
  return pickVoice(lang, voices) !== null
}

export function cancel(): void {
  synth()?.cancel()
}

/**
 * Speak `text` in `lang`.
 *
 * MUST be called from within a user gesture (a click/tap handler) or iOS Safari
 * silently drops it. Every call site in this app descends from a tap.
 */
export function speak(
  text: string,
  lang: LangCode,
  voices: readonly SpeechSynthesisVoice[] = effectiveVoices(),
): void {
  const speech = synth()
  if (!speech || text.trim() === '') return

  speech.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = BCP47[lang]
  const voice = pickVoice(lang, voices)
  if (voice) utterance.voice = voice
  // Slightly slower than default: the listener is transcribing, not skimming.
  utterance.rate = 0.9
  speech.speak(utterance)
}
