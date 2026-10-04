import { describe, expect, it } from 'vitest'
import { findDuplicates } from './duplicates'

const rows = (...pairs: Array<[string, string]>) => pairs.map(([col1, col2]) => ({ col1, col2 }))

describe('findDuplicates', () => {
  it('treats different case and spacing as the same word', () => {
    const found = findDuplicates(rows(['bad', 'slecht'], ['evil', 'Slecht '], ['good', 'goed']))
    expect([...found]).toEqual([[1, '“Slecht” is already in row 1.']])
  })

  it('leaves the meaning alone, and never matches it against the word', () => {
    const found = findDuplicates(rows(['bad', 'slecht'], ['bad', 'kwaad'], ['slecht', 'x']))
    expect(found.size).toBe(0)
  })

  it('always points at the first row holding the word', () => {
    const found = findDuplicates(rows(['bad', 'slecht'], ['x', 'y'], ['evil', 'Slecht'], ['poor', 'slecht']))
    expect(found.get(2)).toBe('“Slecht” is already in row 1.')
    expect(found.get(3)).toBe('“slecht” is already in row 1.')
  })

  it('ignores empty cells, so blank rows are never duplicates of each other', () => {
    expect(findDuplicates(rows(['', ''], ['', ''], ['a', ''], ['', 'b'])).size).toBe(0)
  })

  it('leaves a header row out, while still counting rows from the top', () => {
    const found = findDuplicates(rows(['English', 'Dutch'], ['hello', 'dutch'], ['bye', 'Dutch']), {
      skipFirst: true,
    })
    expect([...found]).toEqual([[2, '“Dutch” is already in row 2.']])
  })
})
