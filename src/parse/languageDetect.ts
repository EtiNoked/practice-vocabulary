import {
  DUTCH_DIGRAPHS,
  DUTCH_SUFFIXES,
  HEADER_ALIASES,
  MARKER_WORDS,
  type LangCode,
} from '../lang/languages'
import type { LangSource, RawRow } from './types'

export interface LanguageDetection {
  col1Lang: LangCode
  col2Lang: LangCode
  source: LangSource
  /** True when row 0 was a header and the caller should drop it from the pairs. */
  headerConsumed: boolean
}

const DEFAULT_DETECTION: LanguageDetection = {
  col1Lang: 'en',
  col2Lang: 'nl',
  source: 'default',
  headerConsumed: false,
}

/** Standard Levenshtein edit distance. Exported for its own tests. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      )
    }
    prev = curr
  }
  return prev[b.length] ?? 0
}

/**
 * Edit-distance budget scaled to alias length. A flat budget of 2 would let almost
 * any three-letter word match the short aliases ("ned", "eng"), so short aliases
 * demand a closer match.
 */
function tolerance(alias: string): number {
  if (alias.length >= 6) return 2
  if (alias.length >= 4) return 1
  return 0
}

/** Which language, if any, this cell names. */
function matchHeaderCell(cell: string): LangCode | null {
  const value = cell.trim().toLowerCase().replace(/[^a-z]/g, '')
  if (value === '') return null
  for (const lang of ['en', 'nl'] as const) {
    for (const alias of HEADER_ALIASES[lang]) {
      if (levenshtein(value, alias) <= tolerance(alias)) return lang
    }
  }
  return null
}

/**
 * How Dutch a body of text looks, as a score per token. Combines high-frequency
 * function words, spelling digraphs and infinitive endings, because a short
 * vocabulary list may contain no function words at all — "dochter / daughter"
 * has none, and the digraph signal is what carries it.
 */
function dutchness(text: string): number {
  const tokens = text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? []
  if (tokens.length === 0) return 0

  let score = 0
  for (const token of tokens) {
    if (MARKER_WORDS.nl.includes(token)) score += 3
    if (MARKER_WORDS.en.includes(token)) score -= 3
    for (const digraph of DUTCH_DIGRAPHS) {
      if (token.includes(digraph)) score += 1
    }
    for (const suffix of DUTCH_SUFFIXES) {
      if (token.length > 3 && token.endsWith(suffix)) score += 0.5
    }
  }
  return score / tokens.length
}

/**
 * Work out which column holds which language.
 *
 * Resolution order is header row, then spelling heuristic, then a plain default.
 * Only the header path yields `source: 'header'`; the editor renders the other two
 * with an amber "(guessed)" badge so a wrong call is visible before practice
 * starts, rather than surfacing as a wrong-sounding voice mid-drill.
 */
export function detectLanguages(rows: readonly RawRow[]): LanguageDetection {
  if (rows.length === 0) return DEFAULT_DETECTION

  const first = rows[0]
  if (first) {
    const left = matchHeaderCell(first.col1)
    const right = matchHeaderCell(first.col2)
    // Both cells must name a language, and they must disagree — "English/English"
    // is not a usable header.
    if (left && right && left !== right) {
      return { col1Lang: left, col2Lang: right, source: 'header', headerConsumed: true }
    }
  }

  // Compare the columns against each other rather than classifying each on its
  // own. That guarantees two distinct languages, which independent classification
  // would not.
  const body = rows
  const left = dutchness(body.map((r) => r.col1).join(' '))
  const right = dutchness(body.map((r) => r.col2).join(' '))

  if (left === right) return DEFAULT_DETECTION

  return left > right
    ? { col1Lang: 'nl', col2Lang: 'en', source: 'heuristic', headerConsumed: false }
    : { col1Lang: 'en', col2Lang: 'nl', source: 'heuristic', headerConsumed: false }
}
