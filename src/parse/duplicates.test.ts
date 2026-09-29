import { describe, expect, it } from 'vitest'
import { findDuplicates } from './duplicates'

const rows = (...pairs: Array<[string, string]>) => pairs.map(([col1, col2]) => ({ col1, col2 }))

describe('findDuplicates', () => {
  it('treats different case and spacing as the same word', () => {
    const found = findDuplicates(rows(['bad', 'slecht'], ['Bad ', 'kwaad'], ['good', 'goed']))
    expect([...found]).toEqual([[1, '“Bad” is already in row 1.']])
  })

  it('checks the second column as well, against the second column only', () => {
    const found = findDuplicates(rows(['bad', 'slecht'], ['poor', 'SLECHT'], ['slecht', 'x']))
    expect([...found]).toEqual([[1, '“SLECHT” is already in row 1.']])
  })

  it('names both columns when a whole pair repeats, and always points at the first row', () => {
    const found = findDuplicates(rows(['bad', 'slecht'], ['x', 'y'], ['BAD', 'Slecht'], ['bad', 'z']))
    expect(found.get(2)).toBe('“BAD” is already in row 1; “Slecht” is already in row 1.')
    expect(found.get(3)).toBe('“bad” is already in row 1.')
  })

  it('ignores empty cells, so blank rows are never duplicates of each other', () => {
    expect(findDuplicates(rows(['', ''], ['', ''], ['a', ''], ['', 'b'])).size).toBe(0)
  })

  it('leaves a header row out, while still counting rows from the top', () => {
    const found = findDuplicates(rows(['English', 'Dutch'], ['english', 'Engels'], ['English', 'x']), {
      skipFirst: true,
    })
    expect([...found]).toEqual([[2, '“English” is already in row 2.']])
  })
})
