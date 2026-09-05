import type { WriteFailureReason } from './types'

/**
 * User-facing text for a failed write.
 *
 * Every message follows v1's rule for a full localStorage: say what did not
 * happen, then say what still works. A failed save must never read as "your
 * list is gone" when the list is sitting right there in memory, practisable.
 */
export function writeFailureMessage(reason: WriteFailureReason): string {
  switch (reason) {
    case 'quota':
      return "This device's storage is full, so the list wasn't saved. You can still practise it now."
    case 'unavailable':
      return "Couldn't save to this browser's storage. You can still practise this list now."
    case 'missing':
      return "That list no longer exists, so the change wasn't saved."
    case 'offline':
      return "You're offline, so this isn't saved to your account yet. It will sync when you reconnect."
    case 'permission':
      return "Your account wouldn't accept that change. Try signing out and back in."
    case 'network':
      return "Couldn't reach your account, so the change isn't saved yet. You can still practise now."
  }
}
