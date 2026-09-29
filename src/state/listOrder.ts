import { alphabetical } from '../parse/sortRows'
import type { WordList } from './types'

export type ListOrder = 'recent' | 'az'

const KEY = 'pvt.lists.order'

/**
 * My lists in the order the user picked. `recent` is the order the store already delivers
 * (newest-changed first), so it is returned untouched.
 */
export function orderLists(lists: readonly WordList[], order: ListOrder): WordList[] {
  if (order === 'recent') return lists as WordList[]
  return [...lists].sort((a, b) => alphabetical.compare(a.name.trim(), b.name.trim()))
}

/** A per-device convenience, like the theme: absent or unreadable means the default. */
export function readListOrder(): ListOrder {
  try {
    return localStorage.getItem(KEY) === 'az' ? 'az' : 'recent'
  } catch {
    return 'recent'
  }
}

export function writeListOrder(order: ListOrder): void {
  try {
    localStorage.setItem(KEY, order)
  } catch {
    /* A browser that cannot store it just starts at Recent next time. */
  }
}
