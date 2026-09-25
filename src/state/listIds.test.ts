import { describe, expect, it } from 'vitest'
import type { GameRecord } from '../game/types'
import { aliasMap, canEditList, canonicalGames, canonicalRecords, isShared, roleOf } from './listIds'
import type { SessionRecord, WordList } from './types'

const list = (id: string, over: Partial<WordList> = {}): WordList => ({
  id,
  name: id,
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'manual',
  pairs: [],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
  ...over,
})

const record = (id: string, listId: string): SessionRecord => ({
  id,
  listId,
  listName: listId,
  right: 1,
  wrong: 0,
  total: 1,
  pct: 100,
  wrongPairs: [],
  finishedAt: 1,
  mode: 'full',
  partial: false,
})

const sharing = (owner: string, roles: Record<string, 'owner' | 'editor' | 'viewer'>) => ({
  ownerUid: owner,
  memberUids: Object.keys(roles),
  members: Object.fromEntries(
    Object.entries(roles).map(([uid, role]) => [
      uid,
      { role, displayName: null, email: null, photoURL: null, joinedAt: 1 },
    ]),
  ),
  updatedBy: owner,
})

describe('kept copies claim the history of the list they came from (016 D-11)', () => {
  it('files a record under the copy that lists its old id', () => {
    const alias = aliasMap([list('copy', { previousIds: ['shared'] })])
    const out = canonicalRecords([record('r1', 'shared'), record('r2', 'other')], alias)
    expect(out.map((r) => r.listId)).toEqual(['copy', 'other'])
  })

  it('follows a copy of a copy', () => {
    const alias = aliasMap([list('c2', { previousIds: ['c1', 'shared'] })])
    expect(canonicalRecords([record('a', 'c1'), record('b', 'shared')], alias).map((r) => r.listId)).toEqual([
      'c2',
      'c2',
    ])
  })

  it('leaves history with the original while the original is still one of my lists', () => {
    const alias = aliasMap([list('shared'), list('copy', { previousIds: ['shared'] })])
    expect(canonicalRecords([record('r1', 'shared')], alias)[0]!.listId).toBe('shared')
  })

  it('returns the very same array when there are no copies, so nothing downstream recomputes', () => {
    const records = [record('r1', 'a')]
    expect(canonicalRecords(records, aliasMap([list('a')]))).toBe(records)
  })

  it('renames game list ids and each word’s list id', () => {
    const game = {
      id: 'g',
      finishedAt: 1,
      listIds: ['shared', 'x'],
      listNames: ['S', 'X'],
      source: 'all',
      correct: 1,
      asked: 1,
      points: 1,
      available: 10,
      partial: false,
      results: [{ word: { id: 'w', col1: 'a', col2: 'b', listId: 'shared', listName: 'S' }, correct: true }],
    } as GameRecord
    const [out] = canonicalGames([game], aliasMap([list('copy', { previousIds: ['shared'] })]))
    expect(out!.listIds).toEqual(['copy', 'x'])
    expect(out!.results![0]!.word.listId).toBe('copy')
  })
})

describe('roles', () => {
  it('treats a list with no sharing as the caller’s own', () => {
    expect(roleOf(list('a'), 'u')).toBe('owner')
    expect(isShared(list('a'))).toBe(false)
  })

  it('reads the role from the member map, and none for a stranger', () => {
    const l = list('a', { sharing: sharing('o', { o: 'owner', e: 'editor', v: 'viewer' }) })
    expect(roleOf(l, 'o')).toBe('owner')
    expect(roleOf(l, 'v')).toBe('viewer')
    expect(roleOf(l, 'stranger')).toBeNull()
    expect(canEditList(l, 'e')).toBe(true)
    expect(canEditList(l, 'v')).toBe(false)
    expect(isShared(l)).toBe(true)
  })

  it('a list whose only member is its owner is private', () => {
    expect(isShared(list('a', { sharing: sharing('o', { o: 'owner' }) }))).toBe(false)
  })
})
