import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthStore } from './authStore'
import { AUTH_HINT_KEY, type AuthPort, type AuthUser, type SignInOutcome } from './types'

const user: AuthUser = { uid: 'u1', displayName: 'Eti', email: 'e@x.com', photoURL: null }

function fakePort(over: Partial<AuthPort> = {}) {
  const emitters: Array<(u: AuthUser | null) => void> = []
  const port: AuthPort = {
    subscribe: vi.fn((cb: (u: AuthUser | null) => void) => {
      emitters.push(cb)
      return () => {}
    }),
    signIn: vi.fn(async () => ({ ok: true as const, user })),
    signOut: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => ({ ok: true as const })),
    ...over,
  }
  return { port, emit: (u: AuthUser | null) => emitters.forEach((fn) => fn(u)) }
}

beforeEach(() => localStorage.clear())

describe('boot without a device hint', () => {
  it('is guest immediately and never touches the auth port', () => {
    const { port } = fakePort()
    const store = createAuthStore({ port, configured: true })

    expect(store.getSnapshot().status).toBe('guest')
    // Not subscribing is what keeps Firebase off a guest's boot path entirely.
    expect(port.subscribe).not.toHaveBeenCalled()
  })
})

describe('boot with a device hint', () => {
  it('starts resolving, not guest', () => {
    localStorage.setItem(AUTH_HINT_KEY, '1')
    const { port } = fakePort()
    const store = createAuthStore({ port, configured: true })

    // The whole point of R2: a returning user must never be shown the guest UI
    // while their session is still being restored.
    expect(store.getSnapshot().status).toBe('resolving')
    expect(port.subscribe).toHaveBeenCalled()
  })

  it('settles to signed-in when the session restores', () => {
    localStorage.setItem(AUTH_HINT_KEY, '1')
    const { port, emit } = fakePort()
    const store = createAuthStore({ port, configured: true })

    emit(user)
    expect(store.getSnapshot()).toMatchObject({ status: 'signed-in', user })
  })

  it('settles to guest when the session turns out to be gone', () => {
    localStorage.setItem(AUTH_HINT_KEY, '1')
    const { port, emit } = fakePort()
    const store = createAuthStore({ port, configured: true })

    emit(null)
    expect(store.getSnapshot()).toMatchObject({ status: 'guest', user: null })
  })
})

describe('unconfigured Firebase', () => {
  it('is guest with sign-in unavailable, even if a hint is present', () => {
    localStorage.setItem(AUTH_HINT_KEY, '1')
    const { port } = fakePort()
    const store = createAuthStore({ port, configured: false })

    // No project configured (CI, or a fresh clone): the app must still run,
    // signed-out, rather than hanging on a sign-in that can never work.
    expect(store.getSnapshot().status).toBe('guest')
    expect(store.getSnapshot().available).toBe(false)
    expect(port.subscribe).not.toHaveBeenCalled()
  })
})

describe('signIn', () => {
  it('moves to signed-in and starts listening', async () => {
    const { port } = fakePort()
    const store = createAuthStore({ port, configured: true })

    expect(await store.signIn()).toEqual({ ok: true, user })
    expect(store.getSnapshot()).toMatchObject({ status: 'signed-in', user })
    expect(port.subscribe).toHaveBeenCalled()
  })

  it('stays guest when the popup is cancelled', async () => {
    const { port } = fakePort({
      signIn: vi.fn(async (): Promise<SignInOutcome> => ({ ok: false, reason: 'cancelled' })),
    })
    const store = createAuthStore({ port, configured: true })

    expect(await store.signIn()).toEqual({ ok: false, reason: 'cancelled' })
    expect(store.getSnapshot().status).toBe('guest')
  })

  it('is a no-op when Firebase is not configured', async () => {
    const { port } = fakePort()
    const store = createAuthStore({ port, configured: false })
    expect(await store.signIn()).toEqual({ ok: false, reason: 'load-failed' })
    expect(port.signIn).not.toHaveBeenCalled()
  })
})

describe('signOut', () => {
  it('returns to guest', async () => {
    const { port } = fakePort()
    const store = createAuthStore({ port, configured: true })
    await store.signIn()
    await store.signOut()
    expect(store.getSnapshot()).toMatchObject({ status: 'guest', user: null })
  })
})

describe('snapshot identity', () => {
  // A hint is required for these: without one the store never subscribes to the
  // port, so emit() would have nothing to deliver to.
  const restoring = () => createAuthStore({ port: p.port, configured: true, hasHint: true })
  let p: ReturnType<typeof fakePort>
  beforeEach(() => {
    p = fakePort()
  })

  it('returns the same reference until something changes', () => {
    const store = restoring()
    // useSyncExternalStore re-renders forever if getSnapshot returns a fresh
    // object each call.
    const before = store.getSnapshot()
    expect(before).toBe(store.getSnapshot())

    p.emit(user)
    const after = store.getSnapshot()
    expect(after).not.toBe(before)
    expect(after).toBe(store.getSnapshot())
  })

  it('does not notify when an emission changes nothing', () => {
    const store = restoring()
    p.emit(user)
    const listener = vi.fn()
    store.subscribe(listener)
    p.emit(user)
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies subscribers on change', () => {
    const store = restoring()
    const listener = vi.fn()
    store.subscribe(listener)
    p.emit(user)
    expect(listener).toHaveBeenCalled()
  })

  it('stops notifying after unsubscribe', () => {
    const store = restoring()
    const listener = vi.fn()
    store.subscribe(listener)()
    p.emit(user)
    expect(listener).not.toHaveBeenCalled()
  })
})
