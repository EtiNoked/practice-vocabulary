import { describe, expect, it } from 'vitest'
import * as fx from '../test/fixtures/text'
import { CONFIDENCE_FLOOR, detectDelimiter, parseDelimited } from './textParse'

describe('detectDelimiter', () => {
  it('detects tabs from a spreadsheet paste', () => {
    expect(detectDelimiter(fx.TAB_SIMPLE).delimiter).toBe('tab')
  })

  it('detects tabs even when a header line is present', () => {
    expect(detectDelimiter(fx.TAB_WITH_HEADER).delimiter).toBe('tab')
  })

  it('detects commas', () => {
    expect(detectDelimiter(fx.COMMA_WITH_COMMAS_IN_SECOND_FIELD).delimiter).toBe('comma')
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

/**
 * The first field is the word being learnt (017).
 *
 * Stated once, on its own, in the user's own terms — the rest of `parseDelimited`'s suite
 * asserts field by field and would go on passing if the two were quietly exchanged.
 *
 * `col2` is the field the drill speaks and tests; this fixes WHICH side of a pasted line
 * lands there, and the editor draws it first for the same reason.
 */
describe('parseDelimited — which field is the word', () => {
  it('puts the first field in the word column and the second in the meaning column', () => {
    expect(parseDelimited('dochter\tdaughter', 'tab')[0]).toEqual({
      col2: 'dochter',
      col1: 'daughter',
    })
  })

  it('treats a line with only one field as a word still missing its meaning', () => {
    expect(parseDelimited('hond', 'tab')[0]).toEqual({ col2: 'hond', col1: '' })
  })

  it('keeps everything after the first delimiter as the meaning', () => {
    expect(parseDelimited("niece,My sibling's daughter, my niece", 'comma')[0]).toEqual({
      col2: 'niece',
      col1: "My sibling's daughter, my niece",
    })
  })
})

describe('parseDelimited', () => {
  it('splits a simple tab-separated list', () => {
    const rows = parseDelimited(fx.TAB_SIMPLE, 'tab')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toEqual({ col2: 'daughter', col1: 'dochter' })
    expect(rows[3]).toEqual({ col2: 'family', col1: 'gezin; familie' })
  })

  // Splitting on the FIRST delimiter only. `line.split(',')` would turn this into
  // three fields and silently lose the tail.
  it('splits on the first delimiter only, keeping commas inside the second field', () => {
    const rows = parseDelimited(fx.COMMA_WITH_COMMAS_IN_SECOND_FIELD, 'comma')
    expect(rows[0]).toEqual({ col2: 'niece', col1: "My sibling's daughter, my niece" })
    expect(rows[1]).toEqual({ col2: 'cousin', col1: "My aunt's child, my cousin" })
  })

  it('honours RFC 4180 quoting on the comma path', () => {
    const rows = parseDelimited(fx.QUOTED_CSV, 'comma')
    expect(rows[0]).toEqual({ col2: 'cousin (male, female)', col1: 'neef, nicht' })
    expect(rows[1]).toEqual({ col2: 'to look alike', col1: 'op elkaar lijken' })
  })

  it('splits on a spaced dash without eating hyphens inside words', () => {
    const rows = parseDelimited('great-grandmother - overgrootmoeder', 'dash')
    expect(rows[0]).toEqual({ col2: 'great-grandmother', col1: 'overgrootmoeder' })
  })

  it('splits on runs of two or more spaces', () => {
    const rows = parseDelimited(fx.MULTI_SPACE, 'spaces')
    expect(rows[0]).toEqual({ col2: 'twins', col1: 'tweeling' })
    expect(rows[1]).toEqual({ col2: 'sibling', col1: 'broer; zus' })
  })

  // Never drop a line the user typed — they need to see it to fix it.
  it('keeps a single-field line as an incomplete row', () => {
    const rows = parseDelimited(fx.SINGLE_FIELD_LINES, 'tab')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toEqual({ col2: 'justonewordhere', col1: '' })
  })

  it('strips a BOM and normalises CRLF line endings', () => {
    const rows = parseDelimited(fx.BOM_AND_CRLF, 'comma')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ col2: 'daughter', col1: 'dochter' })
  })

  it('drops trailing blank lines', () => {
    expect(parseDelimited(fx.TRAILING_BLANKS, 'tab')).toHaveLength(2)
  })

  it('returns nothing for empty input', () => {
    expect(parseDelimited(fx.EMPTY, 'tab')).toEqual([])
    expect(parseDelimited(fx.WHITESPACE_ONLY, 'tab')).toEqual([])
  })

  it('never sets RawRow.conf — OCR is the only source that would', () => {
    expect(parseDelimited(fx.TAB_SIMPLE, 'tab')[0]).not.toHaveProperty('conf')
  })
})
