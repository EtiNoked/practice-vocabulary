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

/** How the column languages were determined. Drives the badge colour in the editor. */
export type LangSource = 'header' | 'heuristic' | 'default'
