import { useEffect, useState } from 'react'
import { loadFirebase } from '../auth/firebase'
import { useAuth } from '../auth/useAuth'
import { createFirestoreShareStore } from './firestoreShareStore'
import type { ShareStore } from './types'

interface Held {
  uid: string | null
  store: ShareStore | null
}

/**
 * The share store for the signed-in user, or null.
 *
 * Null for a guest and while auth is resolving: a guest's lists are on this device only and
 * cannot be shared, and every sharing control reads null as "Sign in to share" (D-10).
 *
 * Tagged with the uid it was built for, exactly like `useListStore`, so one account's
 * links and farewells can never show for a moment under another's after a swap.
 */
export function useShareStore(): ShareStore | null {
  const { status, user } = useAuth()
  const uid = status === 'signed-in' ? (user?.uid ?? null) : null
  const [held, setHeld] = useState<Held>({ uid: null, store: null })

  useEffect(() => {
    if (uid === null) return
    let cancelled = false
    let created: ShareStore | null = null
    void loadFirebase()
      .then((services) => {
        const store = createFirestoreShareStore(services, uid)
        if (cancelled) {
          void store.dispose()
          return
        }
        created = store
        setHeld({ uid, store })
      })
      .catch(() => {
        /* No cloud, no sharing: the controls say so. The list store reports the outage. */
      })
    return () => {
      cancelled = true
      void created?.dispose()
    }
  }, [uid])

  return held.uid === uid ? held.store : null
}
