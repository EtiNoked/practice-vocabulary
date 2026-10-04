import { describe, expect, it } from 'vitest'
import { writeFailureMessage } from './messages'
import type { WriteFailureReason } from './types'

/**
 * What the app says when a write did not land.
 *
 * These six strings are the only thing standing between a failed save and a user who
 * believes their words are gone — so the rule in `messages.ts` ("say what did not happen,
 * then say what still works") is asserted here reason by reason rather than left as a
 * comment. Three of them (`offline`, `permission`, `network`) can only come from the
 * cloud store, which is why nothing else in the suite had ever evaluated them.
 */

const REASONS = ['quota', 'missing', 'unavailable', 'offline', 'permission', 'network'] as const

const message = (reason: WriteFailureReason) => writeFailureMessage(reason)

describe('every reason is answered', () => {
  /*
   * A `Record` keyed by the union: add a reason to `WriteFailureReason` without adding it
   * here and this stops COMPILING, which is the only way to notice a new failure mode has
   * no copy — `writeFailureMessage`'s switch would catch it too, but only if someone runs
   * the typechecker on a day they changed it.
   */
  it('covers the whole union, with nothing left over', () => {
    const covered: Record<WriteFailureReason, true> = {
      quota: true,
      missing: true,
      unavailable: true,
      offline: true,
      permission: true,
      network: true,
    }
    expect(Object.keys(covered).sort()).toEqual([...REASONS].sort())
  })

  it.each(REASONS)('%s gets a sentence of its own', (reason) => {
    expect(message(reason)).toMatch(/\S/)
  })

  // A copy-paste that left two reasons sharing a message would tell the user the wrong
  // thing about their data while every other assertion here still passed.
  it('says something different for each one', () => {
    const all = REASONS.map(message)
    expect(new Set(all).size).toBe(REASONS.length)
  })
})

describe('what did not happen', () => {
  it.each(REASONS)('%s names the write that did not land', (reason) => {
    expect(message(reason)).toMatch(
      /wasn't saved|isn't saved|Couldn't save|Couldn't reach|wouldn't accept/i,
    )
  })
})

describe('what still works', () => {
  /*
   * The v1 rule this module exists to keep. A list that failed to persist is sitting in
   * memory, practisable right now, and the message has to say so — "This device's storage
   * is full" on its own reads as "your list is gone".
   */
  it.each(['quota', 'unavailable', 'network'] as const)(
    '%s promises the list can still be practised',
    (reason) => {
      expect(message(reason)).toMatch(/still practice/i)
    },
  )

  it('offline promises the change will sync, rather than that it was lost', () => {
    expect(message('offline')).toMatch(/sync when you reconnect/i)
    expect(message('offline')).not.toMatch(/lost|gone|deleted/i)
  })

  it('permission tells the user the one thing that might fix it', () => {
    expect(message('permission')).toMatch(/signing out and back in/i)
  })

  /*
   * The exception, and it has to be: the list really is not there any more, so promising
   * a practice that cannot happen would be the dishonest answer. It is also the only
   * message that does not have to offer anything.
   */
  it('missing is the only one that says the list is no longer there', () => {
    expect(message('missing')).toMatch(/no longer exists/i)
    for (const reason of REASONS.filter((r) => r !== 'missing')) {
      expect(message(reason)).not.toMatch(/no longer exists/i)
    }
  })
})
