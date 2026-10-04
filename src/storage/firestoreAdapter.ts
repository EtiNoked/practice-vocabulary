import { errorCode } from '../auth/firebaseError'
import type { StoreError, Unsubscribe, WriteResult } from './types'

/**
 * Plumbing shared by the two Firestore-backed stores — `firestoreListStore` and
 * `firestoreShareStore`.
 *
 * Both had their own copy of every function here, which is how they came to disagree:
 * one carried the comment explaining why a leaked listener matters and the other did
 * not, and either could have gained a new error code without the other. Nothing in here
 * is specific to lists or to sharing; it is the adapter layer both sit on.
 */

/** A failed write, as the reason the app's toast layer already knows how to phrase. */
export function toWriteResult(error: unknown): WriteResult {
  switch (errorCode(error)) {
    case 'permission-denied':
      return { ok: false, reason: 'permission' }
    case 'unavailable':
      return { ok: false, reason: 'offline' }
    case 'not-found':
      return { ok: false, reason: 'missing' }
    default:
      return { ok: false, reason: 'network' }
  }
}

/**
 * A degraded-but-live subscription, as something a banner can say.
 *
 * Distinct from `toWriteResult` because the stakes differ: a failed write lost the
 * user's change, while a failing subscription is still showing them the last data it
 * had. The copy says so.
 */
export function toStoreError(error: unknown): StoreError {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  switch (errorCode(error)) {
    case 'permission-denied':
      return { kind: 'permission', message: "Your account wouldn't allow that. Try signing in again." }
    case 'unavailable':
      return { kind: 'offline', message: "You're offline. Showing your last synced lists." }
    default:
      return { kind: 'unknown', message }
  }
}

/** Run a write and report it as a WriteResult. NEVER throws — that is the whole point. */
export async function write(fn: () => Promise<void>): Promise<WriteResult> {
  try {
    await fn()
    return { ok: true }
  } catch (error) {
    return toWriteResult(error)
  }
}

/**
 * Tracks every live listener so `dispose()` can detach all of them.
 *
 * A leaked `onSnapshot` keeps firing after sign-out and would write one user's data into
 * the next user's view. Each store keeps its own tracker — the state is per-store — but
 * there is one implementation of the bookkeeping.
 */
export function createTracker(): {
  /** Register a detacher and get back one that also un-registers it. */
  track: (detach: Unsubscribe) => Unsubscribe
  /** Detach everything registered so far. */
  detachAll: () => void
} {
  let detachers: Unsubscribe[] = []

  return {
    track(detach) {
      detachers.push(detach)
      return () => {
        detach()
        detachers = detachers.filter((d) => d !== detach)
      }
    },
    detachAll() {
      detachers.forEach((d) => d())
      detachers = []
    },
  }
}
