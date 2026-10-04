/**
 * The `code` off a Firebase error, or '' when there is not one.
 *
 * Every Firebase SDK — Auth and Firestore alike — reports what went wrong as a string
 * `code` rather than a typed error, so every caller that wants to tell "offline" from
 * "permission denied" has to reach for the same field through the same `unknown`.
 *
 * Returns '' rather than null so a `switch` needs no null branch: no code and an
 * unrecognized code both mean "we cannot say anything specific about this", and every
 * caller's `default` already handles that.
 */
export function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return ''
}
