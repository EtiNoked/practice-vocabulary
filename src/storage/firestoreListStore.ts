import type { GameRecord } from '../game/types'
import type { SavedTest } from '../state/testPlan'
import type { ListMember, ListSharing, SessionRecord, WordList } from '../state/types'
import type { FirebaseServices } from '../auth/firebase'
import type { ListStore, StoreError, Unsubscribe, WriteResult } from './types'
import { MAX_RECORDS as MAX_SESSION_RECORDS } from './sessionRepo'
import { MAX_GAME_RECORDS } from './gameRepo'
import { endListForEveryone } from './listEndings'
import { stripUndefined } from './stripUndefined'

export { stripUndefined }

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

/** Top-level: every cloud list, associated with people by membership (016 D-5). */
export const LISTS = 'lists'

/** The fields a member may change by editing. Mirrors `isContentEdit` in firestore.rules. */
const CONTENT_FIELDS = ['name', 'pairs', 'col1Lang', 'col2Lang', 'langSource', 'updatedAt'] as const

/** Who the signed-in user is, as a member entry. Best-effort: the SDK may not know yet. */
export function selfMember(services: FirebaseServices, role: ListMember['role'], joinedAt: number): ListMember {
  const user = services.auth?.currentUser ?? null
  return {
    role,
    displayName: user?.displayName ?? null,
    email: user?.email ?? null,
    photoURL: user?.photoURL ?? null,
    joinedAt,
  }
}

/**
 * A stored `lists` document, flattened: the membership fields sit beside the content so the
 * rules can read them directly. `WordList.sharing` is the in-app shape of the same data.
 */
export function toListDoc(list: WordList, sharing: ListSharing): Record<string, unknown> {
  const { sharing: _ignored, ...content } = list
  return stripUndefined({ ...content, ...sharing })
}

export function fromListDoc(id: string, data: Record<string, unknown>): WordList {
  const { ownerUid, memberUids, members, updatedBy, ...content } = data
  const list = { ...content, id } as unknown as WordList
  if (typeof ownerUid === 'string' && Array.isArray(memberUids)) {
    list.sharing = {
      ownerUid,
      memberUids: memberUids as string[],
      members: (members ?? {}) as Record<string, ListMember>,
      updatedBy: typeof updatedBy === 'string' ? updatedBy : ownerUid,
    }
  }
  return list
}

/** A brand-new list's membership: its creator, alone, as owner. */
export function soleOwner(services: FirebaseServices, uid: string, joinedAt: number): ListSharing {
  return {
    ownerUid: uid,
    memberUids: [uid],
    members: { [uid]: selfMember(services, 'owner', joinedAt) },
    updatedBy: uid,
  }
}

/** Whether this device has seen this user's legacy lists emptied (016 D-14). */
export const movedKey = (uid: string) => `pvt.lists.moved.${uid}`

export function legacyMoved(uid: string): boolean {
  try {
    return localStorage.getItem(movedKey(uid)) === '1'
  } catch {
    return false
  }
}

export function markLegacyMoved(uid: string): void {
  try {
    localStorage.setItem(movedKey(uid), '1')
  } catch {
    /* A device that cannot store the flag just keeps one idle listener. */
  }
}

export function createFirestoreListStore(services: FirebaseServices, uid: string): ListStore {
  const { db, fs } = services
  let detachers: Unsubscribe[] = []
  let disposed = false

  /** LEGACY (016). Read and emptied by moveLegacyLists; never written. */
  const legacyListsPath = `users/${uid}/lists`
  const sessionsPath = `users/${uid}/sessions`
  const gamesPath = `users/${uid}/games`
  const testsPath = `users/${uid}/tests`

  /** Track every listener so dispose() can detach all of them. A leaked
   * onSnapshot keeps firing after sign-out and would write one user's data
   * into the next user's view. */
  function track(detach: Unsubscribe): Unsubscribe {
    detachers.push(detach)
    return () => {
      detach()
      detachers = detachers.filter((d) => d !== detach)
    }
  }

  /**
   * The lists this user is currently a member of, from the live subscription, keyed by id.
   * `null` until the first snapshot arrives. It decides whether a save is a create or an
   * edit, which matters: an edit must be an update of content fields only, never a whole-
   * document write that would rewrite `members` from a stale copy (the rules refuse that).
   */
  let known: Map<string, WordList> | null = null
  /** Legacy lists still waiting to be moved, by id. */
  let legacy = new Map<string, WordList>()

  async function write(fn: () => Promise<void>): Promise<WriteResult> {
    try {
      await fn()
      return { ok: true }
    } catch (error) {
      return toWriteResult(error)
    }
  }

  return {
    subscribeLists(onChange, onError): Unsubscribe {
      if (disposed) return () => {}

      /*
       * ONE query: every list I am a member of. Private and shared lists come back together,
       * because a private list is simply one whose only member is me (016 D-5).
       *
       * Sorted here rather than with orderBy: `array-contains` plus `orderBy` needs a
       * composite index, and a user has a few dozen lists at most.
       *
       * Until this device has seen the legacy location emptied (016 D-14), a second listener
       * reads `users/{uid}/lists` too, so a list waiting to be moved never disappears, even
       * offline. Both must answer before the first emit, or lists would flicker in.
       */
      let mine: WordList[] | null = null
      let old: WordList[] | null = legacyMoved(uid) ? [] : null

      const emit = () => {
        if (mine === null || old === null) return
        const ids = new Set(mine.map((l) => l.id))
        const merged = [...mine, ...old.filter((l) => !ids.has(l.id))]
        onChange(merged.sort((a, b) => b.updatedAt - a.updatedAt))
      }

      const detachMine = fs.onSnapshot(
        fs.query(fs.collection(db, LISTS), fs.where('memberUids', 'array-contains', uid)),
        (snap) => {
          mine = snap.docs.map((d) => fromListDoc(d.id, d.data() as Record<string, unknown>))
          known = new Map(mine.map((l) => [l.id, l]))
          emit()
        },
        (error) => onError(toStoreError(error)),
      )

      const detachOld =
        old !== null
          ? () => {}
          : fs.onSnapshot(
              fs.collection(db, legacyListsPath),
              (snap) => {
                old = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as WordList)
                legacy = new Map(old.map((l) => [l.id, l]))
                emit()
              },
              (error) => onError(toStoreError(error)),
            )

      return track(() => {
        detachMine()
        detachOld()
      })
    },

    saveList: (list) =>
      write(async () => {
        const updatedAt = list.updatedAt
        const edit = () => {
          const patch: Record<string, unknown> = { updatedBy: uid }
          for (const field of CONTENT_FIELDS) patch[field] = list[field]
          return fs.updateDoc(fs.doc(db, LISTS, list.id), stripUndefined(patch))
        }
        // The list's existing client-generated uuid IS the document id, as it was before
        // 016. That is still what makes 003's device-to-account copy idempotent for free.
        const create = async () => {
          const batch = fs.writeBatch(db)
          batch.set(fs.doc(db, LISTS, list.id), toListDoc(list, soleOwner(services, uid, list.createdAt ?? updatedAt)))
          // Saving a list that is still waiting in the legacy location moves it now.
          if (legacy.has(list.id)) batch.delete(fs.doc(db, legacyListsPath, list.id))
          await batch.commit()
        }

        if (known?.has(list.id)) return edit()
        if (known !== null) return create()
        // Before the first snapshot we cannot tell a new list from an existing one. Try the
        // edit, and create the list if that is refused. A missing document is refused as
        // permission-denied, not not-found: the update rule reads `resource.data`, which is
        // null. A genuine refusal (a "Can practise" member) is refused again by the create,
        // which the rules treat as an update of the existing document.
        try {
          await edit()
        } catch (error) {
          const code = errorCode(error)
          if (code !== 'not-found' && code !== 'permission-denied') throw error
          await create()
        }
      }),

    renameList: (id, name) =>
      write(async () => {
        if (legacy.has(id) && !known?.has(id)) {
          const list = legacy.get(id)!
          const batch = fs.writeBatch(db)
          batch.set(
            fs.doc(db, LISTS, id),
            toListDoc({ ...list, name, updatedAt: Date.now() }, soleOwner(services, uid, list.createdAt)),
          )
          batch.delete(fs.doc(db, legacyListsPath, id))
          await batch.commit()
          return
        }
        await fs.updateDoc(fs.doc(db, LISTS, id), { name, updatedAt: Date.now(), updatedBy: uid })
      }),

    removeList: (id) =>
      write(async () => {
        if (legacy.has(id)) await fs.deleteDoc(fs.doc(db, legacyListsPath, id))
        const list = known?.get(id)
        const sharing = list?.sharing
        // Not the owner: "delete" means leave. The list stays for everyone else.
        if (sharing && sharing.ownerUid !== uid) {
          const { [uid]: _me, ...members } = sharing.members
          await fs.updateDoc(fs.doc(db, LISTS, id), {
            memberUids: sharing.memberUids.filter((m) => m !== uid),
            members,
          })
          return
        }
        if (!legacy.has(id) || known?.has(id)) await endListForEveryone(services, uid, id, list ?? null)
      }),

    subscribeSessions(listId, onChange, onError): Unsubscribe {
      if (disposed) return () => {}
      const base = fs.collection(db, sessionsPath)
      /*
       * Bounded, matching sessionRepo.MAX_RECORDS.
       *
       * This subscribed to an UNBOUNDED collection, which was survivable only
       * while nothing read past the newest ten. 006's review screens read all of
       * it, on every recomputation — so the two stores have to agree on how much
       * history exists, or the same user gets a different missed-word set on two
       * devices.
       */
      const q =
        listId === null
          ? fs.query(base, fs.orderBy('finishedAt', 'desc'), fs.limit(MAX_SESSION_RECORDS))
          : fs.query(
              base,
              fs.where('listId', '==', listId),
              fs.orderBy('finishedAt', 'desc'),
              fs.limit(MAX_SESSION_RECORDS),
            )
      return track(
        fs.onSnapshot(
          q,
          (snap) => onChange(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as SessionRecord)),
          (error) => onError(toStoreError(error)),
        ),
      )
    },

    recordSession: (record) =>
      write(async () => {
        await fs.setDoc(fs.doc(db, sessionsPath, record.id), stripUndefined(record))
      }),

    subscribeGames(onChange, onError): Unsubscribe {
      if (disposed) return () => {}
      /*
       * BOUNDED, matching gameRepo.MAX_GAME_RECORDS.
       *
       * Not optional. Games feed the missed-words pool, so if the two stores disagree
       * about how much history exists, the same user gets a different set of "words you
       * got wrong" on two devices — with nothing on either screen to explain it. Same
       * reasoning that bounded the session query above.
       */
      const q = fs.query(
        fs.collection(db, gamesPath),
        fs.orderBy('finishedAt', 'desc'),
        fs.limit(MAX_GAME_RECORDS),
      )
      return track(
        fs.onSnapshot(
          q,
          (snap) => onChange(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as GameRecord)),
          (error) => onError(toStoreError(error)),
        ),
      )
    },

    recordGame: (record) =>
      write(async () => {
        // stripUndefined is mandatory: Firestore THROWS on an undefined field value, and
        // `results` is legitimately absent on a record whose detail was shed.
        await fs.setDoc(fs.doc(db, gamesPath, record.id), stripUndefined(record))
      }),

    subscribeTests(onChange, onError): Unsubscribe {
      if (disposed) return () => {}
      /*
       * Ordered by `updatedAt`, not `finishedAt`: a saved test is a document that gets
       * edited, not a log entry with a moment. Unbounded, unlike the two history
       * subscriptions — `MAX_TESTS` is 50 and they are a few hundred bytes each.
       */
      const q = fs.query(fs.collection(db, testsPath), fs.orderBy('updatedAt', 'desc'))
      return track(
        fs.onSnapshot(
          q,
          (snap) => onChange(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as SavedTest)),
          (error) => onError(toStoreError(error)),
        ),
      )
    },

    saveTest: (test) =>
      write(async () => {
        // The client-generated id IS the document id, exactly as it is for a list — which
        // is what makes saving the same test twice one document rather than two.
        await fs.setDoc(fs.doc(db, testsPath, test.id), stripUndefined(test))
      }),

    removeTest: (id) =>
      write(async () => {
        await fs.deleteDoc(fs.doc(db, testsPath, id))
      }),

    async dispose(): Promise<void> {
      disposed = true
      detachers.forEach((d) => d())
      detachers = []
    },
  }
}
