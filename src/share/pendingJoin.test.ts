import { afterEach, describe, expect, it, vi } from 'vitest'
import { capturePendingJoin, clearPendingJoin, readPendingJoin } from './pendingJoin'

function fakes(search: string, pathname = '/', hash = '') {
  const location = { search, pathname, hash } as Location
  const history = { state: null, replaceState: vi.fn() } as unknown as History
  return { location, history }
}

afterEach(() => {
  clearPendingJoin()
})

describe('capturePendingJoin', () => {
  it('parks the code and takes it out of the address bar, keeping everything else', () => {
    const { location, history } = fakes('?join=abc&x=1')
    capturePendingJoin(location, history)
    expect(readPendingJoin()).toBe('abc')
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/?x=1')
  })

  it('leaves no dangling ? when the code was the only parameter', () => {
    const { location, history } = fakes('?join=abc', '/app', '#top')
    capturePendingJoin(location, history)
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/app#top')
  })

  it('does nothing without a join parameter', () => {
    const { location, history } = fakes('?x=1')
    capturePendingJoin(location, history)
    expect(readPendingJoin()).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('keeps the code in sessionStorage, so it survives the sign-in redirect', () => {
    // Not localStorage: an invitation abandoned today should not greet this device next week.
    const { location, history } = fakes('?join=abc')
    capturePendingJoin(location, history)
    expect(sessionStorage.getItem('pvt.join.pending')).toBe('abc')
    expect(localStorage.getItem('pvt.join.pending')).toBeNull()
  })
})

describe('clearPendingJoin', () => {
  it('forgets the code', () => {
    const { location, history } = fakes('?join=abc')
    capturePendingJoin(location, history)
    clearPendingJoin()
    expect(readPendingJoin()).toBeNull()
  })
})
