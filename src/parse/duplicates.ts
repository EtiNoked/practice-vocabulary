import { foldText } from '../state/missedWords'
import type { RawRow } from './types'

/**
 * For each row whose column 2 repeats a word already in an EARLIER row, the warning to show
 * under it, keyed by the row's index in `rows`.
 *
 * Only column 2 is checked, the word being learnt and spoken aloud: two rows ending in the
 * same word are the same card twice. Column 1 is left alone, because one word in the language
 * the user already speaks can quite reasonably prompt several different words.
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
