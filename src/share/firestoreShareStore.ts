import type { FirebaseServices } from '../auth/firebase'
import type { ListMember, WordList } from '../state/types'
import { LISTS, selfMember, soleOwner, toListDoc, toStoreError } from '../storage/firestoreListStore'
import { endListForEveryone, FAREWELLS, farewellDoc, farewellId, SHARE_LINKS, snapshotOf } from '../storage/listEndings'
import type { Unsubscribe, WriteResult } from '../storage/types'
import { linkStatus, newLinkCode } from './links'
import type { Farewell, JoinOutcome, ShareLink, ShareStore } from './types'

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return ''
}

function toWriteResult(error: unknown): WriteResult {
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

async function write(fn: () => Promise<void>): Promise<WriteResult> {
  try {
    await fn()
    return { ok: true }
  } catch (error) {
    return toWriteResult(error)
  }
}

/** A Firestore Timestamp, a pending server timestamp (null), or already a number. */
function millis(value: unknown): number {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return Date.now()
}

export function toShareLink(code: string, data: Record<string, unknown>): ShareLink {
  return { ...(data as unknown as ShareLink), code, createdAt: millis(data.createdAt) }
}

/**
 * Read one link by its code. Works signed OUT: the rules open `get` to anyone holding the
 * code, which is what lets the join screen show who is inviting you before you sign in.
 */
export async function readLink(services: FirebaseServices, code: string): Promise<ShareLink | null> {
  const snap = await services.fs.getDoc(services.fs.doc(services.db, SHARE_LINKS, code))
  if (!snap.exists()) return null
  return toShareLink(snap.id, snap.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>)
}

export function createFirestoreShareStore(services: FirebaseServices, uid: string): ShareStore {
  const { db, fs } = services
  let detachers: Unsubscribe[] = []
  let disposed = false

  function track(detach: Unsubscribe): Unsubscribe {
    detachers.push(detach)
    return () => {
      detach()
      detachers = detachers.filter((d) => d !== detach)
    }
  }

  const listRef = (id: string) => fs.doc(db, LISTS, id)
  const myName = () => services.auth?.currentUser?.displayName ?? null

  function withoutMember(list: WordList, who: string) {
    const sharing = list.sharing!
    const { [who]: _gone, ...members } = sharing.members
    return { memberUids: sharing.memberUids.filter((m) => m !== who), members }
  }

  /**
   * A kept copy (D-11): a NEW list, because the original may still exist. It remembers the
   * ids it came from so its history follows it (`canonicalRecords`), and this user's saved
   * tests are pointed at it in the same batch, so a test does not quietly lose a list.
   */
  async function copyInto(batch: ReturnType<typeof fs.writeBatch>, source: WordList): Promise<void> {
    const now = Date.now()
    const copy: WordList = {
      ...snapshotOf(source),
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      previousIds: [source.id, ...(source.previousIds ?? [])],
    }
    batch.set(listRef(copy.id), toListDoc(copy, soleOwner(services, uid, now)))

    const tests = await fs.getDocs(
      fs.query(fs.collection(db, `users/${uid}/tests`), fs.where('spec.listIds', 'array-contains', source.id)),
    )
    for (const t of tests.docs) {
      const ids = ((t.data() as { spec: { listIds: string[] } }).spec.listIds ?? []).map((id) =>
        id === source.id ? copy.id : id,
      )
      batch.update(t.ref, { 'spec.listIds': ids })
    }
  }

  return {
    async createLink(list, options) {
      const code = newLinkCode()
      const me = list.sharing?.members[uid]
      const preview = {
        listName: list.name,
        ownerName: me?.displayName ?? myName(),
        wordCount: list.pairs.length,
        col1Lang: list.col1Lang,
        col2Lang: list.col2Lang,
      }
      // Built by hand, NOT through stripUndefined: that would flatten the serverTimestamp()
      // sentinel into a plain object, and the rules require `createdAt == request.time`.
      const data = {
        listId: list.id,
        role: options.role,
        label: options.label?.trim() ? options.label.trim() : null,
        maxUses: options.maxUses,
        uses: 0,
        declined: false,
        createdByUid: uid,
        createdAt: fs.serverTimestamp(),
        preview,
      }
      try {
        await fs.setDoc(fs.doc(db, SHARE_LINKS, code), data)
        return { ok: true, link: { ...data, code, createdAt: Date.now() } }
      } catch (error) {
        const result = toWriteResult(error)
        return result.ok ? { ok: false, reason: 'network' } : result
      }
    },

    subscribeLinks(listId, onChange, onError) {
      if (disposed) return () => {}
      const q = fs.query(
        fs.collection(db, SHARE_LINKS),
        fs.where('createdByUid', '==', uid),
        fs.where('listId', '==', listId),
      )
      return track(
        fs.onSnapshot(
          q,
          (snap) =>
            onChange(
              snap.docs
                .map((d) => toShareLink(d.id, d.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>))
                .sort((a, b) => b.createdAt - a.createdAt),
            ),
          (error) => onError(toStoreError(error)),
        ),
      )
    },

    cancelLink: (code) => write(() => fs.deleteDoc(fs.doc(db, SHARE_LINKS, code))),

    async join(code): Promise<JoinOutcome> {
      let link: ShareLink | null
      try {
        link = await readLink(services, code)
      } catch (error) {
        return { ok: false, reason: errorCode(error) === 'unavailable' ? 'offline' : 'network' }
      }
      if (!link) return { ok: false, reason: 'unavailable' }
      if (link.createdByUid === uid) return { ok: false, reason: 'own' }

      // Already in? Only a member can read the list, so a successful read answers it.
      try {
        const existing = await fs.getDoc(listRef(link.listId))
        if (existing.exists()) return { ok: true, listId: link.listId, already: true }
        return { ok: false, reason: 'unavailable' }
      } catch {
        /* Not a member yet: the expected case. */
      }

      const status = linkStatus(link, Date.now())
      if (status.kind !== 'waiting') return { ok: false, reason: status.kind }

      // ONE batch: this list gains exactly me, and the link is used up by exactly one. The
      // rules check each half against the other, so neither can happen alone (plan § Rules).
      const entry: ListMember = {
        ...selfMember(services, link.role, Date.now()),
        viaLink: code,
        viaLabel: link.label,
      }
      const batch = fs.writeBatch(db)
      batch.update(listRef(link.listId), {
        memberUids: fs.arrayUnion(uid),
        [`members.${uid}`]: entry,
      })
      batch.update(fs.doc(db, SHARE_LINKS, code), { uses: fs.increment(1) })
      try {
        await batch.commit()
        return { ok: true, listId: link.listId, already: false }
      } catch (error) {
        const failure = errorCode(error)
        if (failure === 'unavailable') return { ok: false, reason: 'offline' }
        // Refused: someone else just used it, or the list is full, or it was cancelled.
        const fresh = await readLink(services, code).catch(() => null)
        if (!fresh) return { ok: false, reason: 'unavailable' }
        if (fresh.uses >= fresh.maxUses) return { ok: false, reason: 'used' }
        return { ok: false, reason: failure === 'permission-denied' ? 'full' : 'network' }
      }
    },

    decline: (code) => write(() => fs.updateDoc(fs.doc(db, SHARE_LINKS, code), { declined: true })),

    setRole: (list, who, role) =>
      write(() => fs.updateDoc(listRef(list.id), { [`members.${who}.role`]: role })),

    removeMember: (list, who) =>
      write(async () => {
        // The farewell is written while they are still a member, in the same batch that
        // removes them: that is what the listFarewells rule checks.
        const batch = fs.writeBatch(db)
        batch.update(listRef(list.id), withoutMember(list, who))
        batch.set(fs.doc(db, FAREWELLS, farewellId(list.id, who)), farewellDoc(list, who, 'removed', myName(), Date.now()))
        await batch.commit()
      }),

    leave: (list, { keepCopy }) =>
      write(async () => {
        const batch = fs.writeBatch(db)
        if (keepCopy) await copyInto(batch, list)
        batch.update(listRef(list.id), withoutMember(list, uid))
        await batch.commit()
      }),

    stopSharing: (list) => write(() => endListForEveryone(services, uid, list.id, list, true)),

    subscribeFarewells(onChange, onError) {
      if (disposed) return () => {}
      return track(
        fs.onSnapshot(
          fs.query(fs.collection(db, FAREWELLS), fs.where('uid', '==', uid)),
          (snap) =>
            onChange(
              snap.docs
                .map((d) => ({ ...(d.data() as Omit<Farewell, 'id'>), id: d.id }))
                .sort((a, b) => b.at - a.at),
            ),
          (error) => onError(toStoreError(error)),
        ),
      )
    },

    keepCopy: (farewell) =>
      write(async () => {
        const batch = fs.writeBatch(db)
        await copyInto(batch, { ...farewell.list, id: farewell.listId })
        batch.delete(fs.doc(db, FAREWELLS, farewell.id))
        await batch.commit()
      }),

    dismiss: (farewell) => write(() => fs.deleteDoc(fs.doc(db, FAREWELLS, farewell.id))),

    async dispose() {
      disposed = true
      detachers.forEach((d) => d())
      detachers = []
    },
  }
}

