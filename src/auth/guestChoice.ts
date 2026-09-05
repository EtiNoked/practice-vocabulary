/**
 * "I'll carry on without an account" — remembered for this browser session only.
 *
 * `sessionStorage`, not `localStorage`, and the distinction is the whole feature:
 * a reload inside the tab should not re-ask, but a fresh visit is a fresh
 * decision. Persisting it forever would turn the welcome screen into something
 * a user sees exactly once and can never get back to.
 *
 * It is a UI preference and nothing else. It grants no access and gates no data
 * — a forged value buys an attacker one skipped screen — which is worth saying
 * out loud for the same reason `AUTH_HINT_KEY` says it in types.ts: a key living
 * next to auth code invites being mistaken for an auth claim.
 *
 * Deliberately NOT in types.ts alongside its sibling `readAuthHint`. That module
 * is the auth port's vocabulary and is consumed by authStore; this is a view
 * concern consumed by App, and the two should not be reachable from each other.
 */
export const GUEST_CHOICE_KEY = 'pvt.auth.guest'

export function readGuestChoice(): boolean {
  try {
    return sessionStorage.getItem(GUEST_CHOICE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeGuestChoice(chosen: boolean): void {
  try {
    if (chosen) sessionStorage.setItem(GUEST_CHOICE_KEY, '1')
    else sessionStorage.removeItem(GUEST_CHOICE_KEY)
  } catch {
    /*
     * Safari in private browsing throws on access rather than returning null.
     * A device that cannot store this just meets the front door once per load
     * instead of once per session — degraded, never broken.
     */
  }
}
