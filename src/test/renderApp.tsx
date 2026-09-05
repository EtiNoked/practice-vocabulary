import { render } from '@testing-library/react'
import App from '../App'
import { AuthProvider } from '../auth/AuthContext'
import { createAuthStore } from '../auth/authStore'
import type { AuthStore } from '../auth/authStore'
import type { AuthPort, AuthUser } from '../auth/types'

/**
 * A port that can never sign anyone in.
 *
 * The default for App tests, so the guest path is exercised exactly as a real
 * signed-out user would meet it — and so no test can accidentally depend on
 * Firebase being reachable.
 */
export const guestPort: AuthPort = {
  subscribe: () => () => {},
  signIn: async () => ({ ok: false, reason: 'load-failed' }),
  signOut: async () => {},
  deleteAccount: async () => ({ ok: true }),
}

export function signedInPort(user: AuthUser): AuthPort {
  return {
    subscribe: (cb) => {
      cb(user)
      return () => {}
    },
    signIn: async () => ({ ok: true, user }),
    signOut: async () => {},
    deleteAccount: async () => ({ ok: true }),
  }
}

/**
 * Renders App inside a guest auth context unless a store is supplied.
 *
 * The default is `configured: false` — NO Firebase project — which is what the
 * overwhelming majority of these tests want: the app as a local-only tool, with
 * no welcome gate and no account control in the way. Do not change that default.
 * Tests that need the account surface reach for the two builders below.
 */
export function renderApp(store?: AuthStore) {
  const authStore =
    store ?? createAuthStore({ port: guestPort, configured: false, hasHint: false })
  return render(
    <AuthProvider store={authStore}>
      <App />
    </AuthProvider>,
  )
}

/**
 * Firebase IS configured and nobody is signed in — the state that raises the
 * welcome gate.
 *
 * `hasHint: false` matters: with a hint the store starts at `resolving` rather
 * than `guest` (authStore.ts:48), which is a different scenario entirely.
 */
export function configuredGuestStore(port: AuthPort = guestPort): AuthStore {
  return createAuthStore({ port, configured: true, hasHint: false })
}

/**
 * Firebase IS configured and someone is signed in.
 *
 * `hasHint: true` is required, not cosmetic: without it the store never
 * subscribes to the port (authStore.ts:82) and stays at `guest`, so a test would
 * assert against a signed-out app and pass for entirely the wrong reason.
 */
export function signedInStore(user: AuthUser, over: Partial<AuthPort> = {}): AuthStore {
  return createAuthStore({
    port: { ...signedInPort(user), ...over },
    configured: true,
    hasHint: true,
  })
}

/**
 * Configured, but the port has not emitted yet — the `resolving` window.
 *
 * A real concern rather than a contrived one: Firebase's onAuthStateChanged fires
 * null BEFORE restoring a persisted session, and showing the welcome screen in
 * that window asks a returning user to log in again.
 */
export function resolvingStore(): AuthStore {
  return createAuthStore({
    port: { ...guestPort, subscribe: () => () => {} },
    configured: true,
    hasHint: true,
  })
}
