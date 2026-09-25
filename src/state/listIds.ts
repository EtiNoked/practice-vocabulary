import type { GameRecord } from '../game/types'
import type { ListRole, SessionRecord, WordList } from './types'

/**
 * Where a kept copy's history comes from (016 D-11).
 *
 * A member who keeps a private copy of a shared list gets a NEW list, with its own id,
 * because the original may still exist. Their practice history is filed under the old id,
 * and it cannot be moved: history is append-only (`allow update: if false`), which is the
 * whole point of it.
 *
 * So the copy claims the old id instead (`WordList.previousIds`), and records are read
 * through `canonicalRecords`, which files every record under the list that now owns its id.
 * That happens ONCE, where `App` receives the records, so every screen downstream (the
 * per-list practice line, My practices, "words you missed", the game pool) sees one
 * consistent answer without knowing copies exist.
 *
 * Nothing is written. The stored records keep the id they were written with.
 */
export function aliasMap(lists: readonly WordList[]): ReadonlyMap<string, string> {
  const alias = new Map<string, string>()
  for (const list of lists) {
    for (const previous of list.previousIds ?? []) {
      // A live list with that id wins: it is still the real owner of its history.
      if (!lists.some((l) => l.id === previous)) alias.set(previous, list.id)
    }
  }
  return alias
}

export function canonicalRecords(
  records: readonly SessionRecord[],
  alias: ReadonlyMap<string, string>,
): SessionRecord[] {
  if (alias.size === 0) return records as SessionRecord[]
  return records.map((r) => {
    const id = alias.get(r.listId)
    return id ? { ...r, listId: id } : r
  })
}

export function canonicalGames(
  games: readonly GameRecord[],
  alias: ReadonlyMap<string, string>,
): GameRecord[] {
  if (alias.size === 0) return games as GameRecord[]
  const rename = (id: string) => alias.get(id) ?? id
  return games.map((g) => ({
    ...g,
    listIds: g.listIds.map(rename),
    ...(g.results
      ? { results: g.results.map((r) => ({ ...r, word: { ...r.word, listId: rename(r.word.listId) } })) }
      : {}),
  }))
}

/** A list is shared once it has anyone in it besides its owner. Derived, never stored. */
export function isShared(list: WordList): boolean {
  return (list.sharing?.memberUids.length ?? 0) > 1
}

/**
 * The caller's role on a list. A list with no `sharing` is a guest's local list or a
 * legacy one not yet moved, and either way it is the caller's own.
 */
export function roleOf(list: WordList, uid: string | null): ListRole | null {
  if (!list.sharing) return 'owner'
  if (!uid) return null
  return list.sharing.members[uid]?.role ?? null
}

export function canEditList(list: WordList, uid: string | null): boolean {
  const role = roleOf(list, uid)
  return role === 'owner' || role === 'editor'
}
