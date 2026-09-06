import type { GameRecord } from '../game/types'
import type { SavedTest } from '../state/testPlan'
import type { SessionRecord, WordList } from '../state/types'
import type { ListStore, StoreError, Unsubscribe, WriteResult } from './types'

/**
 * A complete in-memory ListStore.
 *
 * This is test infrastructure, and deliberately a first-class implementation
 * rather than a hand-rolled stub per test file: it keeps the Firebase emulator
 * off the critical path for everything except the Firestore adapter and the
 * rules themselves. Its own subscription contract is pinned by tests, because
 * every other test that uses it inherits that behaviour.
 */
export function createMemoryStore(initial: readonly WordList[] = []): ListStore {
  let lists: WordList[] = initial.map(clone)
  let records: SessionRecord[] = []
  let listSubs: Array<(l: WordList[]) => void> = []
  let sessionSubs: Array<{ listId: string | null; fn: (r: SessionRecord[]) => void }> = []
  let games: GameRecord[] = []
  let gameSubs: Array<(r: GameRecord[]) => void> = []
  let tests: SavedTest[] = []
  let testSubs: Array<(t: SavedTest[]) => void> = []
  let disposed = false

  function clone<T>(value: T): T {
    return structuredClone(value)
  }

  const sortedLists = (): WordList[] =>
    [...lists].sort((a, b) => b.updatedAt - a.updatedAt).map(clone)

  const sortedRecords = (listId: string | null): SessionRecord[] =>
    records
      .filter((r) => listId === null || r.listId === listId)
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .map(clone)

  const sortedTests = (): SavedTest[] =>
    [...tests].sort((a, b) => b.updatedAt - a.updatedAt).map(clone)

  function emitTests(): void {
    if (disposed) return
    const snapshot = sortedTests()
    testSubs.forEach((fn) => fn(clone(snapshot)))
  }

  function emitLists(): void {
    if (disposed) return
    const snapshot = sortedLists()
    listSubs.forEach((fn) => fn(clone(snapshot)))
  }

  function emitSessions(): void {
    if (disposed) return
    sessionSubs.forEach(({ listId, fn }) => fn(sortedRecords(listId)))
  }

  const sortedGames = (): GameRecord[] =>
    [...games].sort((a, b) => b.finishedAt - a.finishedAt).map(clone)

  function emitGames(): void {
    if (disposed) return
    gameSubs.forEach((fn) => fn(sortedGames()))
  }

  return {
    subscribeLists(onChange, _onError): Unsubscribe {
      void (_onError satisfies (e: StoreError) => void)
      listSubs.push(onChange)
      onChange(sortedLists())
      return () => {
        listSubs = listSubs.filter((fn) => fn !== onChange)
      }
    },

    async saveList(list: WordList): Promise<WriteResult> {
      lists = [...lists.filter((l) => l.id !== list.id), clone(list)]
      emitLists()
      return { ok: true }
    },

    async renameList(id: string, name: string): Promise<WriteResult> {
      const existing = lists.find((l) => l.id === id)
      if (!existing) return { ok: false, reason: 'missing' }
      existing.name = name
      existing.updatedAt = Date.now()
      emitLists()
      return { ok: true }
    },

    async removeList(id: string): Promise<WriteResult> {
      if (!lists.some((l) => l.id === id)) return { ok: false, reason: 'missing' }
      lists = lists.filter((l) => l.id !== id)
      emitLists()
      return { ok: true }
    },

    subscribeSessions(listId, onChange, _onError): Unsubscribe {
      void (_onError satisfies (e: StoreError) => void)
      const entry = { listId, fn: onChange }
      sessionSubs.push(entry)
      onChange(sortedRecords(listId))
      return () => {
        sessionSubs = sessionSubs.filter((s) => s !== entry)
      }
    },

    async recordSession(record: SessionRecord): Promise<WriteResult> {
      records = [...records.filter((r) => r.id !== record.id), clone(record)]
      emitSessions()
      return { ok: true }
    },

    subscribeGames(onChange, _onError): Unsubscribe {
      void (_onError satisfies (e: StoreError) => void)
      gameSubs.push(onChange)
      onChange(sortedGames())
      return () => {
        gameSubs = gameSubs.filter((fn) => fn !== onChange)
      }
    },

    async recordGame(record: GameRecord): Promise<WriteResult> {
      games = [...games.filter((r) => r.id !== record.id), clone(record)]
      emitGames()
      return { ok: true }
    },

    subscribeTests(onChange, _onError): Unsubscribe {
      void (_onError satisfies (e: StoreError) => void)
      if (disposed) return () => {}
      testSubs.push(onChange)
      onChange(sortedTests())
      return () => {
        testSubs = testSubs.filter((fn) => fn !== onChange)
      }
    },

    async saveTest(test: SavedTest): Promise<WriteResult> {
      // Create-or-update by id, exactly as saveList is: the id is the identity.
      tests = [...tests.filter((t) => t.id !== test.id), clone(test)]
      emitTests()
      return { ok: true }
    },

    async removeTest(id: string): Promise<WriteResult> {
      if (!tests.some((t) => t.id === id)) return { ok: false, reason: 'missing' }
      tests = tests.filter((t) => t.id !== id)
      emitTests()
      return { ok: true }
    },

    async dispose(): Promise<void> {
      disposed = true
      listSubs = []
      sessionSubs = []
      gameSubs = []
      testSubs = []
    },
  }
}
