import { describe, expect, it } from 'vitest'

/**
 * Guards for rules that are invisible at the call site.
 *
 * Everything here protects a decision whose violation produces NO error, NO test
 * failure in the offending file, and no symptom until weeks later. A code review
 * cannot reliably catch any of them, which is the whole reason they are tests.
 */

const sources = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Everything but this file — its own regex sources would fail its own checks. */
const appSources = () =>
  Object.entries(sources).filter(([path]) => !path.endsWith('test/invariants.test.ts'))

describe('word identity is content, never a pair id (006 F-2)', () => {
  /*
   * ListEditor.handleConfirm re-mints EVERY pair id on every save, updates
   * included, so the same untouched word has a different id before and after any
   * edit to its list. Comparing ids across two SessionRecords is therefore always
   * wrong — and silently so: the missed set simply comes back empty the first
   * time a user fixes a typo, with no error to trace it by.
   *
   * `wordKey` in state/missedWords.ts is the only sanctioned comparison. This
   * fails the build if a second route appears.
   */
  it('has no id comparison anywhere near a record snapshot', () => {
    const SNAPSHOT = '(?:wrong|right)Pairs'
    const NEAR_ID_COMPARISON = `${SNAPSHOT}[\\s\\S]{0,160}\\.id\\s*={2,3}`

    const offenders = appSources()
      // The one module allowed to reason about word identity, and its tests.
      .filter(([path]) => !path.includes('missedWords'))
      .filter(([, src]) => new RegExp(NEAR_ID_COMPARISON).test(src))
      .map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('routes every cross-record word match through wordKey', () => {
    // A cheap positive check to sit beside the negative one: if the module ever
    // stops exporting the helper, the guard above would pass vacuously.
    const module = sources['../state/missedWords.ts']
    expect(module).toBeTruthy()
    expect(module).toContain('export function wordKey')
  })
})

describe('the pure layer stays pure (006 FR-10)', () => {
  /*
   * `collectMissed` takes `now` as an argument so the whole suite runs without
   * fake timers, and so four window counts on one screen agree on one instant.
   * A `Date.now()` inside it would quietly undo both.
   */
  it('reads no clock inside missedWords.ts', () => {
    const module = sources['../state/missedWords.ts'] ?? ''
    expect(module).not.toMatch(/Date\.now\(\)/)
    expect(module).not.toMatch(/new Date\(\)/)
  })

  it('reads no clock inside the reducer or the scorer either', () => {
    for (const path of ['../state/appMachine.ts', '../state/session.ts']) {
      expect(sources[path] ?? '').not.toMatch(/Date\.now\(\)/)
    }
  })
})

describe('history stays append-only (006 FR-5)', () => {
  it('never bumps the session schema version to add an optional field', () => {
    /*
     * sessionRepo.read() returns [] on a version mismatch, so bumping this
     * DELETES every user's practice history. `rightPairs` is additive and
     * optional — a v1 reader ignoring an unknown key is exactly the forward
     * compatibility already designed for.
     */
    expect(sources['../storage/sessionRepo.ts'] ?? '').toContain('SCHEMA_VERSION = 1')
  })
})

describe('the game engine stays pure (008 NFR-1)', () => {
  /**
   * Every non-test module under src/game/, plus the shared selector it sits on.
   *
   * `gameRecord.ts` is EXEMPT, and deliberately so rather than by oversight. It is the
   * shaping step for a log entry, and it defaults `now` and `id` exactly as its sibling
   * `state/sessionRecord.ts` does — both take them as options precisely so a test can
   * pin them. Holding the two to different rules would make the pair harder to read
   * than either is alone, and the purity that matters (no hidden clock, no hidden draw
   * anywhere a ROUND is dealt or scored) is unaffected.
   */
  const engine = () =>
    appSources().filter(
      ([path]) =>
        (path.includes('/game/') || path.endsWith('state/wordPool.ts')) &&
        !path.includes('.test.') &&
        !path.endsWith('game/gameRecord.ts'),
    )

  it('covers something — a filter that matches nothing passes vacuously', () => {
    expect(engine().length).toBeGreaterThan(4)
  })

  it('reads no clock', () => {
    /*
     * `now` and `remainingMs` are parameters throughout, which is what lets the whole
     * engine be tested without fake timers, and what stops the screen's countdown and
     * the score disagreeing about which instant an answer arrived at.
     */
    const offenders = engine()
      .filter(([, src]) => /Date\.now\(\)|new Date\(\)/.test(src))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('keeps the one exemption injectable, so it is a default and not a hidden clock', () => {
    const source = sources['../game/gameRecord.ts'] ?? ''
    expect(source).toMatch(/options\.now \?\? Date\.now\(\)/)
    expect(source).toMatch(/options\.id \?\?/)
  })

  it('draws no randomness of its own', () => {
    // An Rng is injected, so a round can be pinned in a test and a replay can be given
    // a genuinely fresh draw rather than hoping for one.
    const offenders = engine()
      .filter(([, src]) => /Math\.random\(\)/.test(src))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})

describe('the word selector stays feature-agnostic (008 NFR-11)', () => {
  /*
   * `state/wordPool.ts` answers "which words does this spec select?" for anybody. The
   * module BOUNDARY is the whole point of putting it in state/ rather than in game/,
   * and an import is exactly how such a boundary dissolves: no error, no failing test,
   * just a shared module the next feature can no longer use.
   */
  it('imports nothing from a feature directory', () => {
    const source = sources['../state/wordPool.ts'] ?? ''
    expect(source).toBeTruthy()
    expect(source).not.toMatch(/from '\.\.\/game\//)
  })

  it('still exports the selection API it promises', () => {
    // A cheap positive check beside the negative one, so the guard above cannot pass
    // because the file was renamed out from under it.
    const source = sources['../state/wordPool.ts'] ?? ''
    expect(source).toContain('export function buildWordPool')
    expect(source).toContain('export function poolSize')
  })
})

describe('game history stays append-only too (008)', () => {
  it('never bumps the game schema version to add an optional field', () => {
    /*
     * gameRepo.read() returns [] on a version mismatch, so bumping this DELETES every
     * user's game history — silently, with no error and no way back. Exactly the trap
     * sessionRepo is guarded against above, for exactly the same reason.
     */
    expect(sources['../storage/gameRepo.ts'] ?? '').toContain('SCHEMA_VERSION = 1')
  })
})

describe('speech never escapes a user gesture (008 NFR-2)', () => {
  /*
   * iOS Safari drops any utterance that does not descend from a tap, silently. In the
   * game the prompt IS the question, so one dropped utterance ends the round rather
   * than degrading it — and it cannot be reproduced on a desktop or in jsdom.
   *
   * The specific mistake this guards is the tempting one: making a timeout
   * auto-advance "for consistency" with a tapped answer. A timeout has no gesture, so
   * the word it moves to can never be spoken.
   */
  it('does not speak from inside a setTimeout or setInterval in the game screen', () => {
    const source = sources['../components/GameCloud.tsx'] ?? ''
    expect(source).toBeTruthy()
    const timerBodies = source.match(/set(?:Timeout|Interval)\([\s\S]{0,200}?\)/g) ?? []
    expect(timerBodies.filter((body) => /speak/.test(body))).toEqual([])
  })

  it('still routes the timeout through an explicit Next word tap', () => {
    // The positive half: if this button disappears, the guard above goes vacuous.
    expect(sources['../components/GameCloud.tsx'] ?? '').toContain('Next word')
  })
})
