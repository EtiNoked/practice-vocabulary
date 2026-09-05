import type { SignInOutcome } from './types'

/**
 * Human copy for a failed sign-in. Returns null when there is nothing to say.
 *
 * Lifted out of AuthPanel because there are now two places a user can start a
 * sign-in — the welcome screen and the account menu — and two copies of this
 * switch would drift the moment one message was improved.
 *
 * Mirrors `writeFailureMessage` in storage/messages.ts: the layer that turns an
 * outcome union into something a person can act on.
 */
export function signInFailureMessage(outcome: SignInOutcome): string | null {
  if (outcome.ok) return null
  switch (outcome.reason) {
    case 'cancelled':
      // Closing the popup is a normal choice, not a failure. Say nothing louder
      // than this.
      return 'Sign-in cancelled.'
    case 'blocked':
      return 'Your browser blocked the sign-in popup. Allow popups for this site, then try again.'
    case 'network':
      return "Couldn't reach Google. Check your connection and try again."
    case 'load-failed':
      return "Couldn't load sign-in. You can keep using the app on this device."
    case 'unknown':
      return outcome.message
  }
}
