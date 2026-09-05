import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import type { SignInOutcome } from '../auth/types'

function messageFor(outcome: SignInOutcome): string | null {
  if (outcome.ok) return null
  switch (outcome.reason) {
    case 'cancelled':
      // Closing the popup is a normal choice, not a failure. Say nothing louder
      // than this.
      return 'Sign-in cancelled.'
    case 'blocked':
      return 'Your browser blocked the sign-in popup. Allow popups for this site, then try again.'
    case 'network':
      return "Couldn't reach Google. Check your connection and try again."
    case 'load-failed':
      return "Couldn't load sign-in. You can keep using the app on this device."
    case 'unknown':
      return outcome.message
  }
}

export function AuthPanel() {
  const { status, user, available, signIn, signOut } = useAuth()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // No Firebase project configured: the app is local-only and says nothing about
  // accounts at all, rather than offering a button that cannot work.
  if (!available) return null

  if (status === 'resolving') {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400" role="status">
        Checking your account…
      </p>
    )
  }

  if (status === 'signed-in' && user) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {user.photoURL && (
          <img src={user.photoURL} alt="" className="size-8 rounded-full" width={32} height={32} />
        )}
        <span className="text-sm">
          Signed in as <strong>{user.displayName ?? user.email ?? 'your account'}</strong>
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-11 rounded border border-slate-300 px-3 text-sm dark:border-slate-600"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          // Guarding here as well as in the adapter: a disabled button is the
          // visible half of "one popup at a time".
          setBusy(true)
          setMessage(messageFor(await signIn()))
          setBusy(false)
        }}
        className="min-h-11 rounded-lg border border-slate-300 px-4 disabled:opacity-60 dark:border-slate-600"
      >
        {busy ? 'Opening Google…' : 'Sign in with Google'}
      </button>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        Signing in saves your lists and scores to your Google account so you can use them on your
        phone and laptop. We store your name, email and your lists. Without signing in, everything
        stays on this device and nothing is sent anywhere. You can delete your account and all its
        data at any time.
      </p>

      {message && (
        <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">
          {message}
        </p>
      )}
    </div>
  )
}
