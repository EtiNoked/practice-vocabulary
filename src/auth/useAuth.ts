import { createContext, useContext, useSyncExternalStore } from 'react'
import type { AuthSnapshot, AuthStore } from './authStore'

/**
 * Split from AuthContext.tsx so that file exports only a component — otherwise
 * Vite's fast refresh gives up on it and every auth edit forces a full reload.
 */
export const AuthStoreContext = createContext<AuthStore | null>(null)

export interface AuthContextValue extends AuthSnapshot {
  signIn: AuthStore['signIn']
  signOut: AuthStore['signOut']
  deleteAccount: AuthStore['deleteAccount']
}

export function useAuth(): AuthContextValue {
  const store = useContext(AuthStoreContext)
  if (!store) throw new Error('useAuth must be used inside an <AuthProvider>')

  // useSyncExternalStore, not useState + useEffect: the auth object is a genuine
  // external mutable store, and the hook pairing can tear under React 19
  // concurrent rendering.
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  return {
    ...snapshot,
    signIn: store.signIn,
    signOut: store.signOut,
    deleteAccount: store.deleteAccount,
  }
}
