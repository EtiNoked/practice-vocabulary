import type { FirebaseServices } from '../auth/firebase'
import type { WordList } from '../state/types'
import { LISTS, markLegacyMoved, soleOwner, toListDoc } from './firestoreListStore'

export interface MoveResult {
  moved: number
  /** Already in `lists` from an earlier, interrupted run; only the legacy copy was removed. */
  tidied: number
  /** Refused by the rules. Left where they were, still readable, never deleted. */
  refused: string[]
}

/**
 * Move a user's cloud lists from `users/{uid}/lists` to the top-level `lists` (016 D-14).
 *
 * Runs in the background after sign-in and never blocks a render: until it finishes, the
 * list store reads both locations, so nothing disappears in the meantime.
 *
 * COPY THEN DELETE, in one batch per list, so a list is never in neither place. The id is
 * kept, so saved tests and every history record still point at it.
 *
 * Idempotent and interruptible. A list already in `lists` (an earlier run got halfway, or
 * the user saved it since) only has its legacy copy removed. Re-running finds fewer legacy
 * documents each time and ends with none, at which point this device stops watching the
 * legacy location.
 *
 * A refused copy (an id already in `lists` that belongs to someone else, which needs a
 * uuid collision) leaves that list exactly where it was.
 */
export async function moveLegacyLists(services: FirebaseServices, uid: string): Promise<MoveResult> {
  const { db, fs } = services
  const result: MoveResult = { moved: 0, tidied: 0, refused: [] }

  const legacy = await fs.getDocs(fs.collection(db, `users/${uid}/lists`))
  if (legacy.empty) {
    markLegacyMoved(uid)
    return result
  }

  const mine = await fs.getDocs(
    fs.query(fs.collection(db, LISTS), fs.where('memberUids', 'array-contains', uid)),
  )
  const already = new Set(mine.docs.map((d) => d.id))

  for (const old of legacy.docs) {
    const batch = fs.writeBatch(db)
    if (already.has(old.id)) {
      batch.delete(old.ref)
    } else {
      const list = { ...old.data(), id: old.id } as WordList
      batch.set(fs.doc(db, LISTS, old.id), toListDoc(list, soleOwner(services, uid, list.createdAt ?? Date.now())))
      batch.delete(old.ref)
    }
    try {
      await batch.commit()
      if (already.has(old.id)) result.tidied++
      else result.moved++
    } catch {
      result.refused.push(old.id)
    }
  }

  if (result.refused.length === 0) markLegacyMoved(uid)
  return result
}
