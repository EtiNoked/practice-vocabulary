import type { RawRow } from './types'

export type Delimiter = 'tab' | 'comma' | 'semicolon' | 'dash' | 'equals' | 'spaces'

export const DELIMITERS: readonly Delimiter[] = [
  'tab',
  'comma',
  'semicolon',
  'dash',
  'equals',
  'spaces',
] as const

export const DELIMITER_LABELS: Record<Delimiter, string> = {
  tab: 'Tab (from a spreadsheet)',
  comma: 'Comma',
  semicolon: 'Semicolon',
  dash: 'Dash  -  ',
  equals: 'Equals  =  ',
  spaces: 'Two or more spaces',
}

/**
 * Minimum share of lines that must yield exactly two fields before we accept a
 * delimiter. Below this we return null and ask the user rather than guessing:
 * a silently mis-parsed 40-row list is far worse than one extra click.
 */
export const CONFIDENCE_FLOOR = 0.6

/**
 * Patterns that locate the FIRST separator in a line. Dash and equals require
 * surrounding whitespace so that "great-grandmother" and "x=y" inside a word are
 * not treated as separators.
 */
const PATTERNS: Record<Delimiter, RegExp> = {
  tab: /\t/,
  comma: /,/,
  semicolon: /;/,
  dash: /\s[-–—]\s/,
  equals: /\s=\s/,
  spaces: /\s{2,}/,
}

/** Strip a UTF-8 BOM, normalise CRLF/CR to LF, and drop blank lines. */
function toLines(text: string): string[] {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim() !== '')
}

/**
 * Split a line at the first occurrence of `pattern`. Everything before is column 1,
 * everything after is column 2 — including further occurrences of the separator.
 *
 * This is the behaviour that keeps "niece,My sibling's daughter, my niece" intact.
 * `String.split()` would produce three fields and lose the tail.
 */
function splitOnce(line: string, pattern: RegExp): [string, string] | null {
  const match = pattern.exec(line)
  if (!match || match.index === undefined) return null
  const before = line.slice(0, match.index)
  const after = line.slice(match.index + match[0].length)
  return [before, after]
}

/**
 * Parse one line of RFC 4180 CSV into fields, honouring quotes and doubled quotes.
 * Returns null when the line contains no quoting, so the caller can fall back to
 * the cheaper first-delimiter split.
 */
function parseQuotedCsvLine(line: string): string[] | null {
  if (!line.includes('"')) return null
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let sawQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      sawQuote = true
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return sawQuote ? fields : null
}

/** How well `delimiter` explains `text`: the share of lines yielding two fields. */
function scoreDelimiter(lines: readonly string[], delimiter: Delimiter): number {
  if (lines.length === 0) return 0
  const pattern = PATTERNS[delimiter]
  let good = 0
  for (const line of lines) {
    const parts = delimiter === 'comma' ? parseQuotedCsvLine(line) : null
    if (parts) {
      if (parts.length === 2 && parts.every((p) => p.trim() !== '')) good++
      continue
    }
    const split = splitOnce(line, pattern)
    if (split && split[0].trim() !== '' && split[1].trim() !== '') good++
  }
  return good / lines.length
}

/**
 * Work out which separator the pasted text uses.
 *
 * Returns `delimiter: null` when nothing clears CONFIDENCE_FLOOR, which the UI
 * surfaces as "couldn't tell — pick a separator" rather than picking the least-bad
 * option and corrupting the list.
 */
export function detectDelimiter(text: string): { delimiter: Delimiter | null; confidence: number } {
  const lines = toLines(text)
  if (lines.length === 0) return { delimiter: null, confidence: 0 }

  let best: Delimiter | null = null
  let bestScore = 0
  // DELIMITERS is ordered most- to least-specific, so an exact tie prefers tab
  // over spaces — which matters for "to be born\tgeboren worden".
  for (const delimiter of DELIMITERS) {
    const score = scoreDelimiter(lines, delimiter)
    if (score > bestScore) {
      bestScore = score
      best = delimiter
    }
  }

  return bestScore >= CONFIDENCE_FLOOR
    ? { delimiter: best, confidence: bestScore }
    : { delimiter: null, confidence: bestScore }
}

/**
 * Split delimited text into rows. A line that yields only one field becomes a row
 * with an empty column 2 rather than being dropped — the user needs to see it in
 * the editor to fix it.
 */
export function parseDelimited(text: string, delimiter: Delimiter): RawRow[] {
  const pattern = PATTERNS[delimiter]
  return toLines(text).map((line) => {
    const quoted = delimiter === 'comma' ? parseQuotedCsvLine(line) : null
    if (quoted) {
      return { col1: (quoted[0] ?? '').trim(), col2: quoted.slice(1).join(',').trim() }
    }
    const split = splitOnce(line, pattern)
    return split
      ? { col1: split[0].trim(), col2: split[1].trim() }
      : { col1: line.trim(), col2: '' }
  })
}

/** Detect and parse in one step. Pass `override` to force a delimiter. */
export function parseText(
  text: string,
  override?: Delimiter,
): { delimiter: Delimiter | null; confidence: number; rows: RawRow[] } {
  if (override) {
    return { delimiter: override, confidence: 1, rows: parseDelimited(text, override) }
  }
  const { delimiter, confidence } = detectDelimiter(text)
  return {
    delimiter,
    confidence,
    rows: delimiter ? parseDelimited(text, delimiter) : [],
  }
}
