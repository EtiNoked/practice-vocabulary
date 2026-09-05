import { loadFirebase } from './firebase'
import {
  writeAuthHint,
  type AuthPort,
  type AuthUser,
  type DeleteOutcome,
  type SignInOutcome,
} from './types'

/** Firebase errors carry a string `code`; every branch below keys off it. */
function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return ''
}

/** Keep only the four fields the app uses. The SDK user carries far more. */
function toAuthUser(user: {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}): AuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  }
}

function mapSignInError(error: unknown): SignInOutcome {
  switch (errorCode(error)) {
    // Both mean "the user chose not to finish". Neither is an error condition,
    // and neither should raise a toast.
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return { ok: false, reason: 'cancelled' }
    case 'auth/popup-blocked':
      return { ok: false, reason: 'blocked' }
    case 'auth/network-request-failed':
      return { ok: false, reason: 'network' }
    default:
      return {
        ok: false,
        reason: 'unknown',
        message: error instanceof Error ? error.message : 'Sign-in failed.',
      }
  }
}

export function createFirebaseAuth(): AuthPort {
  let signInFlight = false

  return {
    subscribe(onChange): () => void {
      let live = true
      let detach: (() => void) | null = null

      void loadFirebase()
        .then(({ auth, sdk }) => {
          if (!live) return
          detach = sdk.onAuthStateChanged(auth, (user) => {
            if (!live) return
            writeAuthHint(user !== null)
            onChange(user ? toAuthUser(user) : null)
          })
        })
        .catch(() => {
          // A chunk that will not load must not leave the app stuck resolving.
          // Signed-out with a working local app is the right degraded state.
          if (live) onChange(null)
        })

      return () => {
        live = false
        detach?.()
      }
    },

    async signIn(): Promise<SignInOutcome> {
      // A double tap must not open two popups — the second would immediately
      // cancel the first via auth/cancelled-popup-request anyway.
      if (signInFlight) return { ok: false, reason: 'cancelled' }
      signInFlight = true

      try {
        const services = await loadFirebase().catch(() => null)
        if (!services) return { ok: false, reason: 'load-failed' }

        /**
         * signInWithPopup, NEVER signInWithRedirect.
         *
         * This app is served from Cloudflare Pages, so `authDomain` is a
         * different origin. Redirect sign-in completes through a cross-origin
         * iframe, and Safari 16.1+, Firefox 109+ and Chrome M115+ all block that
         * third-party storage access — producing a sign-in that appears to work
         * and then silently drops the user back to signed out.
         *
         * The tutorials that recommend redirect on mobile assume Firebase
         * Hosting. Do not "improve" this. See plan.md R1.
         */
        const credential = await services.sdk.signInWithPopup(services.auth, services.provider)
        writeAuthHint(true)
        return { ok: true, user: toAuthUser(credential.user) }
      } catch (error) {
        return mapSignInError(error)
      } finally {
        signInFlight = false
      }
    },

    async signOut(): Promise<void> {
      // Clear the hint FIRST and unconditionally. If the SDK call fails on a
      // flaky connection, a device left with a stale hint would boot into
      // "restoring" forever.
      writeAuthHint(false)
      try {
        const { auth, sdk } = await loadFirebase()
        await sdk.signOut(auth)
      } catch {
        /* Already treated as signed out locally. */
      }
    },

    async deleteAccount(): Promise<DeleteOutcome> {
      // Implemented in Phase 8 (Task 24), which needs the Firestore store to
      // clear the user's documents before the account itself can go.
      return { ok: false, reason: 'unknown', message: 'Not implemented yet.' }
    },
  }
}
