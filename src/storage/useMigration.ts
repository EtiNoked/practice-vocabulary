import { useCallback, useEffect, useState } from 'react'
import { createLocalListStore } from './localListStore'
import { hasMigrated, markMigrated, migrateLists, readListsOnce, type MigrationResult } from './migrate'
import type { ListStore } from './types'

export interface MigrationOffer {
  /** How many device lists are waiting. 0 means show nothing. */
  count: number
  copy: () => Promise<MigrationResult>
  dismiss: () => void
}

/**
 * Decides whether to offer copying this device's lists into the account.
 *
 * Offered once per account per device, on both outcomes — accepting AND
 * declining mark it answered, because Story 3 requires the user is not asked
 * again once they have said no.
 */
export function useMigration(cloudStore: ListStore | null, uid: string | null): MigrationOffer {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!uid || !cloudStore || hasMigrated(uid)) return

    let cancelled = false
    const local = createLocalListStore()
    void readListsOnce(local).then((lists) => {
      if (!cancelled) setCount(lists.length)
    })

    return () => {
      cancelled = true
      setCount(0)
      void local.dispose()
    }
  }, [uid, cloudStore])

  const copy = useCallback(async (): Promise<MigrationResult> => {
    if (!uid || !cloudStore) return { copied: 0, failed: [] }

    const local = createLocalListStore()
    const result = await migrateLists(local, cloudStore)
    await local.dispose()

    // Only mark it answered once everything actually landed — otherwise a
    // partial failure would silently swallow the rest of the user's lists.
    if (result.failed.length === 0) {
      markMigrated(uid)
      setCount(0)
    }
    return result
  }, [uid, cloudStore])

  const dismiss = useCallback(() => {
    if (uid) markMigrated(uid)
    setCount(0)
  }, [uid])

  return { count, copy, dismiss }
}
