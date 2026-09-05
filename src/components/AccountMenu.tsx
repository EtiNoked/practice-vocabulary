import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { signInFailureMessage } from '../auth/messages'

interface Props {
  /** A drill is running, so signing out destroys it — ask before doing that. */
  drillInProgress: boolean
  /** Fired after a successful sign-out OR a successful account deletion. */
  onSignedOut: () => void
}

/**
 * The account control: one slot, in the corner, on every screen.
 *
 * It replaces a block of page furniture that only existed on the home screen —
 * "Signed in as Eti / Sign out / Delete my account" laid out as flowing content
 * above the user's word lists. Putting it in a corner is what lets the list
 * screen be about lists, and putting it on every screen means disconnecting does
 * not require navigating home first.
 *
 * One component for guest AND signed-in deliberately: they are the same slot and
 * the same popover, and splitting them would mean maintaining the open/close,
 * focus and escape behaviour twice.
 */
export function AccountMenu({ drillInProgress, onSignedOut }: Props) {
  const { status, user, available, signIn, signOut, deleteAccount } = useAuth()
  const [open, setOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [photoFailed, setPhotoFailed] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  /**
   * Escape and click-outside. Hand-rolled rather than pulled from a library —
   * the project has three runtime dependencies and this is thirty lines.
   *
   * `pointerdown`, not `click`: a document-level click fires after React's
   * synthetic handler, which makes the ordering awkward to reason about, and
   * userEvent dispatches pointer events anyway.
   */
  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // The delete dialog is layered over the menu; Escape peels one layer.
      if (confirmingDelete) {
        setConfirmingDelete(false)
        setMessage(null)
        return
      }
      setOpen(false)
      setMessage(null)
      triggerRef.current?.focus()
    }

    const onDown = (event: PointerEvent) => {
      /*
       * A modal owns every pointer on the page while it is up.
       *
       * Without this, the dialog is a SIBLING of the popover, so a click on
       * "Yes, delete everything" counts as outside, tears the dialog down, and
       * the button's own handler never runs. The overlay is deliberately not
       * click-to-dismiss either: a stray tap should not dismiss a dialog the
       * user opened on purpose, and it certainly should not confirm one.
       */
      if (confirmingDelete) return

      const target = event.target as Node
      // The trigger is excluded on purpose: without this its own click closes
      // the menu here and reopens it in onClick, so it never appears to open.
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
      setMessage(null)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, confirmingDelete])

  // Focus the way OUT of a destructive dialog, never the destructive button.
  useEffect(() => {
    if (confirmingDelete) cancelRef.current?.focus()
  }, [confirmingDelete])

  // No Firebase project: the app is local-only and says nothing about accounts
  // at all, rather than offering a control that cannot work. The bar collapses.
  if (!available) return null

  if (status === 'resolving') {
    return (
      <span
        role="status"
        aria-label="Checking your account"
        className="size-11 rounded-full bg-surface-sunken"
      />
    )
  }

  if (status !== 'signed-in' || !user) {
    return (
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="btn btn-quiet text-sm"
        >
          Sign in
        </button>

        {open && (
          <div
            ref={popoverRef}
            role="menu"
            className="card absolute right-0 z-40 mt-2 flex w-72 flex-col gap-2 p-3"
          >
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                const outcome = await signIn()
                setBusy(false)
                setMessage(signInFailureMessage(outcome))
                if (outcome.ok) setOpen(false)
              }}
              className="btn btn-primary w-full"
            >
              {busy ? 'Opening Google…' : 'Sign in with Google'}
            </button>
            {/* One sentence. The full privacy note belongs on the welcome screen —
                putting it back here rebuilds the wall of text this replaced. */}
            <p className="text-sm text-ink-muted">
              Sync your lists and scores across your devices.
            </p>
            {message && (
              <p role="alert" className="rounded-md bg-accent-soft p-2 text-sm text-ink">
                {message}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  const label = user.displayName ?? user.email ?? 'your account'
  const initial = (user.displayName ?? user.email ?? '?').trim().charAt(0).toUpperCase()

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 place-items-center rounded-full"
      >
        {user.photoURL && !photoFailed ? (
          <img
            src={user.photoURL}
            alt=""
            role="presentation"
            // lh3.googleusercontent.com 403s some referrers, and the symptom is
            // an intermittently blank avatar that is horrible to reproduce. It
            // also stops the app's URL reaching Google on every render.
            referrerPolicy="no-referrer"
            onError={() => setPhotoFailed(true)}
            width={36}
            height={36}
            className="size-9 rounded-full"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-ink"
          >
            {initial}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="menu"
          className="card absolute right-0 z-40 mt-2 flex w-64 flex-col p-2 text-left"
        >
          <div className="border-b border-line px-2 pb-2">
            <p className="truncate font-medium">{label}</p>
            {user.email && user.email !== label && (
              <p className="truncate text-sm text-ink-muted">{user.email}</p>
            )}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              if (
                drillInProgress &&
                !window.confirm(
                  "You're in the middle of a drill. Signing out will end it and it won't be recorded. Sign out anyway?",
                )
              ) {
                return
              }
              await signOut()
              setOpen(false)
              onSignedOut()
            }}
            className="btn btn-quiet mt-2 w-full justify-start border-0 bg-transparent"
          >
            Sign out
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setConfirmingDelete(true)
              setMessage(null)
            }}
            className="btn btn-quiet w-full justify-start border-0 bg-transparent text-wrong"
          >
            Delete my account
          </button>
        </div>
      )}

      {confirmingDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-heading"
            className="card w-full max-w-sm border-wrong bg-wrong-soft p-4"
          >
            <h2 id="delete-account-heading" className="font-semibold">
              Delete my account
            </h2>
            <p className="mt-2 text-sm">
              This permanently deletes your account, all your saved lists and all your practice
              history. It cannot be undone. Lists saved on this device before you signed in are not
              affected.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const outcome = await deleteAccount()
                  setBusy(false)
                  if (outcome.ok) {
                    setConfirmingDelete(false)
                    setOpen(false)
                    setMessage(null)
                    onSignedOut()
                    return
                  }
                  // A partial failure is safe to retry, so keep the dialog open.
                  setMessage(
                    outcome.reason === 'requires-recent-login'
                      ? 'Google needs you to sign in again before deleting your account. Try once more.'
                      : outcome.message,
                  )
                }}
                className="btn btn-danger"
              >
                {busy ? 'Deleting…' : 'Yes, delete everything'}
              </button>
              <button
                ref={cancelRef}
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirmingDelete(false)
                  setMessage(null)
                }}
                className="btn btn-quiet"
              >
                Cancel
              </button>
            </div>
            {message && (
              <p role="alert" className="mt-2 text-sm text-ink">
                {message}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
