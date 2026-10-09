import { isSameLanguage, type LangCode } from '../lang/languages'

/**
 * Wrapper around the browser's built-in Translator API.
 *
 * The translation runs ON THE DEVICE, against a model the browser downloads once.
 * That is the whole reason this feature exists in this shape: the README promises a
 * signed-out visitor that nothing they type leaves their device, and sending every
 * word to a translation service would quietly end that. Nothing here makes a network
 * request with the user's words in it.
 *
 * The price is that the API is not everywhere — at the time of writing, Chromium
 * only. So EVERY entry point below degrades to "no translation available" rather
 * than throwing, and the UI is expected to hide itself when `availabilityFor`
 * reports `unavailable`. A browser without it must look like an app that simply
 * never offered the button, not like a broken one.
 */

/** What the browser says about a language pair. The API's own vocabulary. */
export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

/** Fraction 0..1 of the model downloaded so far. */
export type ProgressListener = (loaded: number) => void

interface DownloadProgressEvent {
  loaded: number
}

interface CreateMonitor {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: DownloadProgressEvent) => void,
  ): void
}

interface LanguagePair {
  sourceLanguage: string
  targetLanguage: string
}

interface TranslatorInstance {
  translate(text: string): Promise<string>
}

interface TranslatorApi {
  availability(pair: LanguagePair): Promise<Availability>
  create(options: LanguagePair & { monitor?: (monitor: CreateMonitor) => void }): Promise<TranslatorInstance>
}

/**
 * The global, if this browser has one.
 *
 * Checked by shape rather than by name alone: the API went through earlier,
 * differently-shaped drafts, and a global that does not answer `availability` is
 * no use to us whatever it is called.
 */
function api(): TranslatorApi | null {
  const candidate = (globalThis as { Translator?: TranslatorApi }).Translator
  if (!candidate || typeof candidate.availability !== 'function') return null
  return candidate
}

/**
 * Whether this device can translate between two languages.
 *
 * A list that explains its words in their OWN language is reported unavailable
 * before the browser is asked. Such a list is a real and supported thing here —
 * `de tweeling` against `twee kinderen van dezelfde geboorte` — and "translate
 * Dutch into Dutch" is not a question worth putting to the browser, which would
 * reject it anyway.
 */
export async function availabilityFor(from: LangCode, to: LangCode): Promise<Availability> {
  if (isSameLanguage(from, to)) return 'unavailable'
  const translator = api()
  if (!translator) return 'unavailable'
  try {
    return await translator.availability({ sourceLanguage: from, targetLanguage: to })
  } catch {
    return 'unavailable'
  }
}

/**
 * One translator instance per direction, reused for the rest of the visit.
 *
 * Creating one can mean downloading a model of tens of megabytes. Doing that per
 * word would be unusable, so instances are cached — the PROMISE, not the resolved
 * value, so two quick clicks share one download instead of starting two.
 */
const instances = new Map<string, Promise<TranslatorInstance>>()

/**
 * Which Translator implementation the cache was built against.
 *
 * A cached instance belongs to the global that produced it, so if that global is
 * replaced the cache means nothing and is dropped. In a browser this never fires —
 * the global is installed once — but it is what keeps each test's mock from
 * inheriting the previous test's translators.
 */
let cacheOwner: TranslatorApi | null = null

function instanceFor(
  translator: TranslatorApi,
  from: LangCode,
  to: LangCode,
  onProgress?: ProgressListener,
): Promise<TranslatorInstance> {
  if (cacheOwner !== translator) {
    instances.clear()
    cacheOwner = translator
  }

  const key = `${from}>${to}`
  const cached = instances.get(key)
  if (cached) return cached

  const created = translator
    .create({
      sourceLanguage: from,
      targetLanguage: to,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => onProgress?.(event.loaded))
      },
    })
    // A failed creation must not be remembered: the usual cause is a download that
    // did not finish, and the next click is exactly when it should be retried.
    .catch((error: unknown) => {
      if (instances.get(key) === created) instances.delete(key)
      throw error
    })

  instances.set(key, created)
  return created
}

/**
 * Translate one word or phrase.
 *
 * MUST be called from within a user gesture when the model has not been downloaded
 * yet — Chromium refuses to start the download otherwise. This is a constraint on
 * CALLERS, the same way `speak()` is: never translate from a mount effect.
 *
 * Rejects when the device cannot do it. Callers are expected to tell the user and
 * leave what they typed alone.
 */
export async function translate(
  text: string,
  from: LangCode,
  to: LangCode,
  onProgress?: ProgressListener,
): Promise<string> {
  const trimmed = text.trim()
  if (trimmed === '') return ''

  const translator = api()
  if (!translator || isSameLanguage(from, to)) {
    throw new Error('Translation is not available here.')
  }

  const instance = await instanceFor(translator, from, to, onProgress)
  return (await instance.translate(trimmed)).trim()
}
