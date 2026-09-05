import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'

/**
 * These tests deliberately use the REAL AuthProvider — no injected store — so
 * they exercise the path a production build takes when no Firebase project is
 * configured. Every other suite injects a fake, which would hide a crash here.
 *
 * The scenario matters: this is exactly what a deploy looks like before the
 * VITE_FIREBASE_* variables are set, and the app must degrade to v1 behaviour
 * rather than white-screening.
 */

const loadFirebase = vi.fn(() => Promise.reject(new Error('should never be called')))
vi.mock('./firebase', () => ({
  loadFirebase: () => loadFirebase(),
  clearFirestoreCache: async () => {},
  resetFirebaseForTests: () => {},
}))

function Probe() {
  const { status, available } = useAuth()
  return <span data-testid="probe">{`${status}:${String(available)}`}</span>
}

describe('with no Firebase configuration (unset VITE_FIREBASE_* vars)', () => {
  it('settles straight to guest, with accounts unavailable', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByTestId('probe')).toHaveTextContent('guest:false')
  })

  it('never attempts to load Firebase', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(loadFirebase).not.toHaveBeenCalled()
  })

  it('renders the whole app, working, with no sign-in offered', () => {
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )

    // v1 behaviour intact...
    expect(screen.getByRole('button', { name: /new list/i })).toBeInTheDocument()
    // ...and no dead sign-in button.
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
  })

  it('does not throw on the missing-config error path', () => {
    // firebaseConfig() throws when keys are absent. Nothing may call it unless
    // firebaseConfigured() said yes first.
    expect(() =>
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      ),
    ).not.toThrow()
  })
})

describe('useAuth outside a provider', () => {
  it('fails loudly rather than silently returning a guest', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/must be used inside an <AuthProvider>/)
    vi.restoreAllMocks()
  })
})
