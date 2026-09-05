import { HEADER_ALIASES, LANG_CODES, PROFILES, type LangCode } from '../lang/languages'
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
  // Iterates the table, so every language in it is matchable from a header row.
  // A literal list here is what kept French unmatchable even once it had aliases.
  for (const lang of LANG_CODES) {
    for (const alias of HEADER_ALIASES[lang]) {
      if (levenshtein(value, alias) <= tolerance(alias)) return lang
    }
  }
  return null
}

/**
 * Weights, in score units per token. A function word is decisive when it appears
 * at all; spelling is weaker but survives a list of bare nouns; a word ending is
 * the weakest, being the easiest to hit by accident.
 *
 * These are carried over unchanged from the two-language version so that
 * generalising the algorithm could be verified against the existing suite. Do not
 * retune them in the same change as an algorithm change — a regression then has
 * two possible causes and neither can be ruled out.
 */
const MARKER_WEIGHT = 3
const DIGRAPH_WEIGHT = 1
const SUFFIX_WEIGHT = 0.5

/** Accented Latin letters are inside à-ÿ, so French keeps its strongest signal. */
const TOKEN = /[a-zà-ÿ]+/g

/**
 * How much `text` looks like `lang`, as a score per token.
 *
 * INDEPENDENT per language — nothing is subtracted for looking like a different
 * language. The previous form scored Dutch markers +3 and English markers -3,
 * which is a two-language trick with no three-language equivalent: once there are
 * three candidates, "not English" no longer implies "Dutch".
 *
 * A marker shared between two languages (French and Dutch both use "de") lifts
 * both scores equally, so it cancels out of the comparison between them while
 * still separating both from a language that lacks it. That is why the profiles
 * are not hand-pruned for overlap.
 */
export function profileScore(text: string, lang: LangCode): number {
  const tokens = text.toLowerCase().match(TOKEN) ?? []
  if (tokens.length === 0) return 0

  const { markers, digraphs, suffixes } = PROFILES[lang]
  let score = 0
  for (const token of tokens) {
    if (markers.includes(token)) score += MARKER_WEIGHT
    for (const digraph of digraphs) {
      if (token.includes(digraph)) score += DIGRAPH_WEIGHT
    }
    for (const suffix of suffixes) {
      if (token.length > 3 && token.endsWith(suffix)) score += SUFFIX_WEIGHT
    }
  }
  return score / tokens.length
}

/**
 * How far the winning assignment must beat the runner-up, in score units per
 * token, before the heuristic is willing to claim it.
 *
 * Chosen from the gaps measured on the real fixtures rather than tuned to make a
 * test pass. A clear Dutch/French list separates by ~1.2 and a clear
 * English/Dutch one by ~0.7, so 0.15 admits every genuine call while rejecting
 * the near-ties. Exported so the tests can state the boundary instead of guessing.
 *
 * Falling back is cheap: `source: 'default'` renders an amber "(guessed)" badge
 * and the editor's language selectors settle it in one tap. A confident wrong
 * answer costs a whole drill read in the wrong accent.
 */
export const MARGIN = 0.15

/** Every ordered pair of DISTINCT languages. Six of them for three languages. */
const ASSIGNMENTS: ReadonlyArray<readonly [LangCode, LangCode]> = LANG_CODES.flatMap((a) =>
  LANG_CODES.filter((b) => b !== a).map((b) => [a, b] as const),
)

function scoreAll(text: string): Partial<Record<LangCode, number>> {
  const scores: Partial<Record<LangCode, number>> = {}
  for (const lang of LANG_CODES) scores[lang] = profileScore(text, lang)
  return scores
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

  // Score each column against every language, then choose the two columns
  // JOINTLY. Classifying each column on its own could return the same language
  // twice for a list where both sides look vaguely alike; scoring assignments
  // rather than columns makes that unrepresentable.
  const col1 = rows.map((r) => r.col1).join(' ')
  const col2 = rows.map((r) => r.col2).join(' ')
  const score1 = scoreAll(col1)
  const score2 = scoreAll(col2)

  const ranked = ASSIGNMENTS.map(([a, b]) => ({
    col1Lang: a,
    col2Lang: b,
    total: (score1[a] ?? 0) + (score2[b] ?? 0),
  })).sort((x, y) => y.total - x.total)

  const best = ranked[0]
  const runnerUp = ranked[1]
  if (!best || !runnerUp) return DEFAULT_DETECTION

  // A relative test, not an absolute floor. Scores are small on a short list of
  // content words no matter how clear the languages are, so what matters is
  // whether one assignment STANDS OUT — not whether it clears some threshold.
  //
  // The reverse assignment is a legitimate runner-up: when "Dutch then French"
  // and "French then Dutch" score alike, the direction genuinely cannot be told
  // from the text, and deferring is the correct answer.
  if (best.total - runnerUp.total < MARGIN) return DEFAULT_DETECTION

  return {
    col1Lang: best.col1Lang,
    col2Lang: best.col2Lang,
    source: 'heuristic',
    headerConsumed: false,
  }
}
