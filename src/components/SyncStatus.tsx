import { useEffect, useState } from 'react'

/** Tracks browser connectivity. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}

interface Props {
  /** Only signed-in users have anything to sync. */
  active: boolean
}

/**
 * Makes "offline" a visible state rather than a mystery.
 *
 * This is the UI half of the decision to accept whole-document last-write-wins
 * (plan.md R5). Losing an edit to a concurrent change on another device is
 * tolerable for a single-user app ONLY if the user can see they were working
 * offline. Without this, the same behaviour just looks like data loss.
 */
export function SyncStatus({ active }: Props) {
  const online = useOnline()

  if (!active || online) return null

  return (
    <p
      role="status"
      className="bg-surface-sunken p-2 text-center text-sm text-ink"
    >
      You&rsquo;re offline. You can keep practising — changes will sync to your account when you
      reconnect.
    </p>
  )
}
