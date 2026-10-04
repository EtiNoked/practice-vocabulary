import { describe, expect, it } from 'vitest'
import { makeList } from '../test/fixtures/words'
import { orderLists, readListOrder, writeListOrder } from './listOrder'
import type { WordList } from './types'

const list = (id: string, name: string): WordList =>
  makeList({ id, name, langSource: 'manual', pairs: [], createdAt: 1, updatedAt: 1 })

describe('orderLists', () => {
  const lists = [list('1', 'dutch food'), list('2', 'Animals'), list('3', 'Lesson 10'), list('4', 'Lesson 2')]

  it('leaves the store order alone for Recent', () => {
    expect(orderLists(lists, 'recent')).toBe(lists)
  })

  it('sorts by name for A to Z, ignoring case, with numbers in number order', () => {
    expect(orderLists(lists, 'az').map((l) => l.name)).toEqual(['Animals', 'dutch food', 'Lesson 2', 'Lesson 10'])
    expect(lists.map((l) => l.id)).toEqual(['1', '2', '3', '4'])
  })
})

describe('the remembered choice', () => {
  it('defaults to Recent and remembers A to Z', () => {
    expect(readListOrder()).toBe('recent')
    writeListOrder('az')
    expect(readListOrder()).toBe('az')
    writeListOrder('recent')
    expect(readListOrder()).toBe('recent')
  })
})
