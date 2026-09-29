import type { RawRow } from './types'

/**
 * Letters compared the way a person reads them: case and accents do not split words apart
 * ("apple", "Apple" and "Äpfel" sit together) and numbers in words sort as numbers
 * ("Lesson 2" before "Lesson 10").
 */
export const alphabetical = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/**
 * The editor's rows in A to Z order of one column (016 follow-up: Sort A to Z).
 *
 * Only when the user asks: a list is often kept in a textbook's order on purpose, so this
 * never runs on its own. A header row naming the languages stays on top, and empty rows
 * (the one waiting to be typed into) go to the bottom. Stable, so two rows with the same word
 * keep the order they were in.
 */
export function sortRows(
  rows: readonly RawRow[],
  column: 'col1' | 'col2',
  { keepFirst = false }: { keepFirst?: boolean } = {},
): RawRow[] {
  const head = keepFirst ? rows.slice(0, 1) : []
  const body = keepFirst ? rows.slice(1) : [...rows]
  const filled = body.filter((r) => r[column].trim() !== '')
  const empty = body.filter((r) => r[column].trim() === '')
  filled.sort((a, b) => alphabetical.compare(a[column].trim(), b[column].trim()))
  return [...head, ...filled, ...empty]
}
