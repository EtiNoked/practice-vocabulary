import { afterEach, describe, expect, it, vi } from 'vitest'
import { availabilityFor, translate } from './translator'

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

/**
 * A stand-in for the browser global.
 *
 * Each call installs a FRESH object, which is also what drops the module's
 * instance cache between tests — the cache belongs to whichever Translator
 * produced it.
 */
function installTranslator(options: {
  availability?: Availability
  translate?: (text: string) => Promise<string>
  create?: () => Promise<unknown>
  progress?: number[]
} = {}) {
  const create = vi.fn(async (opts: { monitor?: (m: unknown) => void }) => {
    opts.monitor?.({
      addEventListener: (_type: string, listener: (e: { loaded: number }) => void) => {
        for (const loaded of options.progress ?? []) listener({ loaded })
      },
    })
    return {
      translate: options.translate ?? ((text: string) => Promise.resolve(`[${text}]`)),
    }
  })
  const api = {
    availability: vi.fn(async () => options.availability ?? 'available'),
    create: options.create ?? create,
  }
  Object.assign(globalThis, { Translator: api })
  return api
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'Translator')
})

describe('browsers without the API', () => {
  it('reports every pair unavailable', async () => {
    await expect(availabilityFor('nl', 'en')).resolves.toBe('unavailable')
  })

  it('rejects a translation instead of hanging', async () => {
    await expect(translate('dochter', 'nl', 'en')).rejects.toThrow()
  })

  // A global of the wrong shape is no more use than no global at all.
  it('ignores a Translator that does not answer availability', async () => {
    Object.assign(globalThis, { Translator: {} })
    await expect(availabilityFor('nl', 'en')).resolves.toBe('unavailable')
  })
})

describe('availability', () => {
  it('passes the pair through to the browser', async () => {
    const api = installTranslator({ availability: 'downloadable' })
    await expect(availabilityFor('nl', 'en')).resolves.toBe('downloadable')
    expect(api.availability).toHaveBeenCalledWith({ sourceLanguage: 'nl', targetLanguage: 'en' })
  })

  /*
   * A list may explain its words in their own language — `de tweeling` against
   * `twee kinderen van dezelfde geboorte`. There is nothing to translate there, and
   * the browser is not asked.
   */
  it('refuses a pair of the same language without asking the browser', async () => {
    const api = installTranslator()
    await expect(availabilityFor('nl', 'nl')).resolves.toBe('unavailable')
    expect(api.availability).not.toHaveBeenCalled()
  })

  it('treats a browser that throws as unavailable', async () => {
    Object.assign(globalThis, {
      Translator: {
        availability: () => Promise.reject(new Error('nope')),
        create: () => Promise.reject(new Error('nope')),
      },
    })
    await expect(availabilityFor('nl', 'en')).resolves.toBe('unavailable')
  })
})

describe('translating', () => {
  it('returns what the browser produced', async () => {
    installTranslator({ translate: async () => 'daughter' })
    await expect(translate('dochter', 'nl', 'en')).resolves.toBe('daughter')
  })

  it('trims both what it is given and what it gets back', async () => {
    const seen: string[] = []
    installTranslator({
      translate: async (text) => {
        seen.push(text)
        return '  daughter \n'
      },
    })
    await expect(translate('  dochter  ', 'nl', 'en')).resolves.toBe('daughter')
    expect(seen).toEqual(['dochter'])
  })

  it('answers an empty cell with an empty string, without calling the browser', async () => {
    const api = installTranslator()
    await expect(translate('   ', 'nl', 'en')).resolves.toBe('')
    expect(api.create).not.toHaveBeenCalled()
  })

  it('reports download progress as a fraction', async () => {
    installTranslator({ progress: [0.25, 1] })
    const seen: number[] = []
    await translate('dochter', 'nl', 'en', (loaded) => seen.push(loaded))
    expect(seen).toEqual([0.25, 1])
  })

  /*
   * Creating a translator can mean downloading tens of megabytes. Doing that per
   * word would be unusable, so one instance per direction serves the whole visit.
   */
  it('creates one translator per direction and reuses it', async () => {
    const api = installTranslator()
    await translate('dochter', 'nl', 'en')
    await translate('zoon', 'nl', 'en')
    expect(api.create).toHaveBeenCalledTimes(1)
  })

  it('creates a second translator for the opposite direction', async () => {
    const api = installTranslator()
    await translate('dochter', 'nl', 'en')
    await translate('daughter', 'en', 'nl')
    expect(api.create).toHaveBeenCalledTimes(2)
  })

  // The usual cause is a download that did not finish, and the next click is
  // exactly when it should be tried again.
  it('does not remember a failed creation, so a retry can succeed', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('download interrupted'))
      .mockResolvedValueOnce({ translate: async () => 'daughter' })
    Object.assign(globalThis, {
      Translator: { availability: async () => 'available', create },
    })

    await expect(translate('dochter', 'nl', 'en')).rejects.toThrow()
    await expect(translate('dochter', 'nl', 'en')).resolves.toBe('daughter')
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('refuses to translate a language into itself', async () => {
    const api = installTranslator()
    await expect(translate('de tweeling', 'nl', 'nl')).rejects.toThrow()
    expect(api.create).not.toHaveBeenCalled()
  })
})
