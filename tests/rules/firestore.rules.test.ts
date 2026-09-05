import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

/**
 * The rules are the only server-side check this app has, so these tests exist
 * mainly for the DENY cases. An allow-only suite proves nothing: it would pass
 * just as happily against `allow read, write: if true`.
 *
 * Requires the Firestore emulator (and therefore a JRE). Run via `npm run test:rules`.
 */

let testEnv: RulesTestEnvironment

const ALICE = 'alice'
const BOB = 'bob'

const aList = { name: 'Lesson 3', pairs: [{ id: 'p1', col1: 'daughter', col2: 'dochter' }] }
const aSession = { listId: 'l1', listName: 'Lesson 3', finishedAt: 123, right: 1, wrong: 0 }

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

const asAlice = () => testEnv.authenticatedContext(ALICE).firestore()
const asBob = () => testEnv.authenticatedContext(BOB).firestore()
const asAnon = () => testEnv.unauthenticatedContext().firestore()

describe('lists — the owner', () => {
  it('can create, read, update and delete their own list', async () => {
    const db = asAlice()
    const ref = doc(db, `users/${ALICE}/lists/l1`)
    await assertSucceeds(setDoc(ref, aList))
    await assertSucceeds(getDoc(ref))
    await assertSucceeds(setDoc(ref, { ...aList, name: 'Renamed' }))
    await assertSucceeds(deleteDoc(ref))
  })

  it('can list their own lists collection', async () => {
    await assertSucceeds(getDocs(collection(asAlice(), `users/${ALICE}/lists`)))
  })
})

describe('lists — another signed-in user', () => {
  it('cannot read them', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}/lists/l1`), aList)
    })
    await assertFails(getDoc(doc(asBob(), `users/${ALICE}/lists/l1`)))
  })

  it('cannot enumerate them', async () => {
    await assertFails(getDocs(collection(asBob(), `users/${ALICE}/lists`)))
  })

  it('cannot write into them', async () => {
    await assertFails(setDoc(doc(asBob(), `users/${ALICE}/lists/l1`), aList))
  })

  it('cannot delete them', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}/lists/l1`), aList)
    })
    await assertFails(deleteDoc(doc(asBob(), `users/${ALICE}/lists/l1`)))
  })
})

describe('lists — an unauthenticated client', () => {
  it('cannot read anything', async () => {
    await assertFails(getDoc(doc(asAnon(), `users/${ALICE}/lists/l1`)))
  })

  it('cannot write anything', async () => {
    await assertFails(setDoc(doc(asAnon(), `users/${ALICE}/lists/l1`), aList))
  })

  it('cannot reach an arbitrary unmatched path', async () => {
    // Proves there is no catch-all rule at the root.
    await assertFails(getDoc(doc(asAnon(), 'somethingElse/x')))
    await assertFails(setDoc(doc(asAnon(), 'somethingElse/x'), { a: 1 }))
  })
})

describe('lists — size and shape caps', () => {
  it('rejects a list with more than 500 pairs', async () => {
    const pairs = Array.from({ length: 501 }, (_, i) => ({ id: `p${i}`, col1: 'a', col2: 'b' }))
    await assertFails(setDoc(doc(asAlice(), `users/${ALICE}/lists/big`), { name: 'Big', pairs }))
  })

  it('accepts a list with exactly 500 pairs', async () => {
    const pairs = Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, col1: 'a', col2: 'b' }))
    await assertSucceeds(setDoc(doc(asAlice(), `users/${ALICE}/lists/ok`), { name: 'Ok', pairs }))
  })

  it('rejects an over-long name', async () => {
    await assertFails(
      setDoc(doc(asAlice(), `users/${ALICE}/lists/l1`), { ...aList, name: 'x'.repeat(201) }),
    )
  })

  it('rejects an empty name', async () => {
    await assertFails(setDoc(doc(asAlice(), `users/${ALICE}/lists/l1`), { ...aList, name: '' }))
  })

  it('rejects pairs that are not a list', async () => {
    await assertFails(
      setDoc(doc(asAlice(), `users/${ALICE}/lists/l1`), { name: 'x', pairs: 'nope' }),
    )
  })
})

describe('sessions — append-only', () => {
  it('lets the owner create and read a record', async () => {
    const ref = doc(asAlice(), `users/${ALICE}/sessions/s1`)
    await assertSucceeds(setDoc(ref, aSession))
    await assertSucceeds(getDoc(ref))
  })

  it('REJECTS an update to an existing record', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}/sessions/s1`), aSession)
    })
    // History is a log. Not even the owner may rewrite the past — this is the
    // rule that makes a client bug incapable of falsifying a score.
    await assertFails(updateDoc(doc(asAlice(), `users/${ALICE}/sessions/s1`), { right: 999 }))
    await assertFails(setDoc(doc(asAlice(), `users/${ALICE}/sessions/s1`), { ...aSession, right: 999 }))
  })

  it('lets the owner delete a record, so account deletion can work', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}/sessions/s1`), aSession)
    })
    await assertSucceeds(deleteDoc(doc(asAlice(), `users/${ALICE}/sessions/s1`)))
  })

  it('rejects a record with no finishedAt', async () => {
    await assertFails(
      setDoc(doc(asAlice(), `users/${ALICE}/sessions/s1`), { listId: 'l1', listName: 'x' }),
    )
  })

  it("blocks another user from reading or writing someone's history", async () => {
    await assertFails(getDoc(doc(asBob(), `users/${ALICE}/sessions/s1`)))
    await assertFails(setDoc(doc(asBob(), `users/${ALICE}/sessions/s1`), aSession))
  })
})

describe('user document — field whitelist', () => {
  const profile = {
    displayName: 'Alice',
    email: 'a@x.com',
    photoURL: null,
    createdAt: 1,
    lastSeenAt: 2,
  }

  it('accepts the whitelisted fields', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `users/${ALICE}`), profile))
  })

  it('accepts a subset of them', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), `users/${ALICE}`), { displayName: 'Alice' }))
  })

  it('REJECTS an unknown field', async () => {
    await assertFails(setDoc(doc(asAlice(), `users/${ALICE}`), { ...profile, isAdmin: true }))
  })

  it('blocks another user entirely', async () => {
    await assertFails(setDoc(doc(asBob(), `users/${ALICE}`), profile))
    await assertFails(getDoc(doc(asBob(), `users/${ALICE}`)))
  })

  it('lets the owner delete their own user document', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}`), profile)
    })
    await assertSucceeds(deleteDoc(doc(asAlice(), `users/${ALICE}`)))
  })
})
