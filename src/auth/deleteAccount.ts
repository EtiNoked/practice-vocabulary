import type { FirebaseServices } from './firebase'
import type { DeleteOutcome } from './types'

/** Firestore's hard limit on writes in one batch. Not a tuning choice. */
const BATCH_LIMIT = 500

async function deleteCollection(
  services: FirebaseServices,
  path: string,
): Promise<void> {
  const { db, fs } = services
  const snapshot = await fs.getDocs(fs.collection(db, path))
  const docs = snapshot.docs

  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = fs.writeBatch(db)
    for (const d of docs.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref)
    await batch.commit()
  }
}

/**
 * Every collection a user owns.
 *
 * A LIST, not four inline calls, because this is the thing that goes wrong: 008 added the
 * `games` collection and did not add it here, so for three commits "delete my account"
 * reported success while leaving every game record in Firestore under a uid that could
 * never authenticate again — unreachable under `isOwner(uid)`, and therefore undeletable
 * by anyone, ever.
 *
 * It failed silently because nothing connects the two files. `test/invariants.test.ts`
 * now does: it reads the collection paths out of `firestoreListStore.ts` and fails the
 * build if one of them is missing from this array. Add a collection there, and this stops
 * compiling clean until it is named here too.
 */
const OWNED_COLLECTIONS = ['lists', 'sessions', 'games', 'tests'] as const

/**
 * Remove everything the user owns, then the user document itself.
 *
 * Deliberately client-side: Cloud Functions require the paid Blaze plan, so
 * there is no server-side path (plan.md R6). Safe to re-run — deleting an
 * already-deleted document is not an error, which is what makes recovery from
 * a partial failure just "press it again".
 *
 * Sequential rather than concurrent, and the user document strictly LAST: the rules only
 * permit `isOwner(uid)`, so removing the account's own document first would strand
 * anything still under it, permanently.
 */
export async function purgeUserData(services: FirebaseServices, uid: string): Promise<void> {
  for (const collection of OWNED_COLLECTIONS) {
    await deleteCollection(services, `users/${uid}/${collection}`)
  }
  await services.fs.deleteDoc(services.fs.doc(services.db, 'users', uid))
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return ''
}

/**
 * Delete the user's data and then their account.
 *
 * ORDER MATTERS AND IS NOT NEGOTIABLE: the security rules only let a user touch
 * documents under their own uid, so deleting the account first would strand
 * every document permanently — nobody would ever be able to delete them again.
 *
 * Google requires a recent login before destroying an account. That is reported
 * as its own outcome so the UI can explain and re-prompt, rather than surfacing
 * it as an opaque failure.
 */
export async function deleteAccount(services: FirebaseServices): Promise<DeleteOutcome> {
  const user = services.auth.currentUser
  if (!user) return { ok: false, reason: 'unknown', message: 'You are not signed in.' }

  try {
    await purgeUserData(services, user.uid)
  } catch (error) {
    return {
      ok: false,
      reason: 'partial',
      message:
        errorCode(error) === 'unavailable'
          ? "Couldn't reach your account. Check your connection and try again."
          : "Some of your data couldn't be deleted. Try again — it will pick up where it left off.",
    }
  }

  try {
    await services.sdk.deleteUser(user)
    return { ok: true }
  } catch (error) {
    if (errorCode(error) === 'auth/requires-recent-login') {
      // The data is already gone; only the account record remains. Re-auth and
      // re-run finishes the job.
      return { ok: false, reason: 'requires-recent-login' }
    }
    return {
      ok: false,
      reason: 'partial',
      message: 'Your data was deleted, but the account itself could not be. Try again.',
    }
  }
}

/**
 * Re-authenticate through the same Google popup, then retry the deletion.
 *
 * Called only after a `requires-recent-login` outcome.
 */
export async function reauthenticateAndDelete(
  services: FirebaseServices,
): Promise<DeleteOutcome> {
  const user = services.auth.currentUser
  if (!user) return { ok: false, reason: 'unknown', message: 'You are not signed in.' }

  try {
    await services.sdk.reauthenticateWithPopup(user, services.provider)
  } catch (error) {
    const code = errorCode(error)
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return { ok: false, reason: 'unknown', message: 'Sign-in cancelled, so nothing was deleted.' }
    }
    return { ok: false, reason: 'unknown', message: "Couldn't confirm it was you. Try again." }
  }

  return deleteAccount(services)
}
