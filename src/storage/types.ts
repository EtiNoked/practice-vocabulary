import type { GameRecord } from '../game/types'
import type { SavedTest } from '../state/testPlan'
import type { SessionRecord, WordList } from '../state/types'

/**
 * Why a write failed. A superset of the reasons `listRepo` already returns, so
 * its results are assignable here with no change to that module — which is what
 * keeps its existing test suite valid as the safety net for this refactor.
 *
 * Local-only: 'quota' | 'missing' | 'unavailable'
 * Cloud-only: 'offline' | 'permission' | 'network'
 */
export type WriteFailureReason =
  | 'quota'
  | 'missing'
  | 'unavailable'
  | 'offline'
  | 'permission'
  | 'network'

export type WriteResult = { ok: true } | { ok: false; reason: WriteFailureReason }

export interface StoreError {
  kind: 'permission' | 'offline' | 'network' | 'unknown'
  message: string
}

export type Unsubscribe = () => void

/**
 * Where lists and score history live.
 *
 * Two implementations: `localListStore` (localStorage, for signed-out users) and
 * `firestoreListStore` (per-user cloud, for signed-in ones). `App` picks one from
 * auth state and otherwise cannot tell them apart.
 *
 * SUBSCRIPTION-SHAPED, not getAll()-shaped. Firestore's native form is a live
 * query, and the local store can emit-on-write in a few lines. Modelling both as
 * subscriptions removes App's manual refresh() calls and gives cross-tab sync for
 * free; forcing Firestore into a getAll() shape would mean polling instead.
 *
 * Writes return a WriteResult rather than throwing, because App already renders a
 * toast from exactly that union. Extending a working pattern beats introducing a
 * second, parallel error style.
 */
export interface ListStore {
  /**
   * Emits the current lists immediately, then again after every change.
   * `onError` reports a subscription that is degraded but still live — the caller
   * shows a banner rather than tearing down.
   */
  subscribeLists(
    onChange: (lists: WordList[]) => void,
    onError: (error: StoreError) => void,
  ): Unsubscribe

  saveList(list: WordList): Promise<WriteResult>
  renameList(id: string, name: string): Promise<WriteResult>
  removeList(id: string): Promise<WriteResult>

  /** `listId === null` subscribes to every record, newest first. */
  subscribeSessions(
    listId: string | null,
    onChange: (records: SessionRecord[]) => void,
    onError: (error: StoreError) => void,
  ): Unsubscribe

  recordSession(record: SessionRecord): Promise<WriteResult>

  /**
   * Finished games, newest first, bounded by `MAX_GAME_RECORDS`.
   *
   * NO listId parameter, unlike `subscribeSessions` above — a game draws from several
   * lists at once, so "the games for list X" has no honest answer. Callers that need
   * per-list detail read it off `GameRecord.results`.
   */
  subscribeGames(
    onChange: (records: GameRecord[]) => void,
    onError: (error: StoreError) => void,
  ): Unsubscribe

  recordGame(record: GameRecord): Promise<WriteResult>

  /**
   * Saved tests, newest-updated first.
   *
   * A DOCUMENT collection, unlike `sessions` and `games` above: `saveTest` is create-or-
   * update and `removeTest` exists at all, because a saved test is a definition the user
   * edits rather than a log entry nothing may rewrite. The security rules draw the same
   * line — this is the one collection here that permits `update`.
   */
  subscribeTests(
    onChange: (tests: SavedTest[]) => void,
    onError: (error: StoreError) => void,
  ): Unsubscribe

  saveTest(test: SavedTest): Promise<WriteResult>

  removeTest(id: string): Promise<WriteResult>

  /**
   * Detach every listener and release cached data. Called on sign-out and when
   * the active store is swapped.
   *
   * MUST NOT delete a signed-out user's local lists — those predate any account
   * and must survive signing in and out.
   */
  dispose(): Promise<void>
}
