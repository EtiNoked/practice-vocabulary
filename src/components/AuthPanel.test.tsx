import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AuthPanel } from './AuthPanel'
import { AuthProvider } from '../auth/AuthContext'
import type { AuthSnapshot, AuthStore } from '../auth/authStore'
import type { AuthUser, SignInOutcome } from '../auth/types'

const user: AuthUser = {
  uid: 'u1',
  displayName: 'Eti',
  email: 'eti@example.com',
  photoURL: null,
}

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

const renderPanel = (store: AuthStore) =>
  render(
    <AuthProvider store={store}>
      <AuthPanel />
    </AuthProvider>,
  )

describe('resolving', () => {
  it('shows a neutral placeholder, never the signed-out UI', () => {
    renderPanel(fakeStore({ status: 'resolving', user: null, available: true }))

    // R2: showing "Sign in" to someone whose session is still restoring reads as
    // having been silently logged out.
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/checking/i)
  })
})

describe('guest', () => {
  it('offers sign-in with the privacy note', () => {
    renderPanel(fakeStore({ status: 'guest', user: null, available: true }))
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeEnabled()
    expect(screen.getByText(/stays on this device and nothing is sent anywhere/i)).toBeInTheDocument()
  })

  it('signs in on click', async () => {
    const store = fakeStore({ status: 'guest', user: null, available: true })
    renderPanel(store)
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(store.signIn).toHaveBeenCalledTimes(1)
  })

  it('reports a blocked popup with something the user can act on', async () => {
    const store = fakeStore({ status: 'guest', user: null, available: true }, {
      signIn: vi.fn(async () => ({ ok: false, reason: 'blocked' }) as SignInOutcome),
    })
    renderPanel(store)
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/allow popups/i)
  })

  it('reports a cancelled popup neutrally', async () => {
    const store = fakeStore({ status: 'guest', user: null, available: true }, {
      signIn: vi.fn(async () => ({ ok: false, reason: 'cancelled' }) as SignInOutcome),
    })
    renderPanel(store)
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/cancelled/i)
  })

  it('disables the button while a sign-in is in flight', async () => {
    let release: (v: SignInOutcome) => void = () => {}
    const store = fakeStore({ status: 'guest', user: null, available: true }, {
      signIn: vi.fn(() => new Promise<SignInOutcome>((r) => (release = r))),
    })
    renderPanel(store)
    const button = screen.getByRole('button', { name: /sign in with google/i })

    await userEvent.click(button)
    expect(button).toBeDisabled()

    release({ ok: true, user })
  })
})

describe('signed in', () => {
  it('shows who is signed in and offers sign out', async () => {
    const store = fakeStore({ status: 'signed-in', user, available: true })
    renderPanel(store)

    expect(screen.getByText('Eti')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(store.signOut).toHaveBeenCalledTimes(1)
  })

  it('falls back to the email when Google gives no display name', () => {
    renderPanel(
      fakeStore({ status: 'signed-in', user: { ...user, displayName: null }, available: true }),
    )
    expect(screen.getByText('eti@example.com')).toBeInTheDocument()
  })
})

describe('unconfigured', () => {
  it('renders nothing at all', () => {
    const { container } = renderPanel({
      ...fakeStore({ status: 'guest', user: null, available: false }),
    })
    // A sign-in button that cannot possibly work is worse than no button.
    expect(container).toBeEmptyDOMElement()
  })
})
