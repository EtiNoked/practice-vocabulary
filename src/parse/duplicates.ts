import { foldText } from '../state/missedWords'
import type { RawRow } from './types'

/**
 * For each row whose WORD repeats one already in an EARLIER row, the warning to show under
 * it, keyed by the row's index in `rows`.
 *
 * Only the word column is checked — `col2`, the one spoken aloud and drawn first: two rows
 * holding the same word are the same card twice. The meaning is left alone, because one word
 * in the language the user already speaks can quite reasonably explain several different
 * words.
 *
 * Compared with `foldText`, the same folding every other "is this the same word" question in
 * the app uses: case, surrounding spaces and runs of spaces do not count, so "Bad" and "bad "
 * are one word.
 *
 * A warning, never a block: two senses of one word can be legitimate, and the user decides.
 * `skipFirst` leaves out a header row, which names the languages rather than holding a word.
 */
export function findDuplicates(
  rows: readonly RawRow[],
  { skipFirst = false }: { skipFirst?: boolean } = {},
): Map<number, string> {
  const seen = new Map<string, number>()
  const warnings = new Map<number, string>()
  rows.forEach((row, index) => {
    if (skipFirst && index === 0) return
    const key = foldText(row.col2)
    if (key === '') return
    const first = seen.get(key)
    if (first === undefined) seen.set(key, index)
    else warnings.set(index, `“${row.col2.trim()}” is already in row ${first + 1}.`)
  })
  return warnings
}
