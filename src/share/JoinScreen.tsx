import { useEffect, useState, type ReactNode } from 'react'
import { loadFirebase } from '../auth/firebase'
import { useAuth } from '../auth/useAuth'
import { readLink } from './firestoreShareStore'
import { isEmbeddedBrowser, languagePair, linkStatus } from './links'
import type { JoinFailure, ShareLink, ShareStore } from './types'

interface Props {
  code: string
  /** Null for a guest: joining needs an account, and signing in makes one (D-10). */
  store: ShareStore | null
  /** Where the joiner goes next: the list they joined, or nowhere in particular. */
  onDone: (joinedListId: string | null) => void
}

type Loaded =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'link'; link: ShareLink }

const FAILURE: Record<JoinFailure, string> = {
  unavailable: 'This invitation is no longer available.',
  expired: 'This invitation has expired.',
  used: 'This invitation has already been used.',
  declined: 'This invitation was turned down.',
  own: 'This is your own link.',
  full: 'This list is full, or the invitation just stopped working.',
  offline: "You're offline. Connect and try again.",
  network: "Something went wrong. Check your connection and try again.",
}

/**
 * Where a share link lands (016 Story 3).
 *
 * The common visitor here has never used the app and is signed out, so this screen loads
 * Firebase itself and reads the link's preview, which the rules allow without an account.
 * That is how they see who is inviting them before being asked to sign in. For someone new,
 * signing in with Google IS creating the account, so "make an account, then accept" is one
 * step, not two.
 *
 * Shown instead of the welcome screen and before the first-sign-in migration prompt, which
 * lives on Home and so can only appear after this screen is done.
 */
export default function JoinScreen({ code, store, onDone }: Props) {
  const { status, user, signIn } = useAuth()
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const [failure, setFailure] = useState<JoinFailure | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const embedded = isEmbeddedBrowser(navigator.userAgent)
  // Read once: the verdict on expiry must not flip between two renders.
  const [openedAt] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    loadFirebase()
      .then((services) => readLink(services, code))
      .then(
        (link) => !cancelled && setLoaded(link ? { kind: 'link', link } : { kind: 'missing' }),
        () => !cancelled && setLoaded({ kind: 'error' }),
      )
    return () => {
      cancelled = true
    }
  }, [code])

  const link = loaded.kind === 'link' ? loaded.link : null
  const owner = link?.preview.ownerName ?? 'Someone'
  const status_ = link ? linkStatus(link, openedAt) : null

  let body: ReactNode
  if (embedded) {
    /*
     * Inside Instagram, Facebook and similar in-app browsers, Google refuses to sign anyone
     * in. Saying so first saves a dead end at the sign-in popup (plan R3).
     */
    body = (
      <>
        <p>Open this link in your browser to join. Google sign-in doesn't work inside this app.</p>
        <p className="text-sm text-ink-muted">
          Use the menu (⋯) and choose “Open in browser”, or copy the link and paste it into Safari or Chrome.
        </p>
        <button
          type="button"
          className="btn btn-primary self-start"
          onClick={() => {
            void navigator.clipboard?.writeText(window.location.origin + `/?join=${encodeURIComponent(code)}`).then(
              () => setCopied(true),
              () => {},
            )
          }}
        >
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
      </>
    )
  } else if (loaded.kind === 'loading' || status === 'resolving') {
    body = <p role="status" className="text-ink-muted">Opening the invitation…</p>
  } else if (loaded.kind === 'error') {
    body = <p>{FAILURE.network}</p>
  } else if (loaded.kind === 'missing' || !link) {
    body = <p>{FAILURE.unavailable} Ask whoever sent it for a new one.</p>
  } else if (user && link.createdByUid === user.uid) {
    body = <p>{FAILURE.own} Send it to someone, or show them its QR code from the list's Share panel.</p>
  } else if (status_ && status_.kind !== 'waiting' && !failure) {
    body = (
      <p>
        {FAILURE[status_.kind]} Ask {owner} for a new one.
      </p>
    )
  } else {
    const preview = link.preview
    body = (
      <>
        <p className="text-lg">
          <strong>{owner}</strong> invited you to practise <strong>“{preview.listName}”</strong>.
        </p>
        <p className="text-ink-muted">
          {preview.wordCount} {preview.wordCount === 1 ? 'word' : 'words'} · {languagePair(preview)} · you'll be able to{' '}
          {link.role === 'editor' ? 'edit and practise it' : 'practise it'}
        </p>
        {failure && <p role="alert">{FAILURE[failure]}</p>}
        {status === 'signed-in' ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={busy || !store}
              onClick={async () => {
                if (!store) return
                setBusy(true)
                const outcome = await store.join(code)
                setBusy(false)
                if (outcome.ok) onDone(outcome.listId)
                else setFailure(outcome.reason)
              }}
            >
              {busy ? 'Joining…' : 'Join list'}
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-lg"
              disabled={busy || !store}
              onClick={async () => {
                if (store && link.maxUses === 1) await store.decline(code)
                onDone(null)
              }}
            >
              No thanks
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary btn-lg self-start"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await signIn()
                setBusy(false)
              }}
            >
              Sign in with Google to join
            </button>
            <p className="text-sm text-ink-muted">New here? Signing in creates your account.</p>
          </>
        )}
      </>
    )
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4 pt-10">
      <h1 className="text-2xl font-semibold">You're invited</h1>
      {body}
      <button type="button" className="btn btn-quiet self-start" onClick={() => onDone(null)}>
        {status === 'signed-in' ? 'Go to my lists' : 'Go to the app'}
      </button>
    </section>
  )
}
