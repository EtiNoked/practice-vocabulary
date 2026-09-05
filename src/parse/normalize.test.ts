import { describe, expect, it } from 'vitest'
import type { RawRow } from './types'
import { countComplete, isComplete, normalizeRows } from './normalize'

const row = (col1: string, col2: string, conf?: number): RawRow =>
  conf === undefined ? { col1, col2 } : { col1, col2, conf }

describe('normalizeRows', () => {
  it('trims surrounding whitespace from both cells', () => {
    expect(normalizeRows([row('  daughter  ', '\tdochter\n')])).toEqual([
      { col1: 'daughter', col2: 'dochter' },
    ])
  })

  it('collapses runs of internal whitespace to a single space', () => {
    expect(normalizeRows([row('to    be     born', 'geboren\t\tworden')])).toEqual([
      { col1: 'to be born', col2: 'geboren worden' },
    ])
  })

  it('strips pipe and underscore artifacts left by copy-paste', () => {
    expect(normalizeRows([row('| daughter |', '__dochter__')])).toEqual([
      { col1: 'daughter', col2: 'dochter' },
    ])
  })

  it('keeps meaningful internal punctuation', () => {
    expect(normalizeRows([row('family', 'gezin; familie')])).toEqual([
      { col1: 'family', col2: 'gezin; familie' },
    ])
  })

  // Column 2 holds whole sentences in a real textbook list. Stripping trailing
  // punctuation generally would mangle them, so only | and _ are removed.
  it('keeps a trailing full stop on a sentence', () => {
    expect(normalizeRows([row('twins', 'Twins have the same birthday.')])[0]?.col2).toBe(
      'Twins have the same birthday.',
    )
  })

  it('keeps apostrophes inside a cell', () => {
    expect(normalizeRows([row('niece', "My sibling's daughter")])[0]?.col2).toBe(
      "My sibling's daughter",
    )
  })

  it('drops rows where both cells are empty', () => {
    expect(normalizeRows([row('a', 'b'), row('   ', ''), row('c', 'd')])).toHaveLength(2)
  })

  it('keeps rows where only one cell is empty, so the user can see and fix them', () => {
    const out = normalizeRows([row('daughter', '')])
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ col1: 'daughter', col2: '' })
  })

  it('preserves a conf value when the source set one', () => {
    expect(normalizeRows([row('a', 'b', 42)])[0]?.conf).toBe(42)
  })

  // The property that keeps the v2 OCR seam free: v1 never sets conf, and a row
  // without it must never be treated as low-confidence.
  it('leaves conf absent when the source never set it', () => {
    expect(normalizeRows([row('a', 'b')])[0]).not.toHaveProperty('conf')
  })

  it('returns an empty array for empty input', () => {
    expect(normalizeRows([])).toEqual([])
  })

  it('does not mutate its input', () => {
    const input = [row('  a  ', '  b  ')]
    normalizeRows(input)
    expect(input[0]).toEqual({ col1: '  a  ', col2: '  b  ' })
  })
})

describe('isComplete', () => {
  it('is true only when both cells have content', () => {
    expect(isComplete(row('a', 'b'))).toBe(true)
    expect(isComplete(row('a', ''))).toBe(false)
    expect(isComplete(row('', 'b'))).toBe(false)
    expect(isComplete(row('', ''))).toBe(false)
  })

  it('treats a whitespace-only cell as empty', () => {
    expect(isComplete(row('a', '   '))).toBe(false)
  })
})

describe('countComplete', () => {
  it('counts only rows with both cells filled', () => {
    expect(countComplete([row('a', 'b'), row('c', ''), row('d', 'e')])).toBe(2)
  })

  it('is 0 for an empty list', () => {
    expect(countComplete([])).toBe(0)
  })
})
