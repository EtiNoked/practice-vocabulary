/**
 * The convergence point for every way of getting words into the app.
 *
 * Typing, pasting and file upload all produce RawRow[]. Nothing downstream of
 * `normalize` knows which route a row arrived by. When the deferred OCR path is
 * built (see plan.md § Appendix), it attaches here and nothing else changes.
 */
export interface RawRow {
  col1: string
  col2: string
  /**
   * OCR confidence, 0-100. Never set in v1 — it exists so the editor's
   * low-confidence flagging needs no new prop when OCR arrives.
   */
  conf?: number
}

/**
 * How the column languages were determined. Drives the badge colour in the editor.
 *
 * `'manual'` is never produced by `detectLanguages` — only by the user choosing
 * from the editor's language selectors. It outranks every detected value and
 * pins the choice, so editing rows afterwards cannot silently undo it.
 *
 * Persisted as a plain string and never validated on read, so lists saved before
 * `'manual'` existed load unchanged. No schema-version bump.
 */
export type LangSource = 'header' | 'heuristic' | 'default' | 'manual'

/** Sources the user can rely on. The rest render an amber "(guessed)" badge. */
export const AUTHORITATIVE_SOURCES: readonly LangSource[] = ['header', 'manual'] as const

export function isGuessed(source: LangSource): boolean {
  return !AUTHORITATIVE_SOURCES.includes(source)
}
