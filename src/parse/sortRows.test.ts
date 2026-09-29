import { describe, expect, it } from 'vitest'
import { sortRows } from './sortRows'

const rows = (...pairs: Array<[string, string]>) => pairs.map(([col1, col2]) => ({ col1, col2 }))
const col1s = (r: ReturnType<typeof rows>) => r.map((x) => x.col1)

describe('sortRows', () => {
  it('sorts by column 1, ignoring case and accents', () => {
    expect(col1s(sortRows(rows(['pear', 'peer'], ['Apple', 'appel'], ['égal', 'gelijk'], ['banana', 'banaan']), 'col1'))).toEqual([
      'Apple',
      'banana',
      'égal',
      'pear',
    ])
  })

  it('can sort by column 2 instead', () => {
    expect(sortRows(rows(['a', 'zon'], ['b', 'appel']), 'col2').map((r) => r.col2)).toEqual(['appel', 'zon'])
  })

  it('puts numbers in number order', () => {
    expect(col1s(sortRows(rows(['word 10', 'x'], ['word 2', 'y']), 'col1'))).toEqual(['word 2', 'word 10'])
  })

  it('keeps a header row on top and empty rows at the bottom', () => {
    const sorted = sortRows(rows(['English', 'Dutch'], ['', ''], ['cat', 'kat'], ['ant', 'mier']), 'col1', { keepFirst: true })
    expect(col1s(sorted)).toEqual(['English', 'ant', 'cat', ''])
  })

  it('keeps rows with the same word in the order they were in', () => {
    expect(sortRows(rows(['bad', 'slecht'], ['Bad', 'kwaad']), 'col1').map((r) => r.col2)).toEqual(['slecht', 'kwaad'])
  })

  it('does not change the rows it was given', () => {
    const input = rows(['b', 'x'], ['a', 'y'])
    sortRows(input, 'col1')
    expect(col1s(input)).toEqual(['b', 'a'])
  })
})
