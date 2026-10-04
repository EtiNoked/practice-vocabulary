import type { WriteFailureReason } from './types'

/**
 * What the user was doing when the write failed.
 *
 * The message has to name it, because a reason on its own does not say what did not
 * happen. "This device's storage is full, so the list wasn't saved" is the right sentence
 * after a save and the wrong one after a delete: the user asked for the list to GO, and
 * being told it was not saved describes a different failure from the one they are looking
 * at — one that leaves them unsure whether the list is still there.
 *
 * `subject` is here for the same reason. A saved test is not a list, and three of these
 * messages are reached from the My tests screen, where calling the row a list is the kind
 * of small wrongness that makes someone stop believing the rest of the sentence.
 */
export interface WriteAction {
  verb: 'save' | 'rename' | 'delete'
  subject: 'list' | 'test'
}

/** What went wrong, in the user's terms rather than the API's. */
function cause(reason: Exclude<WriteFailureReason, 'missing'>): string {
  switch (reason) {
    case 'quota':
      return "This device's storage is full"
    case 'unavailable':
      return "Couldn't reach this browser's storage"
    case 'offline':
      return "You're offline"
    case 'permission':
      return "Your account wouldn't accept that change"
    case 'network':
      return "Couldn't reach your account"
  }
}

const DID_NOT_HAPPEN: Record<WriteAction['verb'], string> = {
  save: 'saved',
  rename: 'renamed',
  delete: 'deleted',
}

/**
 * What still works, which is the half that keeps a failed write from reading as data loss.
 *
 * A save that did not land leaves the words in memory, practisable right now — v1's rule,
 * and the reason every one of these messages has a second sentence. A DELETE that did not
 * land is the mirror image: nothing was lost, the thing is simply still there, and saying
 * "you can still practice it" would answer a question nobody asked.
 */
function consolation(reason: Exclude<WriteFailureReason, 'missing'>, action: WriteAction): string {
  if (reason === 'offline') return 'It will sync when you reconnect.'
  if (reason === 'permission') return 'Try signing out and back in.'
  return action.verb === 'delete'
    ? `It's still in your ${action.subject === 'list' ? 'lists' : 'tests'}.`
    : 'You can still practice it now.'
}

/**
 * User-facing text for a failed write.
 *
 * Every message follows v1's rule for a full localStorage: say what did not happen, then
 * say what still works. A failed save must never read as "your list is gone" when the list
 * is sitting right there in memory, practisable.
 */
export function writeFailureMessage(reason: WriteFailureReason, action: WriteAction): string {
  const { verb, subject } = action

  /*
   * Not a failure to write so much as nothing left to write to: the row was already gone,
   * from another device or an earlier tap. A delete that finds its target missing got what
   * it wanted, so it says so plainly instead of offering a practice that cannot happen —
   * this is the one reason that must not promise the thing is still there.
   */
  if (reason === 'missing') {
    return verb === 'delete'
      ? `That ${subject} was already gone.`
      : `That ${subject} no longer exists, so the change wasn't saved.`
  }

  return `${cause(reason)}, so the ${subject} wasn't ${DID_NOT_HAPPEN[verb]}. ${consolation(reason, action)}`
}
