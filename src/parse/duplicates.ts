import { foldText } from '../state/missedWords'
import type { RawRow } from './types'

/**
 * For each row that repeats a word already in an EARLIER row, the warning to show under it,
 * keyed by the row's index in `rows`.
 *
 * Compared with `foldText`, the same folding every other "is this the same word" question in
 * the app uses: case, surrounding spaces and runs of spaces do not count, so "Bad" and "bad "
 * are one word. Each column is checked against the same column only.
 *
 * A warning, never a block: two senses of one word can be legitimate, and the user decides.
 * `skipFirst` leaves out a header row, which names the languages rather than holding a word.
 */
export function findDuplicates(
  rows: readonly RawRow[],
  { skipFirst = false }: { skipFirst?: boolean } = {},
): Map<number, string> {
  const seen = { col1: new Map<string, number>(), col2: new Map<string, number>() }
  const warnings = new Map<number, string>()
  rows.forEach((row, index) => {
    if (skipFirst && index === 0) return
    const repeats: string[] = []
    for (const column of ['col1', 'col2'] as const) {
      const key = foldText(row[column])
      if (key === '') continue
      const first = seen[column].get(key)
      if (first === undefined) seen[column].set(key, index)
      else repeats.push(`“${row[column].trim()}” is already in row ${first + 1}`)
    }
    if (repeats.length > 0) warnings.set(index, `${repeats.join('; ')}.`)
  })
  return warnings
}
