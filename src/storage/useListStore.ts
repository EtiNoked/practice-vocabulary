import { useEffect, useState } from 'react'
import { loadFirebase } from '../auth/firebase'
import { useAuth } from '../auth/useAuth'
import { createFirestoreListStore } from './firestoreListStore'
import { createLocalListStore } from './localListStore'
import type { ListStore } from './types'

export interface ListStoreState {
  /** null while the correct store is still being decided. Render nothing
   *  list-shaped in that window. */
  store: ListStore | null
  /** Set when the cloud store could not be built and we fell back to local. */
  error: string | null
}

const NOT_READY: ListStoreState = { store: null, error: null }

interface Held extends ListStoreState {
  /** Which identity this store belongs to. */
  key: string | null
}

/**
 * Picks the storage implementation from auth state.
 *
 *   resolving → null, because we do not yet know whose data to show. Rendering
 *               the guest store here would flash someone else's (empty) home
 *               screen at a signed-in user.
 *   guest     → localStorage, exactly as v1.
 *   signed-in → Firestore, once the lazy chunk has loaded.
 *
 * The held store is TAGGED with the identity it was built for, and a store whose
 * tag no longer matches is treated as absent. That is what stops one account's
 * lists appearing for a moment under another's after a sign-out/sign-in swap —
 * and it does so by derivation, so there is no clear-then-refill cascade.
 */
export function useListStore(): ListStoreState {
  const { status, user } = useAuth()
  const uid = user?.uid ?? null
  const key = status === 'resolving' ? null : (uid ?? 'guest')

  const [held, setHeld] = useState<Held>({ key: null, store: null, error: null })

  useEffect(() => {
    if (key === null) return

    let cancelled = false
    let created: ListStore | null = null

    const adopt = (store: ListStore, error: string | null) => {
      if (cancelled) {
        // Auth changed again while we were loading. This store belongs to
        // nobody now, and an undisposed one keeps its listeners alive.
        void store.dispose()
        return
      }
      created = store
      setHeld({ key, store, error })
    }

    if (uid === null) {
      adopt(createLocalListStore(), null)
    } else {
      void loadFirebase()
        .then((services) => adopt(createFirestoreListStore(services, uid), null))
        .catch(() =>
          // A cloud store we cannot build must not take the app down with it.
          // Fall back to this device so the user can still work.
          adopt(
            createLocalListStore(),
            "Couldn't reach your account, so you're seeing this device's lists. Changes won't sync yet.",
          ),
        )
    }

    return () => {
      cancelled = true
      void created?.dispose()
    }
  }, [key, uid])

  return held.key === key ? { store: held.store, error: held.error } : NOT_READY
}
