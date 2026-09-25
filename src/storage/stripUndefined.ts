/**
 * Recursively drop keys whose value is `undefined`.
 *
 * Firestore THROWS on an undefined field value rather than skipping it, and
 * `exactOptionalPropertyTypes` means optional fields (RawRow.conf) legitimately
 * arrive absent. Stripping at the adapter boundary is deliberate: setting
 * `ignoreUndefinedProperties` globally would paper over genuine bugs elsewhere
 * by silently discarding fields nobody meant to omit. See plan.md R7.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}
