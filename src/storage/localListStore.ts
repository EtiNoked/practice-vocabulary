import type { GameRecord } from '../game/types'
import type { SavedTest } from '../state/testPlan'
import type { SessionRecord, WordList } from '../state/types'
import { gameRepo } from './gameRepo'
import { listRepo } from './listRepo'
import { sessionRepo } from './sessionRepo'
import { testRepo } from './testRepo'
import type { ListStore, StoreError, Unsubscribe, WriteResult } from './types'

/**
 * The signed-out store: localStorage, exactly as v1 behaved.
 *
 * This WRAPS listRepo rather than replacing it. listRepo keeps its own tests and
 * its own defensive read/write contract untouched, which is what makes the
 * synchronous-to-asynchronous refactor cheap and verifiable — if those tests stay
 * green, no storage behaviour changed.
 *
 * The only thing added here is the subscription contract. localStorage has no
 * change notification worth using (the `storage` event fires only for OTHER tabs
 * and not for the writing one), so this emits on write instead.
 */
export function createLocalListStore(): ListStore {
  let listSubs: Array<(lists: WordList[]) => void> = []
  let sessionSubs: Array<{ listId: string | null; fn: (r: SessionRecord[]) => void }> = []
  let gameSubs: Array<(r: GameRecord[]) => void> = []
  let testSubs: Array<(t: SavedTest[]) => void> = []
  let disposed = false

  function emitLists(): void {
    if (disposed) return
    const lists = listRepo.getAll()
    listSubs.forEach((fn) => fn(lists))
  }

  function emitSessions(): void {
    if (disposed) return
    sessionSubs.forEach(({ listId, fn }) => fn(sessionRepo.getAll(listId)))
  }

  function emitGames(): void {
    if (disposed) return
    gameSubs.forEach((fn) => fn(gameRepo.getAll()))
  }

  function emitTests(): void {
    if (disposed) return
    const tests = testRepo.getAll()
    testSubs.forEach((fn) => fn(tests))
  }

  /** Emit only when the write actually landed — a failed write changed nothing. */
  function afterWrite(result: WriteResult, emit: () => void): WriteResult {
    if (result.ok) emit()
    return result
  }

  return {
    subscribeLists(onChange, _onError): Unsubscribe {
      void (_onError satisfies (e: StoreError) => void)
      listSubs.push(onChange)
      onChange(listRepo.getAll())
      return () => {
        listSubs = listSubs.filter((fn) => fn !== onChange)
      }
    },

    async saveList(list: WordList): Promise<WriteResult> {
      const existing = listRepo.getById(list.id)
      if (!existing) return afterWrite(listRepo.save(list), emitLists)

      // listRepo.update deliberately refuses to touch id/name/createdAt, so a
      // rename that arrives with the rest of an edit needs the second call.
      const updated = listRepo.update(list.id, {
        pairs: list.pairs,
        col1Lang: list.col1Lang,
        col2Lang: list.col2Lang,
        langSource: list.langSource,
        origin: list.origin,
      })
      if (!updated.ok) return updated
      const renamed =
        list.name === existing.name ? ({ ok: true } as const) : listRepo.rename(list.id, list.name)
      return afterWrite(renamed, emitLists)
    },

    async renameList(id: string, name: string): Promise<WriteResult> {
      return afterWrite(listRepo.rename(id, name), emitLists)
    },

    async removeList(id: string): Promise<WriteResult> {
      if (!listRepo.getById(id)) return { ok: false, reason: 'missing' }
      return afterWrite(listRepo.remove(id), emitLists)
    },

    subscribeSessions(listId, onChange, _onError): Unsubscribe {
      void (_onError satisfies (e: StoreError) => void)
      const entry = { listId, fn: onChange }
      sessionSubs.push(entry)
      onChange(sessionRepo.getAll(listId))
      return () => {
        sessionSubs = sessionSubs.filter((s) => s !== entry)
      }
    },

    async recordSession(record: SessionRecord): Promise<WriteResult> {
      return afterWrite(sessionRepo.add(record), emitSessions)
    },

    subscribeGames(onChange, _onError): Unsubscribe {
      void (_onError satisfies (e: StoreError) => void)
      gameSubs.push(onChange)
      onChange(gameRepo.getAll())
      return () => {
        gameSubs = gameSubs.filter((fn) => fn !== onChange)
      }
    },

    async recordGame(record: GameRecord): Promise<WriteResult> {
      return afterWrite(gameRepo.add(record), emitGames)
    },

    subscribeTests(onChange, _onError): Unsubscribe {
      void (_onError satisfies (e: StoreError) => void)
      testSubs.push(onChange)
      onChange(testRepo.getAll())
      return () => {
        testSubs = testSubs.filter((fn) => fn !== onChange)
      }
    },

    async saveTest(test: SavedTest): Promise<WriteResult> {
      return afterWrite(testRepo.save(test), emitTests)
    },

    async removeTest(id: string): Promise<WriteResult> {
      return afterWrite(testRepo.remove(id), emitTests)
    },

    /**
     * Detaches listeners ONLY.
     *
     * It must never clear localStorage: these lists predate any account, and
     * signing in and out has to leave the device exactly as it was found.
     */
    async dispose(): Promise<void> {
      disposed = true
      listSubs = []
      sessionSubs = []
      gameSubs = []
      testSubs = []
    },
  }
}
