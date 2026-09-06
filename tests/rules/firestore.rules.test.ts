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
const aGame = {
  finishedAt: 123,
  listIds: ['l1', 'l2'],
  listNames: ['Food', 'Market'],
  source: 'all',
  correct: 7,
  asked: 10,
  points: 52,
  available: 100,
  results: [
    { word: { id: 'w0', col1: 'bread', col2: 'brood', listId: 'l1', listName: 'Food' }, correct: true },
  ],
  partial: false,
}

const aTest = {
  name: 'Weak verbs',
  spec: { listIds: ['l1', 'l2'], source: 'missed' },
  count: 15,
  createdAt: 1,
  updatedAt: 2,
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

  /*
   * 006 added `rightPairs`, roughly doubling what a record weighs. Sessions had
   * no size cap at all — the lists collection has capped its pairs since 003, and
   * a record cannot legitimately be larger than the list it came from.
   *
   * Both arrays are capped IF PRESENT rather than required: `rightPairs` is
   * genuinely optional (absent on every pre-006 record and on any drill over the
   * MAX_RIGHT_PAIRS cap), and requiring `wrongPairs` would reject writes this
   * suite has always allowed without making anything safer.
   */
  const pairs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, col1: `en${i}`, col2: `nl${i}` }))

  it('accepts a record carrying its right answers', async () => {
    await assertSucceeds(
      setDoc(doc(asAlice(), `users/${ALICE}/sessions/s2`), {
        ...aSession,
        wrongPairs: pairs(2),
        rightPairs: pairs(3),
      }),
    )
  })

  it('accepts a record with no rightPairs, as every pre-006 record has', async () => {
    await assertSucceeds(
      setDoc(doc(asAlice(), `users/${ALICE}/sessions/s3`), { ...aSession, wrongPairs: pairs(2) }),
    )
  })

  it('REJECTS more than 500 wrong pairs', async () => {
    await assertFails(
      setDoc(doc(asAlice(), `users/${ALICE}/sessions/s4`), {
        ...aSession,
        wrongPairs: pairs(501),
      }),
    )
  })

  it('REJECTS more than 500 right pairs', async () => {
    await assertFails(
      setDoc(doc(asAlice(), `users/${ALICE}/sessions/s5`), {
        ...aSession,
        wrongPairs: pairs(1),
        rightPairs: pairs(501),
      }),
    )
  })

  it('REJECTS pairs that are not a list', async () => {
    await assertFails(
      setDoc(doc(asAlice(), `users/${ALICE}/sessions/s6`), {
        ...aSession,
        wrongPairs: 'nope',
      }),
    )
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

describe('games — append-only, and the owner’s alone', () => {
  it('lets the owner create and read a game', async () => {
    const ref = doc(asAlice(), `users/${ALICE}/games/g1`)
    await assertSucceeds(setDoc(ref, aGame))
    await assertSucceeds(getDoc(ref))
  })

  it('lets the owner list their games collection', async () => {
    await assertSucceeds(getDocs(collection(asAlice(), `users/${ALICE}/games`)))
  })

  it('lets the owner delete one, so account deletion can work', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}/games/g1`), aGame)
    })
    await assertSucceeds(deleteDoc(doc(asAlice(), `users/${ALICE}/games/g1`)))
  })

  it('REJECTS an update to an existing game', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}/games/g1`), aGame)
    })
    // A game is a log entry. Not even the owner may improve their score after the fact.
    await assertFails(updateDoc(doc(asAlice(), `users/${ALICE}/games/g1`), { points: 999 }))
    await assertFails(setDoc(doc(asAlice(), `users/${ALICE}/games/g1`), { ...aGame, points: 999 }))
  })

  it('accepts a game with no results at all — detail can legitimately be shed', async () => {
    const { results: _dropped, ...slim } = aGame
    await assertSucceeds(setDoc(doc(asAlice(), `users/${ALICE}/games/g2`), slim))
  })
})

describe('games — what the rules refuse', () => {
  it('REJECTS another signed-in user reading or writing', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}/games/g1`), aGame)
    })
    await assertFails(getDoc(doc(asBob(), `users/${ALICE}/games/g1`)))
    await assertFails(setDoc(doc(asBob(), `users/${ALICE}/games/g9`), aGame))
    await assertFails(deleteDoc(doc(asBob(), `users/${ALICE}/games/g1`)))
    await assertFails(getDocs(collection(asBob(), `users/${ALICE}/games`)))
  })

  it('REJECTS an anonymous visitor entirely', async () => {
    await assertFails(setDoc(doc(asAnon(), `users/${ALICE}/games/g1`), aGame))
    await assertFails(getDoc(doc(asAnon(), `users/${ALICE}/games/g1`)))
  })

  it('REJECTS a finishedAt that is not a number', async () => {
    await assertFails(
      setDoc(doc(asAlice(), `users/${ALICE}/games/g1`), { ...aGame, finishedAt: 'yesterday' }),
    )
  })

  it('REJECTS a missing finishedAt', async () => {
    const { finishedAt: _dropped, ...noDate } = aGame
    await assertFails(setDoc(doc(asAlice(), `users/${ALICE}/games/g1`), noDate))
  })

  it('REJECTS listIds that is not a list', async () => {
    await assertFails(setDoc(doc(asAlice(), `users/${ALICE}/games/g1`), { ...aGame, listIds: 'l1' }))
  })

  it('REJECTS an absurd number of source lists', async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `l${i}`)
    await assertFails(setDoc(doc(asAlice(), `users/${ALICE}/games/g1`), { ...aGame, listIds: tooMany }))
  })

  it('REJECTS an unbounded results array', async () => {
    // The blast-radius cap: one client bug must not be able to write a huge document.
    const huge = Array.from({ length: 101 }, () => aGame.results[0])
    await assertFails(setDoc(doc(asAlice(), `users/${ALICE}/games/g1`), { ...aGame, results: huge }))
  })

  it('REJECTS results that is not a list', async () => {
    await assertFails(setDoc(doc(asAlice(), `users/${ALICE}/games/g1`), { ...aGame, results: 'lots' }))
  })
})

describe('tests — a document, not a log', () => {
  it('lets the owner create, read, update and delete their own saved test', async () => {
    const ref = doc(asAlice(), 'users/alice/tests/t1')
    await assertSucceeds(setDoc(ref, aTest))
    await assertSucceeds(getDoc(ref))
    // The one thing sessions and games forbid: a saved test is meant to be edited.
    await assertSucceeds(updateDoc(ref, { name: 'Weak verbs, harder', updatedAt: 3 }))
    await assertSucceeds(deleteDoc(ref))
  })

  it('lets the owner list their own tests', async () => {
    await assertSucceeds(getDocs(collection(asAlice(), 'users/alice/tests')))
  })
})

describe('tests — what the rules refuse', () => {
  it('refuses another signed-in user everything', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/tests/t1'), aTest)
    })
    const bob = asBob()
    await assertFails(getDoc(doc(bob, 'users/alice/tests/t1')))
    await assertFails(setDoc(doc(bob, 'users/alice/tests/t2'), aTest))
    await assertFails(updateDoc(doc(bob, 'users/alice/tests/t1'), { name: 'mine now' }))
    await assertFails(deleteDoc(doc(bob, 'users/alice/tests/t1')))
  })

  it('refuses an unauthenticated client', async () => {
    await assertFails(setDoc(doc(asAnon(), 'users/alice/tests/t1'), aTest))
    await assertFails(getDoc(doc(asAnon(), 'users/alice/tests/t1')))
  })

  it('refuses a nameless test', async () => {
    await assertFails(setDoc(doc(asAlice(), 'users/alice/tests/t1'), { ...aTest, name: '' }))
  })

  it('refuses a name beyond the cap', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'users/alice/tests/t1'), { ...aTest, name: 'x'.repeat(201) }),
    )
  })

  it('refuses a spec whose listIds is not a list', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'users/alice/tests/t1'), {
        ...aTest,
        spec: { listIds: 'l1', source: 'all' },
      }),
    )
  })

  it('refuses a spec naming more lists than anyone has', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'users/alice/tests/t1'), {
        ...aTest,
        spec: { listIds: Array.from({ length: 21 }, (_, i) => `l${i}`), source: 'all' },
      }),
    )
  })

  it('refuses an update that empties the name', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), 'users/alice/tests/t1'), aTest))
    await assertFails(updateDoc(doc(asAlice(), 'users/alice/tests/t1'), { name: '' }))
  })
})
