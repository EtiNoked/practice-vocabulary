import type { GameRecord } from '../game/types'
import type { SavedTest } from '../state/testPlan'
import type { SessionRecord, WordList } from '../state/types'
import type { FirebaseServices } from '../auth/firebase'
import type { ListStore, StoreError, Unsubscribe, WriteResult } from './types'
import { MAX_RECORDS as MAX_SESSION_RECORDS } from './sessionRepo'
import { MAX_GAME_RECORDS } from './gameRepo'

/**
 * Recursively drop keys whose value is `undefined`.
 *
 * Firestore THROWS on an undefined field value rather than skipping it, and
 * `exactOptionalPropertyTypes` means optional fields (RawRow.conf) legitimately
 * arrive absent. Stripping at the adapter boundary is deliberate: setting
 * `ignoreUndefinedProperties` globally would paper over genuine bugs elsewhere
 * by silently discarding fields nobody meant to omit. See plan.md R7.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}

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

export function createFirestoreListStore(services: FirebaseServices, uid: string): ListStore {
  const { db, fs } = services
  let detachers: Unsubscribe[] = []
  let disposed = false

  const listsPath = `users/${uid}/lists`
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
      const q = fs.query(fs.collection(db, listsPath), fs.orderBy('updatedAt', 'desc'))
      return track(
        fs.onSnapshot(
          q,
          (snap) => onChange(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as WordList)),
          (error) => onError(toStoreError(error)),
        ),
      )
    },

    // The list's existing client-generated uuid IS the document id. That is what
    // makes migration idempotent for free — copying the same list twice writes
    // the same document twice rather than creating two.
    saveList: (list) =>
      write(async () => {
        await fs.setDoc(fs.doc(db, listsPath, list.id), stripUndefined(list))
      }),

    renameList: (id, name) =>
      write(async () => {
        await fs.updateDoc(fs.doc(db, listsPath, id), { name, updatedAt: Date.now() })
      }),

    removeList: (id) =>
      write(async () => {
        await fs.deleteDoc(fs.doc(db, listsPath, id))
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
