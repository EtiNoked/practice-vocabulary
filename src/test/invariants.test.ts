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
