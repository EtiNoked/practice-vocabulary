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

/** Renders App inside a guest auth context unless a store is supplied. */
export function renderApp(store?: AuthStore) {
  const authStore =
    store ?? createAuthStore({ port: guestPort, configured: false, hasHint: false })
  return render(
    <AuthProvider store={authStore}>
      <App />
    </AuthProvider>,
  )
}
