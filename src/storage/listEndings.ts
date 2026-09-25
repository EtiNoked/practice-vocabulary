import type { FirebaseServices } from '../auth/firebase'
import type { WordList } from '../state/types'
import { stripUndefined } from './stripUndefined'

export const SHARE_LINKS = 'shareLinks'
export const FAREWELLS = 'listFarewells'

export type FarewellReason = 'removed' | 'stopped' | 'deleted'

/** The farewell id is deterministic, so writing it twice cannot make two offers. */
export const farewellId = (listId: string, uid: string) => `${listId}_${uid}`

/** A list as a member last saw it, minus who it was shared with. */
export function snapshotOf(list: WordList): WordList {
  const { sharing: _sharing, ...content } = list
  return content
}

export function farewellDoc(
  list: WordList,
  uid: string,
  reason: FarewellReason,
  byName: string | null,
  at: number,
): Record<string, unknown> {
  return stripUndefined({ uid, listId: list.id, reason, byName, at, list: snapshotOf(list) })
}

/**
 * The owner ends a list for everyone else: deletes it, or (`keepForOwner`) stops sharing it.
 *
 * ONE batch, so nobody is ever left in a list that no longer exists or holding a link that
 * still works. Each other member gets a farewell with the list as they last saw it, written
 * while they are still a member, which is what the listFarewells rule checks (016 D-11).
 *
 * At most 19 farewells, 10 links and one list write, far under the 500-write batch limit.
 */
export async function endListForEveryone(
  services: FirebaseServices,
  uid: string,
  listId: string,
  list: WordList | null,
  keepForOwner = false,
): Promise<void> {
  const { db, fs } = services
  const batch = fs.writeBatch(db)
  const now = Date.now()
  const byName = list?.sharing?.members[uid]?.displayName ?? services.auth?.currentUser?.displayName ?? null

  const others = list?.sharing?.memberUids.filter((m) => m !== uid) ?? []
  for (const other of others) {
    batch.set(
      fs.doc(db, FAREWELLS, farewellId(listId, other)),
      farewellDoc(list!, other, keepForOwner ? 'stopped' : 'deleted', byName, now),
    )
  }

  // Only a list that was ever shared can have links; a private list skips the query.
  if (others.length > 0 || keepForOwner) {
    const links = await fs.getDocs(
      fs.query(
        fs.collection(db, SHARE_LINKS),
        fs.where('createdByUid', '==', uid),
        fs.where('listId', '==', listId),
      ),
    )
    for (const link of links.docs) batch.delete(link.ref)
  }

  const ref = fs.doc(db, 'lists', listId)
  if (keepForOwner && list?.sharing) {
    const me = list.sharing.members[uid]
    batch.update(ref, { memberUids: [uid], members: me ? { [uid]: me } : {} })
  } else {
    batch.delete(ref)
  }
  await batch.commit()
}

/**
 * Account deletion's first step (016 D-13): let go of every list, without deleting a list
 * from under the people still using it.
 *
 *   a list I am only a member of   → leave it
 *   a list I own, with others in   → hand it to the longest-standing editor (else the
 *                                    longest-standing member), and leave
 *   a list I own, alone            → delete it; for someone who never shared anything this
 *                                    is every list, which is exactly what deletion did before
 *
 * Then every link I made and every farewell addressed to me. All of it has to happen while
 * the account still exists: the rules only ever let *me* do these things, so a list left
 * behind after the account is gone could never be reached or removed by anyone.
 *
 * Safe to re-run, like the rest of `purgeUserData`: each pass finds less to do.
 */
export async function releaseAllLists(services: FirebaseServices, uid: string): Promise<void> {
  const { db, fs } = services

  const mine = await fs.getDocs(
    fs.query(fs.collection(db, 'lists'), fs.where('memberUids', 'array-contains', uid)),
  )
  for (const d of mine.docs) {
    const data = d.data() as {
      ownerUid: string
      memberUids: string[]
      members: Record<string, { role: string; joinedAt: number }>
    }
    const others = data.memberUids.filter((m) => m !== uid)
    const remaining = Object.fromEntries(Object.entries(data.members).filter(([m]) => m !== uid))

    if (data.ownerUid !== uid) {
      await fs.updateDoc(d.ref, { memberUids: others, members: remaining })
    } else if (others.length === 0) {
      await fs.deleteDoc(d.ref)
    } else {
      const byTenure = [...others].sort(
        (a, b) => (data.members[a]?.joinedAt ?? 0) - (data.members[b]?.joinedAt ?? 0),
      )
      const heir = byTenure.find((m) => data.members[m]?.role === 'editor') ?? byTenure[0]!
      await fs.updateDoc(d.ref, {
        ownerUid: heir,
        memberUids: others,
        members: { ...remaining, [heir]: { ...remaining[heir], role: 'owner' } },
      })
    }
  }

  for (const [collection, field] of [
    [SHARE_LINKS, 'createdByUid'],
    [FAREWELLS, 'uid'],
  ] as const) {
    const docs = await fs.getDocs(fs.query(fs.collection(db, collection), fs.where(field, '==', uid)))
    for (const d of docs.docs) await fs.deleteDoc(d.ref)
  }
}
