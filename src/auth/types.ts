export interface AuthUser {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}

/**
 * `resolving` is a real, distinct state — NOT `user === null`.
 *
 * Firebase's onAuthStateChanged fires with null BEFORE it restores a persisted
 * session. Treating that first null as "signed out" shows a returning user the
 * guest home screen with none of their lists, which is indistinguishable from
 * losing their data (plan.md R2).
 */
export type AuthStatus = 'resolving' | 'guest' | 'signed-in'

export type SignInOutcome =
  | { ok: true; user: AuthUser }
  /** The user closed the popup or dismissed consent. A normal outcome, not an error. */
  | { ok: false; reason: 'cancelled' }
  /** The browser blocked the popup. Actionable by the user. */
  | { ok: false; reason: 'blocked' }
  /** The lazy Firebase chunk could not be fetched. The local app still works. */
  | { ok: false; reason: 'load-failed' }
  | { ok: false; reason: 'network' }
  | { ok: false; reason: 'unknown'; message: string }

export type DeleteOutcome =
  | { ok: true }
  /** Google requires a fresh login before destroying an account. */
  | { ok: false; reason: 'requires-recent-login' }
  | { ok: false; reason: 'partial'; message: string }
  | { ok: false; reason: 'unknown'; message: string }

export interface AuthPort {
  /** Emits on every settled auth change. Emits the current value on subscribe. */
  subscribe(onChange: (user: AuthUser | null) => void): () => void
  signIn(): Promise<SignInOutcome>
  signOut(): Promise<void>
  deleteAccount(): Promise<DeleteOutcome>
}

/**
 * Set on this device after a successful sign-in, cleared on sign-out.
 *
 * It exists so a guest can be identified WITHOUT loading Firebase: no hint means
 * go straight to `guest` and download nothing (NFR4a). It is a cache of "this
 * device has signed in before", not an auth claim — forging it buys an attacker
 * a wasted network request.
 */
export const AUTH_HINT_KEY = 'pvt.auth.hint'

export function readAuthHint(): boolean {
  try {
    return localStorage.getItem(AUTH_HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function writeAuthHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(AUTH_HINT_KEY, '1')
    else localStorage.removeItem(AUTH_HINT_KEY)
  } catch {
    /* A device that cannot store the hint just pays one extra check on boot. */
  }
}
