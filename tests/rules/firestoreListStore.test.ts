import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFirestoreListStore, stripUndefined } from '../../src/storage/firestoreListStore'
import { moveLegacyLists } from '../../src/storage/moveLegacyLists'
import { releaseAllLists } from '../../src/storage/listEndings'
import type { FirebaseServices } from '../../src/auth/firebase'
import type { SessionRecord, WordList } from '../../src/state/types'
import type { GameRecord } from '../../src/game/types'

/**
 * The Firestore adapter against the real emulator with the real rules loaded.
 *
 * Testing it through the rules is the point: a store that works against an open
 * database but trips its own security rules is not working.
 */

let testEnv: RulesTestEnvironment
const UID = 'alice'

const makeList = (over: Partial<WordList> = {}): WordList => ({
  id: 'l1',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [{ id: 'p1', col1: 'daughter', col2: 'dochter' }],
  createdAt: 1000,
  updatedAt: 1000,
  origin: 'manual',
  ...over,
})

const makeRecord = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1',
  listId: 'l1',
  listName: 'Lesson 3',
  right: 1,
  wrong: 0,
  total: 1,
  pct: 100,
  wrongPairs: [],
  finishedAt: 2000,
  mode: 'full',
  partial: false,
  ...over,
})

/** The SDK surface firebase.ts hands to adapters, built from the test env. */
function servicesFor(uid: string): FirebaseServices {
  const db = testEnv.authenticatedContext(uid).firestore()
  return {
    db,
    fs: {
      collection,
      doc,
      setDoc,
      updateDoc,
      deleteDoc,
      getDocs,
      getDoc,
      onSnapshot,
      query,
      where,
      orderBy,
      limit,
      writeBatch,
      serverTimestamp,
    },
  } as unknown as FirebaseServices
}

const storeFor = (uid = UID) => createFirestoreListStore(servicesFor(uid), uid)

/** Wait for a subscription to emit something matching `predicate`. */
function nextMatching<T>(
  subscribe: (cb: (v: T) => void) => () => void,
  predicate: (v: T) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub()
      reject(new Error('subscription never emitted a matching value'))
    }, 8000)
    const unsub = subscribe((value) => {
      if (!predicate(value)) return
      clearTimeout(timer)
      unsub()
      resolve(value)
    })
  })
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-practice-vocabulary',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(() => testEnv.cleanup())
beforeEach(() => testEnv.clearFirestore())

const makeGame = (over: Partial<GameRecord> = {}): GameRecord => ({
  id: 'g1',
  finishedAt: 1000,
  listIds: ['l1', 'l2'],
  listNames: ['Lesson 3', 'Market'],
  source: 'all',
  correct: 7,
  asked: 10,
  points: 52,
  available: 100,
  results: [
    {
      word: { id: 'w0', col1: 'daughter', col2: 'dochter', listId: 'l1', listName: 'Lesson 3' },
      correct: true,
    },
  ],
  partial: false,
  ...over,
})

describe('lists round-trip', () => {
  it('saves a list and emits it to a subscriber', async () => {
    const store = storeFor()
    await store.saveList(makeList())

    const lists = await nextMatching<WordList[]>(
      (cb) => store.subscribeLists(cb, () => {}),
      (l) => l.length === 1,
    )
    expect(lists[0]!.name).toBe('Lesson 3')
    expect(lists[0]!.pairs).toHaveLength(1)
    await store.dispose()
  })

  it('uses the list id as the document id, so saving twice does not duplicate', async () => {
    const store = storeFor()
    await store.saveList(makeList({ name: 'First' }))
    await store.saveList(makeList({ name: 'Second' }))

    const lists = await nextMatching<WordList[]>(
      (cb) => store.subscribeLists(cb, () => {}),
      (l) => l.length > 0 && l[0]!.name === 'Second',
    )
    // This property is what makes the migration in Phase 6 idempotent for free.
    expect(lists).toHaveLength(1)
    await store.dispose()
  })

  it('renames in place', async () => {
    const store = storeFor()
    await store.saveList(makeList())
    expect(await store.renameList('l1', 'Renamed')).toEqual({ ok: true })

    const lists = await nextMatching<WordList[]>(
      (cb) => store.subscribeLists(cb, () => {}),
      (l) => l.length === 1 && l[0]!.name === 'Renamed',
    )
    expect(lists[0]!.name).toBe('Renamed')
    await store.dispose()
  })

  it('removes a list', async () => {
    const store = storeFor()
    await store.saveList(makeList())
    expect(await store.removeList('l1')).toEqual({ ok: true })

    const lists = await nextMatching<WordList[]>(
      (cb) => store.subscribeLists(cb, () => {}),
      (l) => l.length === 0,
    )
    expect(lists).toEqual([])
    await store.dispose()
  })

  it('orders newest-updated first', async () => {
    const store = storeFor()
    await store.saveList(makeList({ id: 'a', updatedAt: 1 }))
    await store.saveList(makeList({ id: 'b', updatedAt: 5 }))

    const lists = await nextMatching<WordList[]>(
      (cb) => store.subscribeLists(cb, () => {}),
      (l) => l.length === 2,
    )
    expect(lists.map((l) => l.id)).toEqual(['b', 'a'])
    await store.dispose()
  })
})

describe('rules enforcement through the adapter', () => {
  it('maps a rules rejection to a permission failure rather than throwing', async () => {
    const store = storeFor()
    const tooManyPairs = Array.from({ length: 501 }, (_, i) => ({
      id: `p${i}`,
      col1: 'a',
      col2: 'b',
    }))
    // The 500-pair cap lives in the rules, so this is a real server rejection.
    expect(await store.saveList(makeList({ pairs: tooManyPairs }))).toEqual({
      ok: false,
      reason: 'permission',
    })
    await store.dispose()
  })

  it('cannot reach another user\'s data', async () => {
    const alice = storeFor('alice')
    await alice.saveList(makeList())
    await alice.dispose()

    // Bob's store is scoped to alice's path but authenticated as bob.
    const bob = createFirestoreListStore(servicesFor('bob'), 'alice')
    const error = await new Promise<{ kind: string }>((resolve) => {
      bob.subscribeLists(
        () => {},
        (e) => resolve(e),
      )
    })
    expect(error.kind).toBe('permission')
    await bob.dispose()
  })

  it('refuses to rewrite a session record, because history is append-only', async () => {
    const store = storeFor()
    await store.recordSession(makeRecord())
    expect(await store.recordSession(makeRecord({ right: 999 }))).toEqual({
      ok: false,
      reason: 'permission',
    })
    await store.dispose()
  })
})

describe('session history', () => {
  it('records and emits newest first', async () => {
    const store = storeFor()
    await store.recordSession(makeRecord({ id: 's1', finishedAt: 1 }))
    await store.recordSession(makeRecord({ id: 's2', finishedAt: 9 }))

    const records = await nextMatching<SessionRecord[]>(
      (cb) => store.subscribeSessions(null, cb, () => {}),
      (r) => r.length === 2,
    )
    expect(records.map((r) => r.id)).toEqual(['s2', 's1'])
    await store.dispose()
  })

  it('filters by listId', async () => {
    const store = storeFor()
    await store.recordSession(makeRecord({ id: 's1', listId: 'l1' }))
    await store.recordSession(makeRecord({ id: 's2', listId: 'l2' }))

    const records = await nextMatching<SessionRecord[]>(
      (cb) => store.subscribeSessions('l2', cb, () => {}),
      (r) => r.length === 1,
    )
    expect(records[0]!.id).toBe('s2')
    await store.dispose()
  })

  it('keeps history after its list is deleted', async () => {
    const store = storeFor()
    await store.saveList(makeList())
    await store.recordSession(makeRecord())
    await store.removeList('l1')

    const records = await nextMatching<SessionRecord[]>(
      (cb) => store.subscribeSessions(null, cb, () => {}),
      (r) => r.length === 1,
    )
    expect(records[0]!.listName).toBe('Lesson 3')
    await store.dispose()
  })
})

/** A list document as it is stored since 016: content plus membership. */
const stored = (list: WordList, members: Record<string, string>, owner = UID) => ({
  ...list,
  ownerUid: owner,
  memberUids: Object.keys(members),
  members: Object.fromEntries(
    Object.entries(members).map(([uid, role]) => [
      uid,
      { role, displayName: uid, email: null, photoURL: null, joinedAt: 1, ...(role === 'owner' ? {} : { viaLink: 'x' }) },
    ]),
  ),
  updatedBy: owner,
})

const seedDoc = (path: string, data: object) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })

const readDoc = async (path: string) => {
  let data: Record<string, unknown> | undefined
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path))).data()
  })
  return data
}

describe('one lists collection (016)', () => {
  it('creates a new list in lists/ with its creator as the only member and owner', async () => {
    const store = storeFor()
    expect(await store.saveList(makeList())).toEqual({ ok: true })
    const data = await readDoc('lists/l1')
    expect(data).toMatchObject({ ownerUid: UID, memberUids: [UID], updatedBy: UID, name: 'Lesson 3' })
    expect((data!.members as Record<string, { role: string }>)[UID]!.role).toBe('owner')
    expect(await readDoc(`users/${UID}/lists/l1`)).toBeUndefined()
    await store.dispose()
  })

  it('emits membership as `sharing`, not as loose fields', async () => {
    await seedDoc('lists/l1', stored(makeList(), { [UID]: 'owner', bob: 'editor' }))
    const store = storeFor()
    const [list] = await nextMatching<WordList[]>((cb) => store.subscribeLists(cb, () => {}), (l) => l.length === 1)
    expect(list!.sharing!.memberUids).toEqual([UID, 'bob'])
    expect(list!.sharing!.members.bob!.role).toBe('editor')
    expect(list).not.toHaveProperty('memberUids')
    await store.dispose()
  })

  it('shows a list shared with me beside my own', async () => {
    await seedDoc('lists/mine', stored(makeList({ id: 'mine', updatedAt: 1 }), { [UID]: 'owner' }))
    await seedDoc('lists/theirs', stored(makeList({ id: 'theirs', updatedAt: 9 }), { bob: 'owner', [UID]: 'viewer' }, 'bob'))
    await seedDoc('lists/private', stored(makeList({ id: 'private' }), { bob: 'owner' }, 'bob'))
    const store = storeFor()
    const lists = await nextMatching<WordList[]>((cb) => store.subscribeLists(cb, () => {}), (l) => l.length === 2)
    expect(lists.map((l) => l.id)).toEqual(['theirs', 'mine'])
    await store.dispose()
  })

  it("an editor's save is an update of the words, and cannot undo a concurrent join", async () => {
    await seedDoc('lists/l1', stored(makeList(), { bob: 'owner', [UID]: 'editor' }, 'bob'))
    const store = storeFor()
    const [list] = await nextMatching<WordList[]>((cb) => store.subscribeLists(cb, () => {}), (l) => l.length === 1)

    // Carol joins after this client last saw the list.
    await seedDoc('lists/l1', stored(makeList(), { bob: 'owner', [UID]: 'editor', carol: 'viewer' }, 'bob'))

    const edited = { ...list!, name: 'Edited', updatedAt: 5 }
    expect(await store.saveList(edited)).toEqual({ ok: true })
    const data = await readDoc('lists/l1')
    expect(data).toMatchObject({ name: 'Edited', updatedBy: UID, ownerUid: 'bob' })
    expect(data!.memberUids).toEqual(['bob', UID, 'carol'])
    await store.dispose()
  })

  it('refuses a "Can practise" member saving, as a permission failure', async () => {
    await seedDoc('lists/l1', stored(makeList(), { bob: 'owner', [UID]: 'viewer' }, 'bob'))
    const store = storeFor()
    const [list] = await nextMatching<WordList[]>((cb) => store.subscribeLists(cb, () => {}), (l) => l.length === 1)
    expect(await store.saveList({ ...list!, name: 'Nope' })).toEqual({ ok: false, reason: 'permission' })
    await store.dispose()
  })

  it("a member's delete is leaving: the list stays for everyone else", async () => {
    await seedDoc('lists/l1', stored(makeList(), { bob: 'owner', [UID]: 'editor' }, 'bob'))
    const store = storeFor()
    await nextMatching<WordList[]>((cb) => store.subscribeLists(cb, () => {}), (l) => l.length === 1)
    expect(await store.removeList('l1')).toEqual({ ok: true })
    const data = await readDoc('lists/l1')
    expect(data!.memberUids).toEqual(['bob'])
    await store.dispose()
  })

  it("the owner's delete of a shared list leaves every other member a farewell", async () => {
    await seedDoc('lists/l1', stored(makeList(), { [UID]: 'owner', bob: 'editor' }))
    const store = storeFor()
    await nextMatching<WordList[]>((cb) => store.subscribeLists(cb, () => {}), (l) => l.length === 1)
    expect(await store.removeList('l1')).toEqual({ ok: true })
    expect(await readDoc('lists/l1')).toBeUndefined()
    expect(await readDoc('listFarewells/l1_bob')).toMatchObject({ uid: 'bob', reason: 'deleted', listId: 'l1' })
    await store.dispose()
  })
})

describe('the legacy location, until it is moved (016 D-14)', () => {
  it('shows lists still waiting in users/{uid}/lists, deduped against lists/', async () => {
    await seedDoc(`users/${UID}/lists/old`, makeList({ id: 'old', updatedAt: 1 }))
    await seedDoc(`users/${UID}/lists/both`, makeList({ id: 'both', name: 'Legacy copy' }))
    await seedDoc('lists/both', stored(makeList({ id: 'both', name: 'Moved copy', updatedAt: 5 }), { [UID]: 'owner' }))
    const store = storeFor()
    const lists = await nextMatching<WordList[]>((cb) => store.subscribeLists(cb, () => {}), (l) => l.length === 2)
    expect(lists.map((l) => [l.id, l.name])).toEqual([
      ['both', 'Moved copy'],
      ['old', 'Lesson 3'],
    ])
    await store.dispose()
  })

  it('saving a list that is still in the legacy location moves it', async () => {
    await seedDoc(`users/${UID}/lists/old`, makeList({ id: 'old' }))
    const store = storeFor()
    const [list] = await nextMatching<WordList[]>((cb) => store.subscribeLists(cb, () => {}), (l) => l.length === 1)
    expect(await store.saveList({ ...list!, name: 'Edited' })).toEqual({ ok: true })
    expect(await readDoc('lists/old')).toMatchObject({ name: 'Edited', ownerUid: UID })
    expect(await readDoc(`users/${UID}/lists/old`)).toBeUndefined()
    await store.dispose()
  })
})

describe('moveLegacyLists', () => {
  const services = () => servicesFor(UID)

  it('moves every legacy list to lists/, keeping its id and content', async () => {
    await seedDoc(`users/${UID}/lists/a`, makeList({ id: 'a', name: 'A' }))
    await seedDoc(`users/${UID}/lists/b`, makeList({ id: 'b', name: 'B' }))
    expect(await moveLegacyLists(services(), UID)).toEqual({ moved: 2, tidied: 0, refused: [] })
    expect(await readDoc('lists/a')).toMatchObject({ name: 'A', ownerUid: UID, memberUids: [UID] })
    expect(await readDoc('lists/b')).toMatchObject({ name: 'B', pairs: makeList().pairs })
    expect(await readDoc(`users/${UID}/lists/a`)).toBeUndefined()
    expect(await readDoc(`users/${UID}/lists/b`)).toBeUndefined()
  })

  it('is a no-op the second time', async () => {
    await seedDoc(`users/${UID}/lists/a`, makeList({ id: 'a' }))
    await moveLegacyLists(services(), UID)
    expect(await moveLegacyLists(services(), UID)).toEqual({ moved: 0, tidied: 0, refused: [] })
  })

  it('finishes a run that was interrupted after copying but before deleting', async () => {
    await seedDoc(`users/${UID}/lists/a`, makeList({ id: 'a', name: 'Legacy' }))
    await seedDoc('lists/a', stored(makeList({ id: 'a', name: 'Already moved and edited' }), { [UID]: 'owner' }))
    expect(await moveLegacyLists(services(), UID)).toEqual({ moved: 0, tidied: 1, refused: [] })
    // The copy in lists/ wins: it may have been edited since.
    expect(await readDoc('lists/a')).toMatchObject({ name: 'Already moved and edited' })
    expect(await readDoc(`users/${UID}/lists/a`)).toBeUndefined()
  })

  it("never deletes a legacy list it could not copy (an id taken by someone else's list)", async () => {
    await seedDoc(`users/${UID}/lists/a`, makeList({ id: 'a' }))
    await seedDoc('lists/a', stored(makeList({ id: 'a' }), { bob: 'owner' }, 'bob'))
    expect(await moveLegacyLists(services(), UID)).toEqual({ moved: 0, tidied: 0, refused: ['a'] })
    expect(await readDoc(`users/${UID}/lists/a`)).toBeDefined()
    expect(await readDoc('lists/a')).toMatchObject({ ownerUid: 'bob' })
  })

  it('leaves history and saved tests pointing at the same ids', async () => {
    const store = storeFor()
    await seedDoc(`users/${UID}/lists/a`, makeList({ id: 'a' }))
    await store.recordSession(makeRecord({ listId: 'a' }))
    await moveLegacyLists(services(), UID)
    const lists = await nextMatching<WordList[]>((cb) => store.subscribeLists(cb, () => {}), (l) => l.length === 1)
    const records = await nextMatching<SessionRecord[]>(
      (cb) => store.subscribeSessions('a', cb, () => {}),
      (r) => r.length === 1,
    )
    expect(records[0]!.listId).toBe(lists[0]!.id)
    await store.dispose()
  })
})

describe('releaseAllLists: account deletion lets go of every list (016 D-13)', () => {
  it('deletes a list I own alone, as account deletion always did', async () => {
    await seedDoc('lists/a', stored(makeList({ id: 'a' }), { [UID]: 'owner' }))
    await releaseAllLists(servicesFor(UID), UID)
    expect(await readDoc('lists/a')).toBeUndefined()
  })

  it('leaves a list I am only a member of, which stays for its owner', async () => {
    await seedDoc('lists/a', stored(makeList({ id: 'a' }), { bob: 'owner', [UID]: 'editor' }, 'bob'))
    await releaseAllLists(servicesFor(UID), UID)
    expect(await readDoc('lists/a')).toMatchObject({ ownerUid: 'bob', memberUids: ['bob'] })
  })

  it('hands a list I own to the longest-standing editor rather than deleting it', async () => {
    const list = stored(makeList({ id: 'a' }), { [UID]: 'owner', carol: 'viewer', bob: 'editor', dan: 'editor' })
    list.members.carol!.joinedAt = 1
    list.members.bob!.joinedAt = 3
    list.members.dan!.joinedAt = 2
    await seedDoc('lists/a', list)
    await releaseAllLists(servicesFor(UID), UID)
    const data = await readDoc('lists/a')
    expect(data).toMatchObject({ ownerUid: 'dan' })
    expect((data!.members as Record<string, { role: string }>).dan!.role).toBe('owner')
    expect(data!.memberUids).not.toContain(UID)
  })

  it('removes the links I made and the farewells addressed to me', async () => {
    await seedDoc('shareLinks/c1', { listId: 'x', createdByUid: UID })
    await seedDoc(`listFarewells/x_${UID}`, { uid: UID, listId: 'x' })
    await releaseAllLists(servicesFor(UID), UID)
    expect(await readDoc('shareLinks/c1')).toBeUndefined()
    expect(await readDoc(`listFarewells/x_${UID}`)).toBeUndefined()
  })
})

describe('dispose', () => {
  it('detaches listeners so a signed-out user stops receiving updates', async () => {
    const store = storeFor()
    const onChange = vi.fn()
    store.subscribeLists(onChange, () => {})
    await nextMatching<WordList[]>((cb) => store.subscribeLists(cb, () => {}), () => true)

    await store.dispose()
    const callsAfterDispose = onChange.mock.calls.length

    // Written through a separate context, so the write itself is unaffected.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'lists/late'), {
        ...makeList({ id: 'late' }),
        ownerUid: UID,
        memberUids: [UID],
        members: { [UID]: { role: 'owner' } },
        updatedBy: UID,
      })
    })
    await new Promise((r) => setTimeout(r, 500))

    // A leaked listener here would deliver one user's data into the next
    // user's view after a sign-out/sign-in swap.
    expect(onChange.mock.calls.length).toBe(callsAfterDispose)
  })
})

describe('stripUndefined', () => {
  it('drops undefined fields, which Firestore rejects outright', () => {
    expect(stripUndefined({ a: 1, b: undefined })).toEqual({ a: 1 })
  })

  it('recurses into nested objects and arrays', () => {
    expect(stripUndefined({ rows: [{ col1: 'a', conf: undefined }] })).toEqual({
      rows: [{ col1: 'a' }],
    })
  })

  it('preserves null, which is a legitimate stored value', () => {
    expect(stripUndefined({ photoURL: null })).toEqual({ photoURL: null })
  })

  it('leaves a fully-populated object untouched', () => {
    const list = makeList()
    expect(stripUndefined(list)).toEqual(list)
  })
})

describe('game history through the real adapter and the real rules', () => {
  it('round-trips a game, per-word results intact', async () => {
    const store = storeFor()
    expect(await store.recordGame(makeGame())).toEqual({ ok: true })

    const games = await nextMatching<GameRecord[]>(
      (cb) => store.subscribeGames(cb, () => {}),
      (g) => g.length === 1,
    )
    expect(games[0]).toMatchObject({ id: 'g1', points: 52, listIds: ['l1', 'l2'] })
    expect(games[0]?.results?.[0]?.word.listId).toBe('l1')
    await store.dispose()
  })

  it('emits newest first', async () => {
    const store = storeFor()
    await store.recordGame(makeGame({ id: 'old', finishedAt: 1 }))
    await store.recordGame(makeGame({ id: 'new', finishedAt: 9 }))

    const games = await nextMatching<GameRecord[]>(
      (cb) => store.subscribeGames(cb, () => {}),
      (g) => g.length === 2,
    )
    expect(games.map((g) => g.id)).toEqual(['new', 'old'])
    await store.dispose()
  })

  it('syncs a record whose detail was shed, rather than refusing it', async () => {
    /*
     * A game that lost its `results` to local quota pressure still carries a score
     * worth keeping. Firestore THROWS on an undefined field, so this is also the test
     * that stripUndefined is actually applied on this path.
     */
    const store = storeFor()
    const { results: _dropped, ...slim } = makeGame()
    expect(await store.recordGame(slim as GameRecord)).toEqual({ ok: true })

    const games = await nextMatching<GameRecord[]>(
      (cb) => store.subscribeGames(cb, () => {}),
      (g) => g.length === 1,
    )
    expect(games[0]?.results).toBeUndefined()
    expect(games[0]?.points).toBe(52)
    await store.dispose()
  })

  it('cannot rewrite a game it already wrote — the rules say so, not the client', async () => {
    const store = storeFor()
    await store.recordGame(makeGame())
    expect(await store.recordGame(makeGame({ points: 999 }))).toEqual({
      ok: false,
      reason: 'permission',
    })
    await store.dispose()
  })

  it('detaches its game listener on dispose', async () => {
    const store = storeFor()
    let calls = 0
    store.subscribeGames(() => (calls += 1), () => {})
    await nextMatching<GameRecord[]>((cb) => store.subscribeGames(cb, () => {}), () => true)
    await store.dispose()
    const before = calls
    await storeFor().recordGame(makeGame({ id: 'after-dispose' }))
    await new Promise((r) => setTimeout(r, 250))
    expect(calls).toBe(before)
  })
})
