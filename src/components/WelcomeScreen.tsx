import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { signInFailureMessage } from '../auth/messages'

interface Props {
  /** The user has chosen to carry on without an account. */
  onContinueAsGuest: () => void
}

/** The Google mark. Inline rather than fetched: an external asset would need a
 *  CSP `img-src` addition and a network request on the very first paint. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}

/**
 * The front door.
 *
 * It exists because the choice between "sign in" and "just let me practise" used
 * to be a banner wedged above the user's word lists — a deliberate decision
 * presented as decoration, with a six-line privacy paragraph a returning guest
 * re-read on every visit forever. Asking once, on its own screen, is what makes
 * it a decision and what lets the home screen be about word lists.
 *
 * Both routes are buttons of equal weight. Continuing without an account is not
 * a lesser choice — the app was built to work that way and still does.
 *
 * No success callback: a completed sign-in flips auth `status` to `signed-in`,
 * which is what closes the gate in App. One source of truth for who you are.
 */
export function WelcomeScreen({ onContinueAsGuest }: Props) {
  const { signIn } = useAuth()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <section className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Vocabulary Trainer</h1>
        <p className="mt-1 text-ink-muted">Hear a word, say the answer, mark yourself.</p>
      </header>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            // Guarding here as well as in the adapter: a disabled button is the
            // visible half of "one popup at a time".
            setBusy(true)
            setMessage(signInFailureMessage(await signIn()))
            setBusy(false)
          }}
          className="btn btn-primary btn-lg"
        >
          {busy ? (
            'Opening Google…'
          ) : (
            <>
              <GoogleMark />
              Sign in with Google
            </>
          )}
        </button>

        <button type="button" onClick={onContinueAsGuest} className="btn btn-quiet btn-lg">
          Continue as guest
        </button>
      </div>

      {message && (
        <p role="alert" className="rounded-md bg-accent-soft p-3 text-sm text-ink">
          {message}
        </p>
      )}

      <p className="text-sm text-ink-muted">
        Signing in saves your lists and scores to your Google account so you can use them on your
        phone and laptop. We store your name, email and your lists. Without signing in, everything
        stays on this device and nothing is sent anywhere. You can delete your account and all its
        data at any time.
      </p>
    </section>
  )
}
