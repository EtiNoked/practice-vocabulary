import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GUEST_CHOICE_KEY, readGuestChoice, writeGuestChoice } from './guestChoice'

beforeEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('reading', () => {
  it('is false when nothing has been chosen', () => {
    expect(readGuestChoice()).toBe(false)
  })

  it('is true after the choice is written', () => {
    writeGuestChoice(true)
    expect(readGuestChoice()).toBe(true)
  })
})

describe('clearing', () => {
  it('removes the key rather than storing a falsy value', () => {
    writeGuestChoice(true)
    writeGuestChoice(false)

    // A stored '0' would be indistinguishable from '1' to any code that checks
    // for mere presence, and this key's whole job is to be checked cheaply.
    expect(sessionStorage.getItem(GUEST_CHOICE_KEY)).toBeNull()
    expect(readGuestChoice()).toBe(false)
  })
})

describe('storage the browser will not give us', () => {
  // Safari in private browsing throws on access rather than returning null.
  // Losing the app over a UI preference would be absurd; the cost of failure
  // here is meeting the welcome screen once per load instead of once per session.
  it('reads false when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => readGuestChoice()).not.toThrow()
    expect(readGuestChoice()).toBe(false)
  })

  it('swallows a throwing setItem', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => writeGuestChoice(true)).not.toThrow()
  })

  it('swallows a throwing removeItem', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => writeGuestChoice(false)).not.toThrow()
  })
})

describe('scope', () => {
  it('lives in sessionStorage, not localStorage', () => {
    writeGuestChoice(true)

    // The distinction IS the feature: a reload inside the tab should not re-ask,
    // but a fresh visit is a fresh decision.
    expect(sessionStorage.getItem(GUEST_CHOICE_KEY)).toBe('1')
    expect(localStorage.getItem(GUEST_CHOICE_KEY)).toBeNull()
  })
})
