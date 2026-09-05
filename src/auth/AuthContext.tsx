import { useMemo, type ReactNode } from 'react'
import { firebaseConfigured } from './config'
import { createFirebaseAuth } from './firebaseAuth'
import { createAuthStore, type AuthStore } from './authStore'
import { AuthStoreContext } from './useAuth'

interface Props {
  children: ReactNode
  /** Injected by tests. Production builds the real Firebase-backed store. */
  store?: AuthStore
}

export function AuthProvider({ children, store }: Props) {
  const value = useMemo(
    () =>
      store ??
      createAuthStore({
        port: createFirebaseAuth(),
        configured: firebaseConfigured(),
      }),
    [store],
  )
  return <AuthStoreContext.Provider value={value}>{children}</AuthStoreContext.Provider>
}
