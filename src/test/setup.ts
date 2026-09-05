import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'

/**
 * Node 25 exposes its own experimental `localStorage` global, which shadows the
 * jsdom one and is inert unless the runtime was started with --localstorage-file.
 * The symptom is `localStorage.clear is not a function`. Installing a plain
 * in-memory Storage removes the ambiguity and keeps tests independent of which
 * implementation happens to win.
 */
class MemoryStorage implements Storage {
  #data = new Map<string, string>()

  get length(): number {
    return this.#data.size
  }
  key(index: number): string | null {
    return [...this.#data.keys()][index] ?? null
  }
  getItem(key: string): string | null {
    return this.#data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.#data.set(key, String(value))
  }
  removeItem(key: string): void {
    this.#data.delete(key)
  }
  clear(): void {
    this.#data.clear()
  }
}

// Assigned to globalThis.Storage too, so tests can spy on Storage.prototype.setItem
// to simulate a quota failure.
Object.defineProperty(globalThis, 'Storage', { value: MemoryStorage, writable: true })
Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
})

/**
 * jsdom implements neither speechSynthesis nor SpeechSynthesisUtterance, so every
 * test that touches the speech layer needs these stubs.
 *
 * `speechCalls` records calls across BOTH APIs in a single ordered array. Several
 * tests assert that `cancel()` happens before `speak()` — the workaround for
 * speechSynthesis hanging after a tab is backgrounded — and ordering across two
 * separate spies cannot express that.
 */
export type SpeechCall =
  | { type: 'cancel' }
  | { type: 'speak'; text: string; lang: string; voice: string | null; rate: number }

export const speechCalls: SpeechCall[] = []

/** Voices returned by the stubbed getVoices(). Mutate in a test to simulate a device. */
export let stubVoices: SpeechSynthesisVoice[] = []

export function setStubVoices(voices: Array<Pick<SpeechSynthesisVoice, 'name' | 'lang'>>): void {
  stubVoices = voices.map((v) => ({
    default: false,
    localService: true,
    voiceURI: v.name,
    ...v,
  })) as SpeechSynthesisVoice[]
}

/** Simulate Chrome's empty-first-call behaviour: getVoices() is empty until fired. */
export function fireVoicesChanged(): void {
  voicesChangedListeners.forEach((fn) => fn(new Event('voiceschanged')))
}

let voicesChangedListeners: Array<(e: Event) => void> = []

class StubUtterance {
  text: string
  lang = ''
  voice: SpeechSynthesisVoice | null = null
  rate = 1
  pitch = 1
  volume = 1
  constructor(text: string) {
    this.text = text
  }
}

beforeEach(() => {
  speechCalls.length = 0
  voicesChangedListeners = []
  setStubVoices([
    { name: 'Google Nederlands', lang: 'nl-NL' },
    { name: 'Daniel', lang: 'en-GB' },
    { name: 'Samantha', lang: 'en-US' },
  ])

  vi.stubGlobal('SpeechSynthesisUtterance', StubUtterance)
  vi.stubGlobal('speechSynthesis', {
    speak: (u: StubUtterance) => {
      speechCalls.push({
        type: 'speak',
        text: u.text,
        lang: u.lang,
        voice: u.voice?.name ?? null,
        rate: u.rate,
      })
    },
    cancel: () => {
      speechCalls.push({ type: 'cancel' })
    },
    pause: () => {},
    resume: () => {},
    getVoices: () => stubVoices,
    addEventListener: (type: string, fn: (e: Event) => void) => {
      if (type === 'voiceschanged') voicesChangedListeners.push(fn)
    },
    removeEventListener: (type: string, fn: (e: Event) => void) => {
      if (type === 'voiceschanged') {
        voicesChangedListeners = voicesChangedListeners.filter((l) => l !== fn)
      }
    },
    speaking: false,
    pending: false,
    paused: false,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  /*
   * The theme is applied as an attribute on <html>, which jsdom shares across
   * every test in a file. Without this, one test choosing dark leaves the next
   * one already overridden — and that failure reads as "the component ignored
   * its stored value", which is a long way from the truth.
   */
  document.documentElement.removeAttribute('data-theme')
  // Guarded: not every test environment exposes a working localStorage, and a
  // teardown failure here would mask the actual assertion failures.
  try {
    globalThis.localStorage?.clear()
  } catch {
    /* ignore */
  }
})
