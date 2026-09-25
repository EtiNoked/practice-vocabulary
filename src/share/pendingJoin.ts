import { JOIN_PARAM } from './links'

const KEY = 'pvt.join.pending'

/**
 * Take a share link's code out of the URL and park it for this tab (016 FR8).
 *
 * Called once, before the first render. The code is REMOVED from the address bar, so a
 * refresh, a bookmark or a screenshot does not carry the invitation along; and it is kept in
 * sessionStorage, so it survives the Google sign-in in between. Not localStorage: an
 * invitation opened and abandoned should not greet this device again next week.
 */
export function capturePendingJoin(location: Location = window.location, history: History = window.history): void {
  const params = new URLSearchParams(location.search)
  const code = params.get(JOIN_PARAM)
  if (!code) return
  try {
    sessionStorage.setItem(KEY, code)
  } catch {
    /* Without storage the join screen still opens for this page load, from the return value below. */
  }
  params.delete(JOIN_PARAM)
  const rest = params.toString()
  history.replaceState(history.state, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`)
  captured = code
}

let captured: string | null = null

export function readPendingJoin(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? captured
  } catch {
    return captured
  }
}

export function clearPendingJoin(): void {
  captured = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* Nothing to clear. */
  }
}
