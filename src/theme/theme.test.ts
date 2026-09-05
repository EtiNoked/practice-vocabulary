import { beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_KEY, applyTheme, initTheme, readTheme, writeTheme } from './theme'

const root = () => document.documentElement
const themeColorTags = () =>
  [...document.head.querySelectorAll('meta[name="theme-color"]')] as HTMLMetaElement[]

beforeEach(() => {
  localStorage.clear()
  root().removeAttribute('data-theme')
  document.head.innerHTML = ''
  vi.restoreAllMocks()
})

describe('reading', () => {
  it('is null when nothing has been chosen, which is what "follow the system" means', () => {
    // The ABSENCE of the key is the third state. There is deliberately no
    // stored 'system' value to get out of step with it.
    expect(readTheme()).toBeNull()
  })

  it('round-trips light and dark', () => {
    writeTheme('dark')
    expect(readTheme()).toBe('dark')
    writeTheme('light')
    expect(readTheme()).toBe('light')
  })

  it('reads a junk stored value as null rather than half-applying it', () => {
    // A hand-edited or stale key must degrade to "follow the system", not to an
    // attribute value that matches no selector in index.css.
    localStorage.setItem(THEME_KEY, 'midnight')
    expect(readTheme()).toBeNull()
  })
})

describe('clearing', () => {
  it('removes the key rather than storing a falsy value', () => {
    writeTheme('dark')
    writeTheme(null)

    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(readTheme()).toBeNull()
  })
})

describe('storage the browser will not give us', () => {
  // Safari in private browsing throws on access rather than returning null.
  // Losing the app over a colour preference would be absurd; the cost of failure
  // here is following the OS instead of the choice you made.
  it('reads null when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => readTheme()).not.toThrow()
    expect(readTheme()).toBeNull()
  })

  it('swallows a throwing setItem', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => writeTheme('dark')).not.toThrow()
  })

  it('swallows a throwing removeItem', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => writeTheme(null)).not.toThrow()
  })
})

describe('applying', () => {
  it('sets data-theme for an explicit choice', () => {
    applyTheme('dark')
    expect(root().getAttribute('data-theme')).toBe('dark')

    applyTheme('light')
    expect(root().getAttribute('data-theme')).toBe('light')
  })

  it('REMOVES the attribute for null rather than emptying it', () => {
    applyTheme('dark')
    applyTheme(null)

    // `data-theme=""` would still match `[data-theme]`, and an empty value
    // matches neither dark selector — so the page would follow the OS while
    // claiming an override. Absence is the only correct representation.
    expect(root().hasAttribute('data-theme')).toBe(false)
  })

  it('is idempotent, because main.tsx runs under StrictMode', () => {
    applyTheme('dark')
    applyTheme('dark')
    expect(root().getAttribute('data-theme')).toBe('dark')

    applyTheme(null)
    applyTheme(null)
    expect(root().hasAttribute('data-theme')).toBe(false)
  })
})

describe('the address-bar tint', () => {
  it('adds no theme-color tag while following the system', () => {
    // index.html ships two media-scoped tags that already answer this case
    // correctly and with no JavaScript. Adding a third would override them.
    applyTheme(null)
    expect(themeColorTags()).toHaveLength(0)
  })

  it('inserts one media-less tag FIRST for an override', () => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#f6fbfa" media="(prefers-color-scheme: light)">' +
      '<meta name="theme-color" content="#0b1a1d" media="(prefers-color-scheme: dark)">'

    applyTheme('dark')

    const tags = themeColorTags()
    // The browser takes the FIRST theme-color whose media matches, so an
    // override only wins by being ahead of the media-scoped pair.
    expect(tags[0]?.getAttribute('media')).toBeNull()
    expect(tags[0]?.content).toBe('#0b1a1d')
    expect(tags).toHaveLength(3)
  })

  it('reuses its own tag rather than stacking one up per change', () => {
    applyTheme('dark')
    applyTheme('light')
    applyTheme('dark')

    const tags = themeColorTags()
    expect(tags).toHaveLength(1)
    expect(tags[0]?.content).toBe('#0b1a1d')
  })

  it('removes the override tag on the way back to system', () => {
    applyTheme('dark')
    applyTheme(null)
    expect(themeColorTags()).toHaveLength(0)
  })
})

describe('initTheme', () => {
  it('applies what was stored and returns it', () => {
    writeTheme('dark')
    expect(initTheme()).toBe('dark')
    expect(root().getAttribute('data-theme')).toBe('dark')
  })

  it('applies nothing when nothing was stored', () => {
    expect(initTheme()).toBeNull()
    expect(root().hasAttribute('data-theme')).toBe(false)
  })
})
