import { describe, expect, it, vi } from 'vitest'
import { createSession, mark, reveal } from '../state/session'
import { runFromList, type DrillRun } from '../state/drillRun'
import type { PooledWord } from '../state/wordPool'
import type { Session, WordList } from '../state/types'
import { DRILL_STORAGE_KEY, SCHEMA_VERSION, TTL_MS, drillRepo } from './drillRepo'

const list: WordList = {
  id: 'l1',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [
    { id: 'p1', col1: 'daughter', col2: 'dochter' },
    { id: 'p2', col1: 'son', col2: 'zoon' },
    { id: 'p3', col1: 'uncle', col2: 'oom' },
  ],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

const noShuffle = () => 0.999999999

/** The list, as the run it now always is. */
const run = runFromList(list)

const testSession = () => createSession(list.pairs, noShuffle, list.id, 'test')
const practiceSession = () => createSession(list.pairs, noShuffle, list.id, 'practice')

/** Write a raw payload, bypassing save(), to exercise the read guards. */
function putRaw(value: unknown): void {
  localStorage.setItem(DRILL_STORAGE_KEY, typeof value === 'string' ? value : JSON.stringify(value))
}

describe('round trip', () => {
  it('restores a drill to the exact card it was on', () => {
    let session: Session = testSession()
    session = mark(reveal(session), 'right')
    session = reveal(session)

    expect(drillRepo.save({ run, session, runKind: 'full' })).toEqual({ ok: true })

    const loaded = drillRepo.load()
    expect(loaded?.session.index).toBe(1)
    expect(loaded?.session.revealed).toBe(true)
    expect(loaded?.session.marks).toEqual({ p1: 'right' })
  })

  it('preserves the mode, so a practice drill does not come back as a test', () => {
    drillRepo.save({ run, session: practiceSession(), runKind: 'full' })
    expect(drillRepo.load()?.session.mode).toBe('practice')
  })

  /*
   * 009. The answer cover is a property of the run, so a reload has to come back
   * the way the user left it — the same contract `index` and `order` already have.
   */
  it('preserves an uncovered answer across a reload', () => {
    const session = { ...practiceSession(), answersOpen: true }
    drillRepo.save({ run, session, runKind: 'full' })
    expect(drillRepo.load()?.session.answersOpen).toBe(true)
  })

  it('preserves a covered one too', () => {
    drillRepo.save({ run, session: practiceSession(), runKind: 'full' })
    expect(drillRepo.load()?.session.answersOpen).toBe(false)
  })

  it('preserves the drill order rather than reshuffling on restore', () => {
    const session = testSession()
    drillRepo.save({ run, session, runKind: 'full' })
    expect(drillRepo.load()?.session.order).toEqual(session.order)
  })

  /**
   * R5: the list is stored INSIDE the payload, not referenced by id, so a drill
   * survives its source list being deleted mid-run.
   */
  it('carries the whole run, so a deleted source list cannot dangle', () => {
    drillRepo.save({ run, session: testSession(), runKind: 'full' })
    const loaded = drillRepo.load()
    expect(loaded?.run.words.map((w) => w.col1)).toEqual(['daughter', 'son', 'uncle'])
    expect(loaded?.run.subject.col2Lang).toBe('nl')
  })

  /**
   * A reload during a wrong-only re-run must not relabel it 'full'. That label
   * is the only thing keeping a re-run over the pairs you already missed out of
   * the plain average.
   */
  it('preserves the run kind', () => {
    drillRepo.save({ run, session: testSession(), runKind: 'wrong-only' })
    expect(drillRepo.load()?.runKind).toBe('wrong-only')
  })

  it('coerces an unrecognised run kind to full rather than dropping the drill', () => {
    drillRepo.save({ run, session: testSession(), runKind: 'full' })
    const stored = JSON.parse(localStorage.getItem(DRILL_STORAGE_KEY)!)
    putRaw({ ...stored, runKind: 'sideways' })
    expect(drillRepo.load()?.runKind).toBe('full')
  })

  it('overwrites the previous drill rather than accumulating', () => {
    drillRepo.save({ run, session: testSession(), runKind: 'full' })
    drillRepo.save({ run, session: mark(reveal(testSession()), 'wrong'), runKind: 'full' })
    expect(drillRepo.load()?.session.index).toBe(1)
  })
})

describe('load is total — every failure yields null', () => {
  it('returns null when nothing was ever saved', () => {
    expect(drillRepo.load()).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    putRaw('{not json at all')
    expect(drillRepo.load()).toBeNull()
  })

  it('returns null on a JSON primitive', () => {
    putRaw('42')
    expect(drillRepo.load()).toBeNull()
  })

  it('returns null on an unknown schema version', () => {
    drillRepo.save({ run, session: testSession(), runKind: 'full' })
    const stored = JSON.parse(localStorage.getItem(DRILL_STORAGE_KEY)!)
    putRaw({ ...stored, schemaVersion: SCHEMA_VERSION + 1 })
    expect(drillRepo.load()).toBeNull()
  })

  it('returns null once the drill is older than the TTL', () => {
    const now = 1_000_000_000_000
    drillRepo.save({ run, session: testSession(), runKind: 'full' }, now)
    expect(drillRepo.load(now + TTL_MS - 1)).not.toBeNull()
    expect(drillRepo.load(now + TTL_MS + 1)).toBeNull()
  })

  it('returns null on a missing session', () => {
    putRaw({ schemaVersion: SCHEMA_VERSION, savedAt: Date.now(), screen: 'practising', list })
    expect(drillRepo.load()).toBeNull()
  })

  it('returns null on a missing list', () => {
    putRaw({
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      screen: 'practising',
      session: testSession(),
    })
    expect(drillRepo.load()).toBeNull()
  })

  it('returns null on a session with an unknown mode', () => {
    putRaw({
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      screen: 'practising',
      list,
      session: { ...testSession(), mode: 'telepathy' },
    })
    expect(drillRepo.load()).toBeNull()
  })

  it('returns null on a session whose order is not an array', () => {
    putRaw({
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      screen: 'practising',
      list,
      session: { ...testSession(), order: 'p1,p2' },
    })
    expect(drillRepo.load()).toBeNull()
  })

  it('returns null on a non-numeric savedAt', () => {
    putRaw({
      schemaVersion: SCHEMA_VERSION,
      savedAt: 'yesterday',
      screen: 'practising',
      list,
      session: testSession(),
    })
    expect(drillRepo.load()).toBeNull()
  })

  /**
   * A finished drill is not a resumable one. App clears on reaching results, so
   * this should not arise — but a stale key from an older build must not restore
   * the user onto a card that does not exist.
   */
  it('returns null on an already-finished session', () => {
    let session = testSession()
    for (let i = 0; i < 3; i++) session = mark(reveal(session), 'right')
    drillRepo.save({ run, session, runKind: 'full' })
    expect(drillRepo.load()).toBeNull()
  })

  it('returns null when storage itself is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(drillRepo.load()).toBeNull()
    vi.restoreAllMocks()
  })
})

describe('save never propagates a failure', () => {
  it('reports quota rather than throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(drillRepo.save({ run, session: testSession(), runKind: 'full' })).toEqual({
      ok: false,
      reason: 'quota',
    })
    vi.restoreAllMocks()
  })

  it('reports unavailable for a private-mode style refusal', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(drillRepo.save({ run, session: testSession(), runKind: 'full' })).toEqual({
      ok: false,
      reason: 'unavailable',
    })
    vi.restoreAllMocks()
  })
})

describe('clear', () => {
  it('removes a saved drill', () => {
    drillRepo.save({ run, session: testSession(), runKind: 'full' })
    drillRepo.clear()
    expect(drillRepo.load()).toBeNull()
  })

  it('is a no-op when there is nothing saved', () => {
    expect(() => drillRepo.clear()).not.toThrow()
  })

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => drillRepo.clear()).not.toThrow()
    vi.restoreAllMocks()
  })

  /** It must touch only its own key — the saved lists live next door. */
  it('leaves other keys alone', () => {
    localStorage.setItem('pvt.lists.v1', 'the lists')
    drillRepo.save({ run, session: testSession(), runKind: 'full' })
    drillRepo.clear()
    expect(localStorage.getItem('pvt.lists.v1')).toBe('the lists')
  })
})

/**
 * 009 FR-7. A drill parked by a build older than this feature has no
 * `answersOpen` key at all.
 *
 * The tempting fix — teaching `isSession` to require the field — would make
 * `read()` return null for every one of those, so shipping this feature would
 * silently end every practice run in flight at that moment. The field is
 * DEFAULTED on read instead, which is the same trade-off `runKind` already
 * makes for a label it cannot verify.
 */
describe('a drill parked before the answer cover existed', () => {
  /** A v1 payload exactly as an older build wrote it: no `answersOpen` anywhere. */
  function putLegacy(): void {
    const { answersOpen: _dropped, ...legacySession } = practiceSession()
    putRaw({
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      screen: 'practising',
      list,
      session: legacySession,
      runKind: 'full',
    })
  }

  it('still restores, rather than being thrown away', () => {
    putLegacy()
    expect(drillRepo.load()).not.toBeNull()
    expect(drillRepo.load()?.session.index).toBe(0)
  })

  it('comes back covered', () => {
    putLegacy()
    expect(drillRepo.load()?.session.answersOpen).toBe(false)
  })

  // Coerced with `=== true`, never a truthiness test: a hand-edited or
  // half-migrated value must land closed, not open (E-6).
  it('coerces a non-boolean value rather than trusting it', () => {
    for (const junk of ['yes', 1, {}, []]) {
      putRaw({
        schemaVersion: SCHEMA_VERSION,
        savedAt: Date.now(),
        screen: 'practising',
        list,
        session: { ...practiceSession(), answersOpen: junk },
        runKind: 'full',
      })
      expect(drillRepo.load()?.session.answersOpen).toBe(false)
    }
  })

  /*
   * The guard on the mistake above. Bumping the version to admit a field a
   * reader can simply default deletes every drill in flight to gain nothing.
   */
  it('did not need a schema bump to gain the field', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })
})

describe('key separation', () => {
  it('uses its own key, never the lists or history one', () => {
    expect(DRILL_STORAGE_KEY).toBe('pvt.drill.v1')
    expect(DRILL_STORAGE_KEY).not.toBe('pvt.lists.v1')
    expect(DRILL_STORAGE_KEY).not.toBe('pvt.sessions.v1')
  })
})

describe('a run, not a list (011 FR-23)', () => {
  const pool: PooledWord[] = [
    { id: 'w0', col1: 'bread', col2: 'brood', listId: 'l1', listName: 'Food' },
    { id: 'w1', col1: 'cheese', col2: 'kaas', listId: 'l1', listName: 'Food' },
    { id: 'w2', col1: 'money', col2: 'geld', listId: 'l2', listName: 'Market' },
  ]
  const poolRun: DrillRun = {
    subject: { name: '2 lists', col1Lang: 'en', col2Lang: 'nl' },
    pool,
    words: pool.slice(0, 2),
    plan: { spec: { listIds: ['l1', 'l2'], source: 'all' }, count: 2 },
  }

  it('round-trips a pool run, plan and all', () => {
    const session = createSession(
      poolRun.words.map((w) => ({ id: w.id, col1: w.col1, col2: w.col2 })),
      noShuffle,
      '',
      'test',
    )
    expect(drillRepo.save({ run: poolRun, session, runKind: 'full' })).toEqual({ ok: true })

    const loaded = drillRepo.load()
    expect(loaded?.run.subject.name).toBe('2 lists')
    expect(loaded?.run.plan?.count).toBe(2)
    expect(loaded?.run.pool).toHaveLength(3)
    // The origins survive, or the finished run could not file its misses (011 D-3).
    expect(loaded?.run.words.map((w) => w.listId)).toEqual(['l1', 'l1'])
  })

  /*
   * A drill parked by a build older than 011 carries `list` and no `run`. Coerced, never
   * rejected: rejecting would end someone's practice to gain a shape we can construct
   * ourselves — the trade-off 009 made for `answersOpen` and 002 for `runKind`.
   */
  it('coerces a pre-011 payload into a list run', () => {
    const session = testSession()
    putRaw({
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      screen: 'practising',
      list,
      session,
      runKind: 'full',
    })

    const loaded = drillRepo.load()
    expect(loaded?.run.subject.name).toBe('Lesson 3')
    expect(loaded?.run.subject.col2Lang).toBe('nl')
    expect(loaded?.run.words.map((w) => w.id)).toEqual(['p1', 'p2', 'p3'])
    expect(loaded?.run.words.every((w) => w.listId === 'l1')).toBe(true)
    expect(loaded?.session.index).toBe(session.index)
  })

  it('coerces a pre-011 payload mid-drill to the pairs the session is drilling', () => {
    // A wrong-only re-run: the session holds fewer pairs than the list does.
    const session = createSession([list.pairs[1]!], noShuffle, list.id, 'test')
    putRaw({
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      screen: 'practising',
      list,
      session,
      runKind: 'wrong-only',
    })
    expect(drillRepo.load()?.run.words.map((w) => w.col1)).toEqual(['son'])
  })

  it('returns null for a payload with neither a run nor a list', () => {
    putRaw({
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      screen: 'practising',
      session: testSession(),
      runKind: 'full',
    })
    expect(drillRepo.load()).toBeNull()
  })

  it('returns null for a run whose words are not an array', () => {
    putRaw({
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      screen: 'practising',
      run: { subject: { name: 'x', col1Lang: 'en', col2Lang: 'nl' }, pool: [], words: 'nope' },
      session: testSession(),
      runKind: 'full',
    })
    expect(drillRepo.load()).toBeNull()
  })
})
