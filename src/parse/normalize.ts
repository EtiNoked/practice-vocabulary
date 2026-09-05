import type { RawRow } from './types'

/** Below this OCR confidence a row is flagged for review. Unused in v1. */
export const LOW_CONFIDENCE = 60

/**
 * Characters that are table-drawing artifacts rather than content. Deliberately
 * narrow: column 2 holds whole sentences, so stripping trailing punctuation in
 * general would turn "Twins have the same birthday." into something wrong.
 */
const EDGE_ARTIFACTS = /^[|_\s]+|[|_\s]+$/g

function cleanCell(value: string): string {
  return value.replace(EDGE_ARTIFACTS, '').replace(/\s+/g, ' ')
}

/**
 * Tidy raw rows from any ingest route into something practisable.
 *
 * Rows with one empty cell are kept, not dropped — the user needs to see them in
 * the editor to fix them. Only rows that are entirely empty disappear.
 */
export function normalizeRows(rows: readonly RawRow[]): RawRow[] {
  const out: RawRow[] = []
  for (const row of rows) {
    const col1 = cleanCell(row.col1)
    const col2 = cleanCell(row.col2)
    if (col1 === '' && col2 === '') continue
    out.push(row.conf === undefined ? { col1, col2 } : { col1, col2, conf: row.conf })
  }
  return out
}

/** A row can only be practised when both sides have content. */
export function isComplete(row: RawRow): boolean {
  return row.col1.trim() !== '' && row.col2.trim() !== ''
}

export function countComplete(rows: readonly RawRow[]): number {
  return rows.reduce((n, row) => (isComplete(row) ? n + 1 : n), 0)
}

/** True when OCR confidence is known and poor. Always false in v1. */
export function isLowConfidence(row: RawRow): boolean {
  return row.conf !== undefined && row.conf < LOW_CONFIDENCE
}
