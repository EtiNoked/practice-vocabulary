import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

/**
 * The `lists`, `shareLinks` and `listFarewells` rules (016).
 *
 * `lists` read is the rule that matters most in the whole file: since 016 it is the ONLY thing
 * keeping every private list private, where before the path did it. So the deny cases come
 * first and outnumber the allow cases, as the header of firestore.rules asks.
 *
 * Requires the Firestore emulator. Run via `npm run test:rules`.
 */

let testEnv: RulesTestEnvironment

const ALICE = 'alice'
const BOB = 'bob'
const CAROL = 'carol'
const DAVE = 'dave'

const DAY = 24 * 60 * 60 * 1000

function member(role: 'owner' | 'editor' | 'viewer', name: string, viaLink?: string) {
  return {
    role,
    displayName: name,
    email: `${name.toLowerCase()}@example.com`,
    photoURL: null,
    joinedAt: 1,
    ...(viaLink ? { viaLink } : {}),
  }
}

function privateList(owner: string, extra: Record<string, unknown> = {}) {
  return {
    name: 'Lesson 3',
    pairs: [{ id: 'p1', col1: 'daughter', col2: 'dochter' }],
    col1Lang: 'en',
    col2Lang: 'nl',
    langSource: 'manual',
    origin: 'manual',
    createdAt: 1,
    updatedAt: 1,
    ownerUid: owner,
    memberUids: [owner],
    members: { [owner]: member('owner', owner) },
    updatedBy: owner,
    ...extra,
  }
}

/** Alice owns it; Bob can edit; Carol can practise. */
function sharedList() {
  return {
    ...privateList(ALICE),
    memberUids: [ALICE, BOB, CAROL],
    members: {
      [ALICE]: member('owner', 'Alice'),
      [BOB]: member('editor', 'Bob', 'old-link'),
      [CAROL]: member('viewer', 'Carol', 'old-link-2'),
    },
  }
}

function link(extra: Record<string, unknown> = {}) {
  return {
    listId: 'l1',
    role: 'editor',
    label: null,
    maxUses: 1,
    uses: 0,
    declined: false,
    createdByUid: ALICE,
    createdAt: Timestamp.now(),
    preview: { listName: 'Lesson 3', ownerName: 'Alice', wordCount: 1, col1Lang: 'en', col2Lang: 'nl' },
    ...extra,
  }
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

const as = (uid: string) => testEnv.authenticatedContext(uid).firestore()
const asAnon = () => testEnv.unauthenticatedContext().firestore()

async function seed(path: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })
}

/** The join batch exactly as the client sends it. */
function joinBatch(db: Firestore, uid: string, code: string, role: string, memberUids: string[]) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'lists/l1'), {
    memberUids: [...memberUids, uid],
    [`members.${uid}`]: member(role as 'editor', uid, code),
  })
  batch.update(doc(db, `shareLinks/${code}`), { uses: 1 })
  return batch.commit()
}

// ---------------------------------------------------------------------------------------------

describe('lists — privacy (the rule every private list now depends on)', () => {
  beforeEach(() => seed('lists/l1', privateList(ALICE)))

  it('REFUSES a signed-in stranger reading a private list', async () => {
    await assertFails(getDoc(doc(as(BOB), 'lists/l1')))
  })

  it('REFUSES an unauthenticated client reading it', async () => {
    await assertFails(getDoc(doc(asAnon(), 'lists/l1')))
  })

  it('REFUSES a query over lists without the membership filter', async () => {
    await assertFails(getDocs(collection(as(BOB), 'lists')))
    await assertFails(getDocs(collection(as(ALICE), 'lists')))
  })

  it("REFUSES a query filtered on SOMEONE ELSE's uid", async () => {
    await assertFails(
      getDocs(query(collection(as(BOB), 'lists'), where('memberUids', 'array-contains', ALICE))),
    )
  })

  it('REFUSES a stranger writing, renaming or deleting it', async () => {
    await assertFails(updateDoc(doc(as(BOB), 'lists/l1'), { name: 'Mine now', updatedBy: BOB }))
    await assertFails(setDoc(doc(as(BOB), 'lists/l1'), privateList(BOB)))
    await assertFails(deleteDoc(doc(as(BOB), 'lists/l1')))
  })

  it('REFUSES a stranger adding themself as a member without a link', async () => {
    await assertFails(
      updateDoc(doc(as(BOB), 'lists/l1'), {
        memberUids: [ALICE, BOB],
        [`members.${BOB}`]: member('editor', 'Bob'),
      }),
    )
  })

  it('lets the owner read it, alone, and query their own lists', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'lists/l1')))
    await assertSucceeds(
      getDocs(query(collection(as(ALICE), 'lists'), where('memberUids', 'array-contains', ALICE))),
    )
  })

  it('a removed member can no longer read it', async () => {
    await seed('lists/l2', { ...sharedList() })
    await assertSucceeds(getDoc(doc(as(BOB), 'lists/l2')))
    await updateDoc(doc(as(ALICE), 'lists/l2'), {
      memberUids: [ALICE, CAROL],
      members: { [ALICE]: member('owner', 'Alice'), [CAROL]: member('viewer', 'Carol', 'old-link-2') },
    })
    await assertFails(getDoc(doc(as(BOB), 'lists/l2')))
  })
})

describe('lists — creating', () => {
  it('lets a user create a list with themself as the only member and owner', async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), 'lists/l1'), privateList(ALICE)))
  })

  it('accepts previousIds on a kept copy', async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), 'lists/l1'), privateList(ALICE, { previousIds: ['old'] })))
  })

  it('REFUSES creating a list owned by someone else', async () => {
    await assertFails(setDoc(doc(as(BOB), 'lists/l1'), privateList(ALICE)))
  })

  it('REFUSES creating a list with a second member already in it', async () => {
    await assertFails(
      setDoc(doc(as(ALICE), 'lists/l1'), {
        ...privateList(ALICE),
        memberUids: [ALICE, BOB],
        members: { [ALICE]: member('owner', 'Alice'), [BOB]: member('editor', 'Bob') },
      }),
    )
  })

  it('REFUSES a list with no membership fields at all (the pre-016 shape)', async () => {
    await assertFails(
      setDoc(doc(as(ALICE), 'lists/l1'), { name: 'Old', pairs: [], createdAt: 1, updatedAt: 1 }),
    )
  })

  it('REFUSES an owner whose member entry is not the owner role', async () => {
    await assertFails(
      setDoc(doc(as(ALICE), 'lists/l1'), privateList(ALICE, { members: { [ALICE]: member('editor', 'A') } })),
    )
  })

  it('REFUSES members that do not match memberUids', async () => {
    await assertFails(
      setDoc(
        doc(as(ALICE), 'lists/l1'),
        privateList(ALICE, {
          members: { [ALICE]: member('owner', 'Alice'), [BOB]: member('editor', 'Bob') },
        }),
      ),
    )
  })

  it('REFUSES updatedBy naming someone else', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'lists/l1'), privateList(ALICE, { updatedBy: BOB })))
  })

  it('keeps the 003 caps: 500 pairs, a 200-character non-empty name, pairs a list', async () => {
    const pairs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, col1: 'a', col2: 'b' }))
    await assertSucceeds(setDoc(doc(as(ALICE), 'lists/ok'), privateList(ALICE, { pairs: pairs(500) })))
    await assertFails(setDoc(doc(as(ALICE), 'lists/big'), privateList(ALICE, { pairs: pairs(501) })))
    await assertFails(setDoc(doc(as(ALICE), 'lists/n1'), privateList(ALICE, { name: 'x'.repeat(201) })))
    await assertFails(setDoc(doc(as(ALICE), 'lists/n2'), privateList(ALICE, { name: '' })))
    await assertFails(setDoc(doc(as(ALICE), 'lists/n3'), privateList(ALICE, { pairs: 'nope' })))
  })
})

describe('lists — editing content', () => {
  beforeEach(() => seed('lists/l1', sharedList()))

  it('lets the owner and an editor edit the words, saying who they are', async () => {
    await assertSucceeds(updateDoc(doc(as(ALICE), 'lists/l1'), { name: 'A', updatedBy: ALICE, updatedAt: 2 }))
    await assertSucceeds(updateDoc(doc(as(BOB), 'lists/l1'), { name: 'B', updatedBy: BOB, updatedAt: 3 }))
  })

  it('lets any member read it', async () => {
    await assertSucceeds(getDoc(doc(as(BOB), 'lists/l1')))
    await assertSucceeds(getDoc(doc(as(CAROL), 'lists/l1')))
  })

  it('REFUSES a "Can practise" member editing', async () => {
    await assertFails(updateDoc(doc(as(CAROL), 'lists/l1'), { name: 'C', updatedBy: CAROL }))
  })

  it('REFUSES an edit that does not set updatedBy to the editor', async () => {
    await assertFails(updateDoc(doc(as(BOB), 'lists/l1'), { name: 'B' }))
    await assertFails(updateDoc(doc(as(BOB), 'lists/l1'), { name: 'B', updatedBy: ALICE }))
  })

  it('REFUSES an editor changing roles, members or the owner', async () => {
    await assertFails(updateDoc(doc(as(BOB), 'lists/l1'), { [`members.${BOB}.role`]: 'owner' }))
    await assertFails(updateDoc(doc(as(BOB), 'lists/l1'), { ownerUid: BOB }))
    await assertFails(
      updateDoc(doc(as(BOB), 'lists/l1'), {
        memberUids: [ALICE, BOB],
        members: { [ALICE]: member('owner', 'Alice'), [BOB]: member('editor', 'Bob', 'old-link') },
      }),
    )
  })

  it("REFUSES an editor's whole-document write that would rewrite members", async () => {
    // The adapter never does this; the rule is what makes a stale setDoc fail rather than
    // silently undo a concurrent join.
    const stale = { ...privateList(ALICE), name: 'Stale', updatedBy: BOB }
    await assertFails(setDoc(doc(as(BOB), 'lists/l1'), stale))
  })

  it('REFUSES the edit caps being broken by a member', async () => {
    await assertFails(updateDoc(doc(as(BOB), 'lists/l1'), { name: '', updatedBy: BOB }))
  })

  it('lets only the owner delete it', async () => {
    await assertFails(deleteDoc(doc(as(BOB), 'lists/l1')))
    await assertFails(deleteDoc(doc(as(CAROL), 'lists/l1')))
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'lists/l1')))
  })
})

describe('lists — leaving and managing members', () => {
  beforeEach(() => seed('lists/l1', sharedList()))

  it('lets a member leave, removing exactly themself', async () => {
    await assertSucceeds(
      updateDoc(doc(as(CAROL), 'lists/l1'), {
        memberUids: [ALICE, BOB],
        members: { [ALICE]: member('owner', 'Alice'), [BOB]: member('editor', 'Bob', 'old-link') },
      }),
    )
  })

  it('REFUSES a member removing someone else while leaving', async () => {
    await assertFails(
      updateDoc(doc(as(CAROL), 'lists/l1'), {
        memberUids: [ALICE],
        members: { [ALICE]: member('owner', 'Alice') },
      }),
    )
  })

  it('REFUSES the owner "leaving" their own list', async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), 'lists/l1'), {
        memberUids: [BOB, CAROL],
        members: { [BOB]: member('editor', 'Bob', 'old-link'), [CAROL]: member('viewer', 'Carol', 'old-link-2') },
      }),
    )
  })

  it('lets the owner change a role and remove a member', async () => {
    await assertSucceeds(updateDoc(doc(as(ALICE), 'lists/l1'), { [`members.${CAROL}.role`]: 'editor' }))
    await assertSucceeds(
      updateDoc(doc(as(ALICE), 'lists/l1'), {
        memberUids: [ALICE, CAROL],
        members: { [ALICE]: member('owner', 'Alice'), [CAROL]: member('editor', 'Carol', 'old-link-2') },
      }),
    )
  })

  it('REFUSES the owner adding someone who never joined', async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), 'lists/l1'), {
        memberUids: [ALICE, BOB, CAROL, DAVE],
        [`members.${DAVE}`]: member('editor', 'Dave'),
      }),
    )
  })

  it('lets the owner hand the list to a member (account deletion)', async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), 'lists/l1'), {
        ownerUid: BOB,
        memberUids: [BOB, CAROL],
        members: { [BOB]: member('owner', 'Bob', 'old-link'), [CAROL]: member('viewer', 'Carol', 'old-link-2') },
      }),
    )
  })

  it('REFUSES handing the list to someone who is not a member', async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), 'lists/l1'), {
        ownerUid: DAVE,
        memberUids: [DAVE],
        members: { [DAVE]: member('owner', 'Dave') },
      }),
    )
  })

  it('REFUSES a new owner who is not given the owner role', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'lists/l1'), { ownerUid: BOB }))
  })
})

// ---------------------------------------------------------------------------------------------

describe('shareLinks — creating and reading', () => {
  beforeEach(() => seed('lists/l1', privateList(ALICE)))

  const fresh = (extra: Record<string, unknown> = {}) => link({ createdAt: serverTimestamp(), ...extra })

  it('lets the owner create a link for their list', async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), 'shareLinks/c1'), fresh()))
    await assertSucceeds(setDoc(doc(as(ALICE), 'shareLinks/c2'), fresh({ role: 'viewer', maxUses: 20, label: 'Class 4B' })))
  })

  it('REFUSES a non-owner creating a link', async () => {
    await seed('lists/l2', sharedList())
    await assertFails(setDoc(doc(as(BOB), 'shareLinks/c1'), fresh({ listId: 'l2', createdByUid: BOB })))
    await assertFails(setDoc(doc(as(DAVE), 'shareLinks/c1'), fresh({ createdByUid: DAVE })))
  })

  it('REFUSES a link claiming to be made by someone else', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'shareLinks/c1'), fresh({ createdByUid: BOB })))
  })

  it('REFUSES an owner role, pre-used links, bad limits and client clocks', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'shareLinks/a'), fresh({ role: 'owner' })))
    await assertFails(setDoc(doc(as(ALICE), 'shareLinks/b'), fresh({ uses: 1 })))
    await assertFails(setDoc(doc(as(ALICE), 'shareLinks/c'), fresh({ declined: true })))
    await assertFails(setDoc(doc(as(ALICE), 'shareLinks/d'), fresh({ maxUses: 0 })))
    await assertFails(setDoc(doc(as(ALICE), 'shareLinks/e'), fresh({ maxUses: 21 })))
    await assertFails(setDoc(doc(as(ALICE), 'shareLinks/f'), fresh({ createdAt: Timestamp.now() })))
    await assertFails(setDoc(doc(as(ALICE), 'shareLinks/g'), fresh({ label: 'x'.repeat(61) })))
  })

  it('lets ANYONE with the code read it, even signed out (the join screen preview)', async () => {
    await seed('shareLinks/c1', link())
    await assertSucceeds(getDoc(doc(asAnon(), 'shareLinks/c1')))
    await assertSucceeds(getDoc(doc(as(DAVE), 'shareLinks/c1')))
  })

  it('REFUSES browsing links: signed out, as a stranger, or without the creator filter', async () => {
    await seed('shareLinks/c1', link())
    await assertFails(getDocs(collection(asAnon(), 'shareLinks')))
    await assertFails(getDocs(collection(as(DAVE), 'shareLinks')))
    await assertFails(getDocs(collection(as(ALICE), 'shareLinks')))
    await assertSucceeds(
      getDocs(query(collection(as(ALICE), 'shareLinks'), where('createdByUid', '==', ALICE))),
    )
  })

  it('lets only the creator cancel (delete) a link', async () => {
    await seed('shareLinks/c1', link())
    await assertFails(deleteDoc(doc(as(DAVE), 'shareLinks/c1')))
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'shareLinks/c1')))
  })

  it('lets someone decline a one-person link, and nothing else', async () => {
    await seed('shareLinks/c1', link())
    await seed('shareLinks/c2', link({ maxUses: 5 }))
    await assertFails(updateDoc(doc(as(DAVE), 'shareLinks/c1'), { declined: true, role: 'viewer' }))
    await assertFails(updateDoc(doc(as(DAVE), 'shareLinks/c2'), { declined: true }))
    await assertSucceeds(updateDoc(doc(as(DAVE), 'shareLinks/c1'), { declined: true }))
  })

  it('REFUSES bumping uses without joining', async () => {
    await seed('shareLinks/c1', link())
    await assertFails(updateDoc(doc(as(DAVE), 'shareLinks/c1'), { uses: 1 }))
  })
})

describe('joining through a link', () => {
  beforeEach(() => seed('lists/l1', privateList(ALICE)))

  it('lets anyone signed in join with a live link, taking its role', async () => {
    await seed('shareLinks/c1', link({ role: 'viewer' }))
    await assertSucceeds(joinBatch(as(DAVE), DAVE, 'c1', 'viewer', [ALICE]))
    await assertSucceeds(getDoc(doc(as(DAVE), 'lists/l1')))
  })

  it('REFUSES joining with a role other than the link grants', async () => {
    await seed('shareLinks/c1', link({ role: 'viewer' }))
    await assertFails(joinBatch(as(DAVE), DAVE, 'c1', 'editor', [ALICE]))
  })

  it('REFUSES the list half of the join on its own', async () => {
    await seed('shareLinks/c1', link())
    await assertFails(
      updateDoc(doc(as(DAVE), 'lists/l1'), {
        memberUids: [ALICE, DAVE],
        [`members.${DAVE}`]: member('editor', 'Dave', 'c1'),
      }),
    )
  })

  it('REFUSES a link for a different list', async () => {
    await seed('shareLinks/c1', link({ listId: 'other' }))
    await assertFails(joinBatch(as(DAVE), DAVE, 'c1', 'editor', [ALICE]))
  })

  it('REFUSES an expired, declined, used-up or cancelled link', async () => {
    await seed('shareLinks/old', link({ createdAt: Timestamp.fromMillis(Date.now() - 15 * DAY) }))
    await assertFails(joinBatch(as(DAVE), DAVE, 'old', 'editor', [ALICE]))

    await seed('shareLinks/no', link({ declined: true }))
    await assertFails(joinBatch(as(DAVE), DAVE, 'no', 'editor', [ALICE]))

    await seed('shareLinks/used', link({ uses: 1 }))
    await assertFails(joinBatch(as(DAVE), DAVE, 'used', 'editor', [ALICE]))

    await assertFails(joinBatch(as(DAVE), DAVE, 'never-existed', 'editor', [ALICE]))
  })

  it('lets exactly one of two people racing for a one-person link in', async () => {
    await seed('shareLinks/c1', link())
    await assertSucceeds(joinBatch(as(DAVE), DAVE, 'c1', 'editor', [ALICE]))
    await assertFails(joinBatch(as(CAROL), CAROL, 'c1', 'editor', [ALICE, DAVE]))
  })

  it('lets a group link take several people, up to its limit', async () => {
    await seed('shareLinks/g', link({ maxUses: 2 }))
    await assertSucceeds(joinBatch(as(DAVE), DAVE, 'g', 'editor', [ALICE]))
    const db = as(CAROL)
    const batch = writeBatch(db)
    batch.update(doc(db, 'lists/l1'), {
      memberUids: [ALICE, DAVE, CAROL],
      [`members.${CAROL}`]: member('editor', 'Carol', 'g'),
    })
    batch.update(doc(db, 'shareLinks/g'), { uses: 2 })
    await assertSucceeds(batch.commit())
  })

  it('REFUSES joining twice', async () => {
    await seed('shareLinks/g', link({ maxUses: 5 }))
    await assertSucceeds(joinBatch(as(DAVE), DAVE, 'g', 'editor', [ALICE]))
    await assertFails(joinBatch(as(DAVE), DAVE, 'g', 'editor', [ALICE, DAVE]))
  })

  it('REFUSES a join that also changes the words or another member', async () => {
    await seed('shareLinks/c1', link())
    const db = as(DAVE)
    const batch = writeBatch(db)
    batch.update(doc(db, 'lists/l1'), {
      name: 'Hijacked',
      memberUids: [ALICE, DAVE],
      [`members.${DAVE}`]: member('editor', 'Dave', 'c1'),
    })
    batch.update(doc(db, 'shareLinks/c1'), { uses: 1 })
    await assertFails(batch.commit())
  })

  it('REFUSES a 21st member', async () => {
    const uids = [ALICE, ...Array.from({ length: 19 }, (_, i) => `m${i}`)]
    await seed('lists/l1', {
      ...privateList(ALICE),
      memberUids: uids,
      members: Object.fromEntries(uids.map((u) => [u, member(u === ALICE ? 'owner' : 'viewer', u)])),
    })
    await seed('shareLinks/c1', link())
    await assertFails(joinBatch(as(DAVE), DAVE, 'c1', 'editor', uids))
  })

  it('lets someone rejoin with a new link after leaving', async () => {
    await seed('shareLinks/c1', link())
    await assertSucceeds(joinBatch(as(DAVE), DAVE, 'c1', 'editor', [ALICE]))
    await assertSucceeds(
      updateDoc(doc(as(DAVE), 'lists/l1'), { memberUids: [ALICE], members: { [ALICE]: member('owner', ALICE) } }),
    )
    await seed('shareLinks/c2', link())
    await assertSucceeds(joinBatch(as(DAVE), DAVE, 'c2', 'editor', [ALICE]))
  })
})

// ---------------------------------------------------------------------------------------------

describe('listFarewells — keep-a-copy offers', () => {
  const farewell = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    listId: 'l1',
    reason: 'removed',
    byName: 'Alice',
    at: 1,
    list: { name: 'Lesson 3', pairs: [] },
    ...extra,
  })

  beforeEach(() => seed('lists/l1', sharedList()))

  it('lets the owner leave one for a current member', async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), `listFarewells/l1_${BOB}`), farewell(BOB)))
  })

  it('lets the owner write it in the same batch that removes the member', async () => {
    const db = as(ALICE)
    const batch = writeBatch(db)
    batch.update(doc(db, 'lists/l1'), {
      memberUids: [ALICE, CAROL],
      members: { [ALICE]: member('owner', 'Alice'), [CAROL]: member('viewer', 'Carol', 'old-link-2') },
    })
    batch.set(doc(db, `listFarewells/l1_${BOB}`), farewell(BOB))
    await assertSucceeds(batch.commit())
  })

  it('REFUSES one written by a non-owner, for a non-member, or under the wrong id', async () => {
    await assertFails(setDoc(doc(as(BOB), `listFarewells/l1_${CAROL}`), farewell(CAROL)))
    await assertFails(setDoc(doc(as(ALICE), `listFarewells/l1_${DAVE}`), farewell(DAVE)))
    await assertFails(setDoc(doc(as(ALICE), `listFarewells/whatever`), farewell(BOB)))
    await assertFails(setDoc(doc(as(ALICE), `listFarewells/l1_${ALICE}`), farewell(ALICE)))
  })

  it('lets only its addressee read and dismiss it', async () => {
    await seed(`listFarewells/l1_${BOB}`, farewell(BOB))
    await assertFails(getDoc(doc(as(CAROL), `listFarewells/l1_${BOB}`)))
    await assertFails(getDoc(doc(as(ALICE), `listFarewells/l1_${BOB}`)))
    await assertFails(deleteDoc(doc(as(CAROL), `listFarewells/l1_${BOB}`)))
    await assertSucceeds(
      getDocs(query(collection(as(BOB), 'listFarewells'), where('uid', '==', BOB))),
    )
    await assertSucceeds(deleteDoc(doc(as(BOB), `listFarewells/l1_${BOB}`)))
  })
})
