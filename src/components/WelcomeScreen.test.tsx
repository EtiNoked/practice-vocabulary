import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WelcomeScreen } from './WelcomeScreen'
import { AuthProvider } from '../auth/AuthContext'
import type { AuthSnapshot, AuthStore } from '../auth/authStore'
import type { AuthUser, SignInOutcome } from '../auth/types'

const user: AuthUser = {
  uid: 'u1',
  displayName: 'Eti',
  email: 'eti@example.com',
  photoURL: null,
}

const guest: AuthSnapshot = { status: 'guest', user: null, available: true }

function fakeStore(snapshot: AuthSnapshot, over: Partial<AuthStore> = {}): AuthStore {
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    signIn: vi.fn(async () => ({ ok: true, user }) as SignInOutcome),
    signOut: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => ({ ok: true as const })),
    ...over,
  }
}

function renderWelcome(store: AuthStore, onContinueAsGuest = vi.fn()) {
  const result = render(
    <AuthProvider store={store}>
      <WelcomeScreen onContinueAsGuest={onContinueAsGuest} />
    </AuthProvider>,
  )
  return { ...result, onContinueAsGuest }
}

describe('the front door', () => {
  it('names the app and says what it does', () => {
    renderWelcome(fakeStore(guest))
    expect(screen.getByRole('heading', { name: /vocabulary trainer/i })).toBeInTheDocument()
    expect(screen.getByText(/hear a word, say the answer/i)).toBeInTheDocument()
  })

  it('offers both routes in, as buttons', () => {
    renderWelcome(fakeStore(guest))
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeEnabled()

    // A button, not a link, and the same weight as sign-in: continuing without an
    // account is a first-class choice, not a dismissal of the real one.
    expect(screen.getByRole('button', { name: /continue as guest/i })).toBeEnabled()
  })

  it('explains the privacy trade before the user decides', () => {
    renderWelcome(fakeStore(guest))
    // The paragraph that used to sit above the word lists on every single visit.
    // This is the moment it is actually useful.
    expect(
      screen.getByText(/stays on this device and nothing is sent anywhere/i),
    ).toBeInTheDocument()
  })
})

describe('signing in', () => {
  it('starts a sign-in on click', async () => {
    const store = fakeStore(guest)
    renderWelcome(store)
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(store.signIn).toHaveBeenCalledTimes(1)
  })

  it('reports a blocked popup with something the user can act on', async () => {
    const store = fakeStore(guest, {
      signIn: vi.fn(async () => ({ ok: false, reason: 'blocked' }) as SignInOutcome),
    })
    renderWelcome(store)
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/allow popups/i)
  })

  it('reports a cancelled popup neutrally', async () => {
    const store = fakeStore(guest, {
      signIn: vi.fn(async () => ({ ok: false, reason: 'cancelled' }) as SignInOutcome),
    })
    renderWelcome(store)
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/cancelled/i)
  })

  it('disables the button while a sign-in is in flight', async () => {
    let release: (v: SignInOutcome) => void = () => {}
    const store = fakeStore(guest, {
      signIn: vi.fn(() => new Promise<SignInOutcome>((r) => (release = r))),
    })
    renderWelcome(store)
    const button = screen.getByRole('button', { name: /sign in with google/i })

    await userEvent.click(button)
    expect(button).toBeDisabled()

    release({ ok: true, user })
  })

  it('leaves the guest route open after a failed sign-in', async () => {
    const store = fakeStore(guest, {
      signIn: vi.fn(async () => ({ ok: false, reason: 'blocked' }) as SignInOutcome),
    })
    const { onContinueAsGuest } = renderWelcome(store)
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))

    // Being unable to sign in must never be a dead end: the app works perfectly
    // well without an account, and this screen is the only way through to it.
    const guestButton = screen.getByRole('button', { name: /continue as guest/i })
    expect(guestButton).toBeEnabled()
    await userEvent.click(guestButton)
    expect(onContinueAsGuest).toHaveBeenCalledTimes(1)
  })
})

describe('continuing as a guest', () => {
  it('reports the choice without touching auth', async () => {
    const store = fakeStore(guest)
    const { onContinueAsGuest } = renderWelcome(store)

    await userEvent.click(screen.getByRole('button', { name: /continue as guest/i }))

    expect(onContinueAsGuest).toHaveBeenCalledTimes(1)
    // NFR4a: a guest must not cause the Firebase chunk to load. Not even a
    // no-op call, because signIn is what triggers the dynamic import.
    expect(store.signIn).not.toHaveBeenCalled()
  })
})
