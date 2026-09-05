import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireVoicesChanged, setStubVoices, speechCalls } from '../test/setup'
import { hasVoiceFor, loadVoices, pickVoice, speak } from './tts'

const voices = (...specs: Array<[string, string]>) =>
  specs.map(([name, lang]) => ({ name, lang })) as SpeechSynthesisVoice[]

afterEach(() => vi.useRealTimers())

describe('pickVoice', () => {
  it('prefers an exact BCP-47 tag match', () => {
    const list = voices(['Xander', 'nl-NL'], ['Daniel', 'en-GB'])
    expect(pickVoice('nl', list)?.name).toBe('Xander')
    expect(pickVoice('en', list)?.name).toBe('Daniel')
  })

  // Voice availability is device-dependent; a Flemish voice is still Dutch.
  it('falls back to a language-prefix match', () => {
    const list = voices(['Flemish', 'nl-BE'], ['Daniel', 'en-GB'])
    expect(pickVoice('nl', list)?.name).toBe('Flemish')
  })

  it('falls back to any English variant', () => {
    expect(pickVoice('en', voices(['Samantha', 'en-US']))?.name).toBe('Samantha')
  })

  it('returns null when no voice matches the language', () => {
    expect(pickVoice('nl', voices(['Daniel', 'en-GB']))).toBeNull()
  })

  it('returns null for an empty voice list', () => {
    expect(pickVoice('nl', [])).toBeNull()
  })

  it('is case-insensitive about language tags', () => {
    expect(pickVoice('nl', voices(['Xander', 'NL-nl']))?.name).toBe('Xander')
  })
})

describe('hasVoiceFor', () => {
  it('reports whether the prompt language can be spoken', () => {
    const list = voices(['Daniel', 'en-GB'])
    expect(hasVoiceFor('en', list)).toBe(true)
    expect(hasVoiceFor('nl', list)).toBe(false)
  })
})

describe('speak', () => {
  it('cancels before speaking', () => {
    // Not cosmetic: speechSynthesis hangs after a tab is backgrounded unless the
    // queue is cleared first. Order is the assertion, hence one shared call log.
    speak('dochter', 'nl')
    expect(speechCalls.map((c) => c.type)).toEqual(['cancel', 'speak'])
  })

  it('uses the Dutch BCP-47 tag for Dutch', () => {
    speak('dochter', 'nl')
    expect(speechCalls[1]).toMatchObject({ text: 'dochter', lang: 'nl-NL' })
  })

  it('uses the English BCP-47 tag for English', () => {
    speak('daughter', 'en')
    expect(speechCalls[1]).toMatchObject({ text: 'daughter', lang: 'en-GB' })
  })

  it('slows the rate slightly, since these are words to be transcribed', () => {
    speak('dochter', 'nl')
    expect(speechCalls[1]).toMatchObject({ rate: 0.9 })
  })

  it('attaches a matching voice when one exists', () => {
    speak('dochter', 'nl', voices(['Xander', 'nl-NL']))
    expect(speechCalls[1]).toMatchObject({ voice: 'Xander' })
  })

  it('still speaks when no voice matches, letting the platform choose', () => {
    speak('dochter', 'nl', voices(['Daniel', 'en-GB']))
    expect(speechCalls[1]).toMatchObject({ voice: null, text: 'dochter' })
  })

  it('does nothing for empty text', () => {
    speak('   ', 'nl')
    expect(speechCalls).toHaveLength(0)
  })
})

describe('loadVoices', () => {
  it('resolves immediately when voices are already available', async () => {
    setStubVoices([{ name: 'Xander', lang: 'nl-NL' }])
    await expect(loadVoices()).resolves.toHaveLength(1)
  })

  // Chrome returns [] from the first getVoices() call and fires voiceschanged later.
  it('waits for voiceschanged when the first call is empty', async () => {
    setStubVoices([])
    const pending = loadVoices()
    setStubVoices([{ name: 'Xander', lang: 'nl-NL' }])
    fireVoicesChanged()
    await expect(pending).resolves.toHaveLength(1)
  })

  it('gives up after the timeout and resolves with whatever it has', async () => {
    vi.useFakeTimers()
    setStubVoices([])
    const pending = loadVoices(3000)
    await vi.advanceTimersByTimeAsync(3100)
    await expect(pending).resolves.toEqual([])
  })
})
