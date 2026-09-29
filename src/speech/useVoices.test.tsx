import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fireVoicesChanged, lastUtterance, setStubVoices } from '../test/setup'
import { speak } from './tts'
import { useVoices, voiceMissingFor } from './useVoices'

/**
 * When the app may say "No Dutch voice on this device" (and show the word as text).
 *
 * The voice list is only a hint, and on Android an unreliable one: Chrome there lists only the
 * voices already downloaded, sometimes none, and can still speak through the system engine.
 * So what speaking actually did outranks what the list says.
 */
describe('whether a voice is missing', () => {
  async function ready() {
    const hook = renderHook(() => useVoices())
    await waitFor(() => expect(hook.result.current.ready).toBe(true))
    return hook
  }

  it('warns when the list has other languages but not this one', async () => {
    setStubVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { result } = await ready()
    expect(voiceMissingFor('nl', result.current)).toBe(true)
    expect(voiceMissingFor('en', result.current)).toBe(false)
  })

  it('does NOT warn when the browser lists no voices at all: it just will not say', async () => {
    setStubVoices([])
    const { result } = renderHook(() => useVoices())
    // loadVoices waits for voiceschanged, then gives up after its timeout.
    await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 4000 })
    expect(voiceMissingFor('nl', result.current)).toBe(false)
  })

  it('stops warning once the language has actually been spoken, whatever the list says', async () => {
    setStubVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { result } = await ready()
    act(() => {
      speak('dochter', 'nl')
      lastUtterance()!.onstart!()
    })
    expect(voiceMissingFor('nl', result.current)).toBe(false)
  })

  it('warns when speaking fails because the language is unavailable, even if it is listed', async () => {
    const { result } = await ready()
    expect(voiceMissingFor('nl', result.current)).toBe(false)
    act(() => {
      speak('dochter', 'nl')
      lastUtterance()!.onerror!({ error: 'language-unavailable' })
    })
    expect(voiceMissingFor('nl', result.current)).toBe(true)
  })

  it('does not treat an interrupted or refused utterance as a missing voice', async () => {
    const { result } = await ready()
    act(() => {
      speak('dochter', 'nl')
      lastUtterance()!.onerror!({ error: 'interrupted' })
      speak('dochter', 'nl')
      lastUtterance()!.onerror!({ error: 'not-allowed' })
    })
    expect(voiceMissingFor('nl', result.current)).toBe(false)
  })

  it('picks up voices that arrive late, after the first load gave up waiting', async () => {
    setStubVoices([{ name: 'Samantha', lang: 'en-US' }])
    const { result } = await ready()
    expect(voiceMissingFor('nl', result.current)).toBe(true)
    act(() => {
      setStubVoices([{ name: 'Samantha', lang: 'en-US' }, { name: 'Google Nederlands', lang: 'nl-NL' }])
      fireVoicesChanged()
    })
    expect(voiceMissingFor('nl', result.current)).toBe(false)
  })
})
