import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FirebaseServices } from '../../src/auth/firebase'
import { createFirestoreShareStore, readLink } from '../../src/share/firestoreShareStore'
import type { Farewell, ShareLink } from '../../src/share/types'
import { createFirestoreListStore } from '../../src/storage/firestoreListStore'
import type { WordList } from '../../src/state/types'

/**
 * The share store against the emulator with the real rules: two people, a link, and every
 * way in and out of a shared list. A store that works against an open database but trips
 * its own rules is not working, so none of this is mocked.
 */

let testEnv: RulesTestEnvironment
const ALICE = 'alice'
const BOB = 'bob'
const CAROL = 'carol'

function servicesFor(uid: string | null): FirebaseServices {
  const db = uid ? testEnv.authenticatedContext(uid).firestore() : testEnv.unauthenticatedContext().firestore()
  return {
    db,
    auth: { currentUser: uid ? { displayName: uid[0]!.toUpperCase() + uid.slice(1), email: `${uid}@x.com`, photoURL: null } : null },
    fs: {
      collection, doc, setDoc, updateDoc, deleteDoc, getDocs, getDoc, onSnapshot, query, where,
      orderBy, limit, writeBatch, serverTimestamp, arrayUnion, increment,
    },
  } as unknown as FirebaseServices
}

const shareStore = (uid: string) => createFirestoreShareStore(servicesFor(uid), uid)
const listStore = (uid: string) => createFirestoreListStore(servicesFor(uid), uid)

const makeList = (over: Partial<WordList> = {}): WordList => ({
  id: 'l1',
  name: 'French verbs',
  col1Lang: 'en',
  col2Lang: 'fr',
  langSource: 'manual',
  pairs: [
    { id: 'p1', col1: 'to be', col2: 'être' },
    { id: 'p2', col1: 'to have', col2: 'avoir' },
  ],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
  ...over,
})

function next<T>(subscribe: (cb: (v: T) => void) => () => void, predicate: (v: T) => boolean): Promise<T> {
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

async function readAs(path: string) {
  let data: Record<string, unknown> | undefined
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path))).data()
  })
  return data
}

/** Alice saves a list and returns it as the store emits it (with `sharing`). */
async function aliceList(): Promise<WordList> {
  const store = listStore(ALICE)
  await store.saveList(makeList())
  const [list] = await next<WordList[]>((cb) => store.subscribeLists(cb, () => {}), (l) => l.length === 1)
  await store.dispose()
  return list!
}

async function listAs(uid: string, id = 'l1'): Promise<WordList> {
  const store = listStore(uid)
  const lists = await next<WordList[]>((cb) => store.subscribeLists(cb, () => {}), (l) => l.some((x) => x.id === id))
  await store.dispose()
  return lists.find((l) => l.id === id)!
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-practice-vocabulary',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => testEnv.cleanup())
beforeEach(() => testEnv.clearFirestore())

describe('making a link', () => {
  it("creates a link with a preview, readable signed out, listed for its creator", async () => {
    const list = await aliceList()
    const created = await shareStore(ALICE).createLink(list, { role: 'viewer', label: ' For Bob ', maxUses: 1 })
    expect(created.ok).toBe(true)
    const link = (created as { link: ShareLink }).link
    expect(link.code).toMatch(/^[A-Za-z0-9_-]{22}$/)

    const seen = await readLink(servicesFor(null), link.code)
    expect(seen).toMatchObject({
      listId: 'l1',
      role: 'viewer',
      label: 'For Bob',
      uses: 0,
      preview: { listName: 'French verbs', ownerName: 'Alice', wordCount: 2, col1Lang: 'en', col2Lang: 'fr' },
    })
    expect(Math.abs(seen!.createdAt - Date.now())).toBeLessThan(60_000)

    const store = shareStore(ALICE)
    const links = await next<ShareLink[]>((cb) => store.subscribeLinks('l1', cb, () => {}), (l) => l.length === 1)
    expect(links[0]!.code).toBe(link.code)
    await store.dispose()
  })

  it('a link that does not exist reads as null', async () => {
    expect(await readLink(servicesFor(null), 'nope')).toBeNull()
  })

  it('refuses a link for a list the caller does not own', async () => {
    const list = await aliceList()
    expect(await shareStore(BOB).createLink(list, { role: 'editor', label: null, maxUses: 1 })).toEqual({
      ok: false,
      reason: 'permission',
    })
  })
})

describe('joining', () => {
  async function linkFor(role: 'editor' | 'viewer' = 'editor', maxUses = 1) {
    const list = await aliceList()
    const created = await shareStore(ALICE).createLink(list, { role, label: 'For Bob', maxUses })
    return (created as { link: ShareLink }).link
  }

  it('adds the joiner with the link’s role, and both see each other', async () => {
    const link = await linkFor('viewer')
    expect(await shareStore(BOB).join(link.code)).toEqual({ ok: true, listId: 'l1', already: false })

    const bobsView = await listAs(BOB)
    expect(bobsView.sharing!.memberUids).toEqual([ALICE, BOB])
    expect(bobsView.sharing!.members[BOB]).toMatchObject({ role: 'viewer', viaLink: link.code, viaLabel: 'For Bob', displayName: 'Bob' })
    const alicesView = await listAs(ALICE)
    expect(alicesView.sharing!.members[BOB]!.role).toBe('viewer')
    expect((await readLink(servicesFor(null), link.code))!.uses).toBe(1)
  })

  it('a one-person link is used up by the first person in', async () => {
    const link = await linkFor()
    await shareStore(BOB).join(link.code)
    expect(await shareStore(CAROL).join(link.code)).toEqual({ ok: false, reason: 'used' })
  })

  it('a group link takes several people', async () => {
    const link = await linkFor('viewer', 5)
    expect((await shareStore(BOB).join(link.code)).ok).toBe(true)
    expect((await shareStore(CAROL).join(link.code)).ok).toBe(true)
    expect((await listAs(ALICE)).sharing!.memberUids).toEqual([ALICE, BOB, CAROL])
  })

  it('opening a link for a list I am already in just opens it', async () => {
    const link = await linkFor('viewer', 5)
    await shareStore(BOB).join(link.code)
    expect(await shareStore(BOB).join(link.code)).toEqual({ ok: true, listId: 'l1', already: true })
    expect((await readLink(servicesFor(null), link.code))!.uses).toBe(1)
  })

  it('says so for my own link, a cancelled one, a declined one and an expired one', async () => {
    const link = await linkFor()
    expect(await shareStore(ALICE).join(link.code)).toEqual({ ok: false, reason: 'own' })

    expect(await shareStore(BOB).decline(link.code)).toEqual({ ok: true })
    expect(await shareStore(CAROL).join(link.code)).toEqual({ ok: false, reason: 'declined' })

    expect(await shareStore(ALICE).cancelLink(link.code)).toEqual({ ok: true })
    expect(await shareStore(BOB).join(link.code)).toEqual({ ok: false, reason: 'unavailable' })

    const { code: _code, ...stored } = link
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'shareLinks/old'), {
        ...stored,
        declined: false,
        createdAt: Timestamp.fromMillis(Date.now() - 15 * 24 * 3600 * 1000),
      })
    })
    expect(await shareStore(BOB).join('old')).toEqual({ ok: false, reason: 'expired' })
  })
})

describe('members', () => {
  async function shared(): Promise<WordList> {
    const list = await aliceList()
    const bob = await shareStore(ALICE).createLink(list, { role: 'editor', label: null, maxUses: 2 })
    const code = (bob as { link: ShareLink }).link.code
    await shareStore(BOB).join(code)
    await shareStore(CAROL).join(code)
    return listAs(ALICE)
  }

  it('the owner changes a role', async () => {
    const list = await shared()
    expect(await shareStore(ALICE).setRole(list, BOB, 'viewer')).toEqual({ ok: true })
    expect((await listAs(BOB)).sharing!.members[BOB]!.role).toBe('viewer')
  })

  it('removing a member leaves them a farewell holding the list as they last saw it', async () => {
    const list = await shared()
    expect(await shareStore(ALICE).removeMember(list, BOB)).toEqual({ ok: true })
    expect((await listAs(ALICE)).sharing!.memberUids).toEqual([ALICE, CAROL])

    const store = shareStore(BOB)
    const [farewell] = await next<Farewell[]>((cb) => store.subscribeFarewells(cb, () => {}), (f) => f.length === 1)
    expect(farewell).toMatchObject({ reason: 'removed', byName: 'Alice', listId: 'l1' })
    expect(farewell!.list.pairs).toHaveLength(2)
    expect(farewell!.list).not.toHaveProperty('sharing')
    await store.dispose()
  })

  it('keeping a copy makes a new private list that remembers the original, and re-points saved tests', async () => {
    const list = await shared()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${BOB}/tests/t1`), {
        name: 'Mixed',
        spec: { listIds: ['l1', 'other'], source: 'all' },
        createdAt: 1,
        updatedAt: 1,
      })
    })
    await shareStore(ALICE).removeMember(list, BOB)
    const store = shareStore(BOB)
    const [farewell] = await next<Farewell[]>((cb) => store.subscribeFarewells(cb, () => {}), (f) => f.length === 1)
    expect(await store.keepCopy(farewell!)).toEqual({ ok: true })
    await store.dispose()

    const bobs = listStore(BOB)
    const [copy] = await next<WordList[]>((cb) => bobs.subscribeLists(cb, () => {}), (l) => l.length === 1)
    await bobs.dispose()
    expect(copy!.id).not.toBe('l1')
    expect(copy!.previousIds).toEqual(['l1'])
    expect(copy!.name).toBe('French verbs')
    expect(copy!.sharing!.memberUids).toEqual([BOB])
    expect(await readAs(`users/${BOB}/tests/t1`)).toMatchObject({ spec: { listIds: [copy!.id, 'other'] } })
    expect(await readAs(`listFarewells/l1_${BOB}`)).toBeUndefined()
  })

  it('a member leaves, with or without a copy', async () => {
    const list = await shared()
    expect(await shareStore(BOB).leave(await listAs(BOB), { keepCopy: true })).toEqual({ ok: true })
    expect(await shareStore(CAROL).leave(await listAs(CAROL), { keepCopy: false })).toEqual({ ok: true })
    expect((await listAs(ALICE)).sharing!.memberUids).toEqual([ALICE])
    const bobs = listStore(BOB)
    const [copy] = await next<WordList[]>((cb) => bobs.subscribeLists(cb, () => {}), (x) => x.length === 1)
    await bobs.dispose()
    expect(copy!.id).not.toBe(list.id)
    expect(copy!.previousIds).toEqual([list.id])
  })

  it('stopping sharing removes everyone else, leaves them farewells, and ends every link', async () => {
    const list = await shared()
    const extra = await shareStore(ALICE).createLink(list, { role: 'viewer', label: null, maxUses: 1 })
    expect(await shareStore(ALICE).stopSharing(list)).toEqual({ ok: true })

    const after = await listAs(ALICE)
    expect(after.id).toBe('l1')
    expect(after.sharing!.memberUids).toEqual([ALICE])
    expect(await readAs(`listFarewells/l1_${BOB}`)).toMatchObject({ reason: 'stopped' })
    expect(await readAs(`listFarewells/l1_${CAROL}`)).toMatchObject({ reason: 'stopped' })
    expect(await readLink(servicesFor(null), (extra as { link: ShareLink }).link.code)).toBeNull()
  })

  it('a "Can practise" member cannot change roles or remove anyone', async () => {
    const list = await shared()
    await shareStore(ALICE).setRole(list, CAROL, 'viewer')
    const carols = await listAs(CAROL)
    expect(await shareStore(CAROL).setRole(carols, BOB, 'viewer')).toEqual({ ok: false, reason: 'permission' })
    expect(await shareStore(CAROL).removeMember(carols, BOB)).toEqual({ ok: false, reason: 'permission' })
  })
})
