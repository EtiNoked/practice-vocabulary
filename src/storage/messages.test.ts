import { describe, expect, it } from 'vitest'
import { writeFailureMessage, type WriteAction } from './messages'
import type { WriteFailureReason } from './types'

/**
 * What the app says when a write did not land.
 *
 * These messages are the only thing standing between a failed write and a user who
 * believes their words are gone, so the rule in `messages.ts` ("say what did not happen,
 * then say what still works") is asserted reason by reason rather than left as a comment.
 * Three of them (`offline`, `permission`, `network`) can only come from the cloud store,
 * which is why nothing else in the suite had ever evaluated them.
 *
 * The sentence has to fit the action as well as the reason. A delete that failed must not
 * say "wasn't saved" — the user asked for the thing to GO, and being told it was not saved
 * leaves them unable to tell whether it is still there.
 */

const REASONS = ['quota', 'missing', 'unavailable', 'offline', 'permission', 'network'] as const
const VERBS = ['save', 'rename', 'delete'] as const
const SUBJECTS = ['list', 'test'] as const

const ACTIONS: WriteAction[] = VERBS.flatMap((verb) => SUBJECTS.map((subject) => ({ verb, subject })))

const EVERY_CASE = REASONS.flatMap((reason) =>
  ACTIONS.map((action) => [`${reason} / ${action.verb} a ${action.subject}`, reason, action] as const),
)

const say = (reason: WriteFailureReason, verb: WriteAction['verb'], subject: WriteAction['subject']) =>
  writeFailureMessage(reason, { verb, subject })

describe('every reason is answered, for every action', () => {
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

  it.each(EVERY_CASE)('%s gets a finished sentence', (_label, reason, action) => {
    const text = writeFailureMessage(reason, action)
    expect(text).toMatch(/\S/)
    expect(text.trim()).toMatch(/\.$/)
  })

  it.each(EVERY_CASE)('%s never calls it the wrong kind of thing', (_label, reason, action) => {
    const other = action.subject === 'list' ? 'test' : 'list'
    expect(writeFailureMessage(reason, action)).not.toMatch(new RegExp(`\\b${other}s?\\b`, 'i'))
  })
})

/**
 * The wording that was already right, pinned so the delete fix cannot quietly reword it.
 * These three are what the app has said since v1.
 */
describe('saving a list, unchanged', () => {
  it.each([
    [
      'quota',
      "This device's storage is full, so the list wasn't saved. You can still practice it now.",
    ],
    ['offline', "You're offline, so the list wasn't saved. It will sync when you reconnect."],
    [
      'permission',
      "Your account wouldn't accept that change, so the list wasn't saved. Try signing out and back in.",
    ],
  ] as const)('%s', (reason, expected) => {
    expect(say(reason, 'save', 'list')).toBe(expected)
  })
})

/**
 * The bug this file's second half exists for.
 *
 * "This device's storage is full, so the list wasn't saved. You can still practice it now."
 * was shown after tapping Delete. Every clause of it is wrong for that tap: the user did
 * not ask for a save, and offering a practice answers a question they did not ask.
 */
describe('a delete that did not happen', () => {
  it.each(SUBJECTS)('says the %s was not deleted, not that it was not saved', (subject) => {
    const text = say('quota', 'delete', subject)
    expect(text).toMatch(new RegExp(`the ${subject} wasn't deleted`))
    expect(text).not.toMatch(/saved/)
  })

  it.each(SUBJECTS)('tells the user the %s is still there, rather than offering a practice', (subject) => {
    const text = say('unavailable', 'delete', subject)
    expect(text).toMatch(new RegExp(`still in your ${subject}s\\.`))
    expect(text).not.toMatch(/still practice/)
  })

  it('reads as one whole sentence, end to end', () => {
    expect(say('quota', 'delete', 'list')).toBe(
      "This device's storage is full, so the list wasn't deleted. It's still in your lists.",
    )
    expect(say('network', 'delete', 'test')).toBe(
      "Couldn't reach your account, so the test wasn't deleted. It's still in your tests.",
    )
  })

  /*
   * The cloud reasons keep their own second sentence: what to do about the account beats
   * where the row is, because the row being there is not the problem.
   */
  it('still promises a sync, or names the fix, when the account is the problem', () => {
    expect(say('offline', 'delete', 'list')).toMatch(/sync when you reconnect\.$/)
    expect(say('permission', 'delete', 'test')).toMatch(/signing out and back in\.$/)
  })
})

describe('a rename that did not happen', () => {
  it.each(SUBJECTS)('says the %s was not renamed', (subject) => {
    expect(say('quota', 'rename', subject)).toMatch(new RegExp(`the ${subject} wasn't renamed`))
  })

  // Renaming leaves the words untouched and in memory, so v1's promise still holds.
  it('keeps the promise that the words are still practisable', () => {
    expect(say('quota', 'rename', 'list')).toMatch(/still practice it now\.$/)
  })
})

describe('what still works', () => {
  /*
   * v1's rule, and the reason every one of these has a second sentence. A list that failed
   * to persist is sitting in memory, practisable right now — "This device's storage is
   * full" on its own reads as "your list is gone".
   */
  it.each(['quota', 'unavailable', 'network'] as const)(
    '%s promises a save can still be practised',
    (reason) => {
      expect(say(reason, 'save', 'list')).toMatch(/still practice/i)
    },
  )

  it.each(ACTIONS)('offline promises a sync rather than a loss ($verb a $subject)', (action) => {
    const text = writeFailureMessage('offline', action)
    expect(text).toMatch(/sync when you reconnect/i)
    expect(text).not.toMatch(/lost|gone|deleted it/i)
  })

  it.each(ACTIONS)('permission names the one thing that might fix it ($verb a $subject)', (action) => {
    expect(writeFailureMessage('permission', action)).toMatch(/signing out and back in/i)
  })
})

/**
 * `missing` is not a failed write so much as nothing left to write to, and it is the one
 * reason whose answer flips with the verb.
 */
describe('a row that was already gone', () => {
  it.each(SUBJECTS)('tells a delete it got what it wanted (%s)', (subject) => {
    expect(say('missing', 'delete', subject)).toBe(`That ${subject} was already gone.`)
  })

  it.each(SUBJECTS)('tells a save the change could not land (%s)', (subject) => {
    expect(say('missing', 'save', subject)).toBe(
      `That ${subject} no longer exists, so the change wasn't saved.`,
    )
  })

  // The one message that must NOT offer a practice: there is nothing left to practise.
  it.each(ACTIONS)('never promises a practice ($verb a $subject)', (action) => {
    expect(writeFailureMessage('missing', action)).not.toMatch(/still practice/i)
  })
})
