import { describe, expect, it } from 'vitest'
import type { RawRow } from './types'
import { detectLanguages, levenshtein } from './languageDetect'

const rows = (...pairs: Array<[string, string]>): RawRow[] =>
  pairs.map(([col1, col2]) => ({ col1, col2 }))

const ENGLISH_DUTCH = rows(
  ['daughter', 'dochter'],
  ['to die', 'doodgaan'],
  ['to be born', 'geboren worden'],
  ['grandparents', 'grootouders'],
  ['twins', 'tweeling'],
)

describe('levenshtein', () => {
  it('is 0 for identical strings', () => {
    expect(levenshtein('english', 'english')).toBe(0)
  })

  it('counts single-character edits', () => {
    expect(levenshtein('engish', 'english')).toBe(1)
    expect(levenshtein('duch', 'dutch')).toBe(1)
  })
})

describe('detectLanguages — header row', () => {
  it('reads an English/Dutch header and consumes it', () => {
    const result = detectLanguages(rows(['English', 'Dutch'], ...ENGLISH_DUTCH.map(r => [r.col1, r.col2] as [string, string])))
    expect(result.source).toBe('header')
    expect(result.col1Lang).toBe('en')
    expect(result.col2Lang).toBe('nl')
    expect(result.headerConsumed).toBe(true)
  })

  it('handles a Dutch-first header, so detection is not positional', () => {
    const result = detectLanguages(rows(['Nederlands', 'Engels'], ['dochter', 'daughter']))
    expect(result.source).toBe('header')
    expect(result.col1Lang).toBe('nl')
    expect(result.col2Lang).toBe('en')
    expect(result.headerConsumed).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(detectLanguages(rows(['ENGLISH', 'dutch'], ['a', 'b'])).source).toBe('header')
  })

  // Fuzzy so a typo still resolves — and so an OCR'd header will, when v2 arrives.
  it('tolerates a mistyped header', () => {
    const result = detectLanguages(rows(['Engish', 'Duch'], ['daughter', 'dochter']))
    expect(result.source).toBe('header')
    expect(result.col1Lang).toBe('en')
    expect(result.col2Lang).toBe('nl')
  })

  it('ignores a header row that names the same language twice', () => {
    const result = detectLanguages(rows(['English', 'English'], ...ENGLISH_DUTCH.map(r => [r.col1, r.col2] as [string, string])))
    expect(result.source).not.toBe('header')
    expect(result.headerConsumed).toBe(false)
  })

  it('does not consume a first row that is an ordinary word pair', () => {
    const result = detectLanguages(ENGLISH_DUTCH)
    expect(result.headerConsumed).toBe(false)
  })
})

describe('detectLanguages — heuristic fallback', () => {
  it('identifies the Dutch column by its spelling patterns', () => {
    const result = detectLanguages(ENGLISH_DUTCH)
    expect(result.source).toBe('heuristic')
    expect(result.col1Lang).toBe('en')
    expect(result.col2Lang).toBe('nl')
  })

  it('works when the Dutch column comes first', () => {
    const flipped = ENGLISH_DUTCH.map((r) => ({ col1: r.col2, col2: r.col1 }))
    const result = detectLanguages(flipped)
    expect(result.source).toBe('heuristic')
    expect(result.col1Lang).toBe('nl')
    expect(result.col2Lang).toBe('en')
  })

  it('always returns two different languages', () => {
    const result = detectLanguages(ENGLISH_DUTCH)
    expect(result.col1Lang).not.toBe(result.col2Lang)
  })
})

describe('detectLanguages — default fallback', () => {
  it('defaults to English then Dutch for empty input', () => {
    const result = detectLanguages([])
    expect(result.source).toBe('default')
    expect(result.col1Lang).toBe('en')
    expect(result.col2Lang).toBe('nl')
  })

  it('defaults when the columns are indistinguishable', () => {
    const result = detectLanguages(rows(['xyz', 'xyz'], ['qqq', 'qqq']))
    expect(result.source).toBe('default')
    expect(result.col1Lang).toBe('en')
    expect(result.col2Lang).toBe('nl')
  })
})
