import {
  readAuthHint,
  type AuthPort,
  type AuthStatus,
  type AuthUser,
  type DeleteOutcome,
  type SignInOutcome,
} from './types'

export interface AuthSnapshot {
  status: AuthStatus
  user: AuthUser | null
  /** False when no Firebase project is configured — sign-in must not be offered. */
  available: boolean
}

export interface AuthStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): AuthSnapshot
  signIn(): Promise<SignInOutcome>
  signOut(): Promise<void>
  deleteAccount(): Promise<DeleteOutcome>
}

interface Options {
  port: AuthPort
  configured: boolean
  /** Injectable for tests; production reads the device hint. */
  hasHint?: boolean
}

/**
 * Auth as an external store, consumed through useSyncExternalStore.
 *
 * The auth object genuinely lives outside React and mutates on its own schedule,
 * which is precisely what that hook is for; a useState + useEffect pairing can
 * tear under React 19 concurrent rendering.
 *
 * The important behaviour is the BOOT PATH:
 *
 *   no device hint  → 'guest' synchronously, and the port is never subscribed,
 *                     so a guest never loads the Firebase chunk (NFR4a).
 *   device hint     → 'resolving' until the first settled emission. Rendering
 *                     the guest UI in the meantime shows a returning user an
 *                     empty home screen, which reads as data loss (R2).
 */
export function createAuthStore({ port, configured, hasHint }: Options): AuthStore {
  const shouldRestore = configured && (hasHint ?? readAuthHint())

  let snapshot: AuthSnapshot = {
    status: shouldRestore ? 'resolving' : 'guest',
    user: null,
    available: configured,
  }

  let listeners: Array<() => void> = []
  let detach: (() => void) | null = null

  function set(next: Partial<AuthSnapshot>): void {
    // A fresh object only when something actually changed — getSnapshot must be
    // referentially stable or useSyncExternalStore re-renders in a loop.
    const merged = { ...snapshot, ...next }
    if (
      merged.status === snapshot.status &&
      merged.user === snapshot.user &&
      merged.available === snapshot.available
    ) {
      return
    }
    snapshot = merged
    listeners.forEach((fn) => fn())
  }

  /** Idempotent: attaching twice would double every emission. */
  function attach(): void {
    if (detach || !configured) return
    detach = port.subscribe((user) => {
      set(user ? { status: 'signed-in', user } : { status: 'guest', user: null })
    })
  }

  if (shouldRestore) attach()

  return {
    subscribe(listener) {
      listeners.push(listener)
      return () => {
        listeners = listeners.filter((fn) => fn !== listener)
      }
    },

    getSnapshot: () => snapshot,

    async signIn(): Promise<SignInOutcome> {
      if (!configured) return { ok: false, reason: 'load-failed' }
      const outcome = await port.signIn()
      if (outcome.ok) {
        attach()
        set({ status: 'signed-in', user: outcome.user })
      }
      return outcome
    },

    async signOut(): Promise<void> {
      await port.signOut()
      set({ status: 'guest', user: null })
    },

    async deleteAccount(): Promise<DeleteOutcome> {
      const outcome = await port.deleteAccount()
      if (outcome.ok) set({ status: 'guest', user: null })
      return outcome
    },
  }
}
