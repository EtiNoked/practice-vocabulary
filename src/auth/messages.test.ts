import { describe, expect, it } from 'vitest'
import { signInFailureMessage } from './messages'
import type { AuthUser, SignInOutcome } from './types'

/**
 * What the app says when a sign-in did not happen.
 *
 * The mirror of `storage/messages.test.ts`, and written for the same reason: this switch
 * is read by two call sites (the welcome screen and the account menu), their suites cover
 * two of its five branches between them, and the other three — `network`, `load-failed`
 * and `unknown` — had never been evaluated by anything.
 *
 * The rule here is narrower than the storage one. Signing in is optional: every failure
 * has to leave the user with an app they can still use, and the most common failure of
 * all is not a failure at all.
 */

const user: AuthUser = { uid: 'u1', displayName: 'Eti', email: 'eti@example.com', photoURL: null }

const REASONS = ['cancelled', 'blocked', 'load-failed', 'network'] as const

describe('every outcome is answered', () => {
  /*
   * Keyed by the union, so a new reason added to `SignInOutcome` stops this compiling.
   * `unknown` is listed but tested apart: it carries its own message rather than owning
   * one here.
   */
  it('covers the whole union, with nothing left over', () => {
    const covered: Record<Exclude<SignInOutcome, { ok: true }>['reason'], true> = {
      cancelled: true,
      blocked: true,
      'load-failed': true,
      network: true,
      unknown: true,
    }
    expect(Object.keys(covered).sort()).toEqual([...REASONS, 'unknown'].sort())
  })

  it.each(REASONS)('%s gets a sentence of its own', (reason) => {
    expect(signInFailureMessage({ ok: false, reason })).toMatch(/\S/)
  })

  it('says something different for each one', () => {
    const all = REASONS.map((reason) => signInFailureMessage({ ok: false, reason }))
    expect(new Set(all).size).toBe(REASONS.length)
  })
})

/**
 * Nothing went wrong, so there is nothing to say. Returning a string here would put an
 * alert on screen after a successful sign-in.
 */
describe('a sign-in that worked', () => {
  it('has nothing to report', () => {
    expect(signInFailureMessage({ ok: true, user })).toBeNull()
  })
})

describe('what each failure tells the user', () => {
  /*
   * Closing the popup is a choice, not an error. It still gets a line — silence after a
   * tap reads as a broken button — but it must not scold, blame, or suggest a fix for
   * something the user did on purpose.
   */
  it('treats a cancelled sign-in as the ordinary thing it is', () => {
    const text = signInFailureMessage({ ok: false, reason: 'cancelled' })!
    expect(text).toMatch(/canceled/i)
    expect(text).not.toMatch(/error|failed|sorry|try again/i)
  })

  it('tells a blocked popup what to change', () => {
    expect(signInFailureMessage({ ok: false, reason: 'blocked' })).toMatch(
      /allow popups for this site/i,
    )
  })

  it('points a network failure at the connection', () => {
    expect(signInFailureMessage({ ok: false, reason: 'network' })).toMatch(/check your connection/i)
  })

  /*
   * The one that matters most for this app's promise: the signed-out app is fully usable,
   * so a chunk that would not download is an upgrade that did not happen, not a stoppage.
   */
  it('says the app still works when the sign-in code could not be fetched', () => {
    expect(signInFailureMessage({ ok: false, reason: 'load-failed' })).toMatch(
      /keep using the app on this device/i,
    )
  })

  // Firebase's own wording, passed through untouched: there is nothing better to say
  // about a failure this module has never heard of.
  it('repeats an unknown failure verbatim rather than inventing copy for it', () => {
    expect(signInFailureMessage({ ok: false, reason: 'unknown', message: 'auth/internal-error' })).toBe(
      'auth/internal-error',
    )
  })
})
