import type { WordList } from '../state/types'
import type { ListStore, WriteFailureReason } from './types'

const MIGRATED_KEY = 'pvt.migrated.v1'

export interface MigrationFailure {
  list: WordList
  reason: WriteFailureReason
}

export interface MigrationResult {
  copied: number
  failed: MigrationFailure[]
}

/**
 * Take a single snapshot from a subscription-shaped store.
 *
 * Both implementations emit synchronously-or-soon on subscribe, so this
 * resolves on the first emission and immediately unsubscribes.
 */
export function readListsOnce(store: ListStore): Promise<WordList[]> {
  return new Promise((resolve) => {
    let settled = false
    const unsubscribe = store.subscribeLists(
      (lists) => {
        if (settled) return
        settled = true
        resolve(lists)
        // Defer: the store may still be inside its own subscribe() call, and
        // unsubscribing from within it would mutate the list being iterated.
        queueMicrotask(() => unsubscribe())
      },
      () => {
        if (settled) return
        settled = true
        resolve([])
        queueMicrotask(() => unsubscribe())
      },
    )
  })
}

/**
 * Copy this device's lists into the signed-in user's account.
 *
 * Two properties matter, both from Story 3:
 *
 * IDEMPOTENT — list ids are preserved, so a document written twice is the same
 * document. A retry after a partial failure completes the job instead of
 * producing a second copy of everything that already made it.
 *
 * NON-DESTRUCTIVE — nothing is ever removed from the source. Those lists predate
 * the account, and declining, migrating or signing out must all leave the device
 * exactly as it was found.
 *
 * A failure on one list does not abort the run: the caller gets a per-list
 * report so it can say what did and did not make it, and offer a retry.
 *
 * Local score history is deliberately NOT copied. The rules make session records
 * append-only (`allow update: if false`), so re-writing an already-copied record
 * would be rejected and a retry could never converge. Lists have no such
 * constraint. History therefore stays on the device that recorded it.
 */
export async function migrateLists(from: ListStore, to: ListStore): Promise<MigrationResult> {
  const lists = await readListsOnce(from)
  const failed: MigrationFailure[] = []
  let copied = 0

  // Sequential rather than parallel: a partial failure should be a short prefix
  // of a known order, and it keeps a large migration from opening 50 concurrent
  // writes on a phone connection.
  for (const list of lists) {
    const result = await to.saveList(list)
    if (result.ok) copied += 1
    else failed.push({ list, reason: result.reason })
  }

  return { copied, failed }
}

function readMigrated(): string[] {
  try {
    const raw = localStorage.getItem(MIGRATED_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/**
 * Whether this device has already answered the migration question for `uid`.
 *
 * Set on both outcomes — copying AND declining — because Story 3 requires that
 * the user is not asked again once they have answered.
 */
export function hasMigrated(uid: string): boolean {
  return readMigrated().includes(uid)
}

export function markMigrated(uid: string): void {
  try {
    const all = readMigrated()
    if (all.includes(uid)) return
    localStorage.setItem(MIGRATED_KEY, JSON.stringify([...all, uid]))
  } catch {
    // Worst case the user is offered the copy again; it is idempotent, so
    // accepting twice is harmless.
  }
}
