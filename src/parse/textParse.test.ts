import { describe, expect, it } from 'vitest'
import * as fx from '../test/fixtures/text'
import { CONFIDENCE_FLOOR, detectDelimiter, parseDelimited, parseText } from './textParse'

describe('detectDelimiter', () => {
  it('detects tabs from a spreadsheet paste', () => {
    expect(detectDelimiter(fx.TAB_SIMPLE).delimiter).toBe('tab')
  })

  it('detects tabs even when a header line is present', () => {
    expect(detectDelimiter(fx.TAB_WITH_HEADER).delimiter).toBe('tab')
  })

  it('detects commas', () => {
    expect(detectDelimiter(fx.COMMA_WITH_COMMAS_IN_COL2).delimiter).toBe('comma')
  })

  it('detects semicolons', () => {
    expect(detectDelimiter(fx.SEMICOLON).delimiter).toBe('semicolon')
  })

  it('detects a spaced dash', () => {
    expect(detectDelimiter(fx.DASH_SEPARATED).delimiter).toBe('dash')
  })

  it('detects a spaced equals sign', () => {
    expect(detectDelimiter(fx.EQUALS_SEPARATED).delimiter).toBe('equals')
  })

  it('detects runs of two or more spaces', () => {
    expect(detectDelimiter(fx.MULTI_SPACE).delimiter).toBe('spaces')
  })

  it('reports high confidence when every line agrees', () => {
    expect(detectDelimiter(fx.TAB_SIMPLE).confidence).toBe(1)
  })

  // The single most important behaviour in this module. A silently mis-parsed
  // 40-row list is far worse than asking the user to pick a separator.
  it('refuses to guess when no separator is consistent', () => {
    const result = detectDelimiter(fx.AMBIGUOUS)
    expect(result.delimiter).toBeNull()
    expect(result.confidence).toBeLessThan(CONFIDENCE_FLOOR)
  })

  it('refuses to guess on empty input', () => {
    expect(detectDelimiter(fx.EMPTY).delimiter).toBeNull()
    expect(detectDelimiter(fx.WHITESPACE_ONLY).delimiter).toBeNull()
  })

  it('prefers tab over space when a line contains both', () => {
    // "to be born\tgeboren worden" has spaces inside cells but tabs between them.
    expect(detectDelimiter(fx.TAB_SIMPLE).delimiter).toBe('tab')
  })
})

describe('parseDelimited', () => {
  it('splits a simple tab-separated list', () => {
    const rows = parseDelimited(fx.TAB_SIMPLE, 'tab')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toEqual({ col1: 'daughter', col2: 'dochter' })
    expect(rows[3]).toEqual({ col1: 'family', col2: 'gezin; familie' })
  })

  // Splitting on the FIRST delimiter only. `line.split(',')` would turn this into
  // three fields and silently lose the tail.
  it('splits on the first delimiter only, keeping commas inside column 2', () => {
    const rows = parseDelimited(fx.COMMA_WITH_COMMAS_IN_COL2, 'comma')
    expect(rows[0]).toEqual({ col1: 'niece', col2: "My sibling's daughter, my niece" })
    expect(rows[1]).toEqual({ col1: 'cousin', col2: "My aunt's child, my cousin" })
  })

  it('honours RFC 4180 quoting on the comma path', () => {
    const rows = parseDelimited(fx.QUOTED_CSV, 'comma')
    expect(rows[0]).toEqual({ col1: 'cousin (male, female)', col2: 'neef, nicht' })
    expect(rows[1]).toEqual({ col1: 'to look alike', col2: 'op elkaar lijken' })
  })

  it('splits on a spaced dash without eating hyphens inside words', () => {
    const rows = parseDelimited('great-grandmother - overgrootmoeder', 'dash')
    expect(rows[0]).toEqual({ col1: 'great-grandmother', col2: 'overgrootmoeder' })
  })

  it('splits on runs of two or more spaces', () => {
    const rows = parseDelimited(fx.MULTI_SPACE, 'spaces')
    expect(rows[0]).toEqual({ col1: 'twins', col2: 'tweeling' })
    expect(rows[1]).toEqual({ col1: 'sibling', col2: 'broer; zus' })
  })

  // Never drop a line the user typed — they need to see it to fix it.
  it('keeps a single-field line as an incomplete row', () => {
    const rows = parseDelimited(fx.SINGLE_FIELD_LINES, 'tab')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toEqual({ col1: 'justonewordhere', col2: '' })
  })

  it('strips a BOM and normalises CRLF line endings', () => {
    const rows = parseDelimited(fx.BOM_AND_CRLF, 'comma')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ col1: 'daughter', col2: 'dochter' })
  })

  it('drops trailing blank lines', () => {
    expect(parseDelimited(fx.TRAILING_BLANKS, 'tab')).toHaveLength(2)
  })

  it('returns nothing for empty input', () => {
    expect(parseDelimited(fx.EMPTY, 'tab')).toEqual([])
    expect(parseDelimited(fx.WHITESPACE_ONLY, 'tab')).toEqual([])
  })

  it('never sets conf, so v1 rows are never flagged low-confidence', () => {
    expect(parseDelimited(fx.TAB_SIMPLE, 'tab')[0]).not.toHaveProperty('conf')
  })
})

describe('parseText', () => {
  it('detects and parses in one step', () => {
    const result = parseText(fx.TAB_SIMPLE)
    expect(result.delimiter).toBe('tab')
    expect(result.rows).toHaveLength(5)
  })

  it('returns no rows and a null delimiter when detection is inconclusive', () => {
    const result = parseText(fx.AMBIGUOUS)
    expect(result.delimiter).toBeNull()
    expect(result.rows).toEqual([])
  })

  it('accepts an explicit delimiter, overriding detection', () => {
    const result = parseText(fx.AMBIGUOUS, 'comma')
    expect(result.delimiter).toBe('comma')
    expect(result.rows.length).toBeGreaterThan(0)
  })
})
