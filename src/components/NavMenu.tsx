import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../state/appMachine'

interface Props {
  /** Which screen is showing, so the menu can mark where you already are. */
  screen: AppState['screen']
  /** What leaving would cost, if anything. */
  guard: 'drill' | 'edit' | null
  onHome: () => void
  onReview: () => void
}

/**
 * What leaving costs, named rather than implied.
 *
 * "Are you sure?" tells a user nothing they did not already know. Both of these
 * say what specifically disappears, which is the only part worth reading.
 */
const CONFIRM: Record<'drill' | 'edit', string> = {
  drill:
    "You're in the middle of a drill. Leaving will end it and it won't be recorded. Leave anyway?",
  edit: 'You have a list open. Leaving will discard anything you have not saved. Leave anyway?',
}

/**
 * Navigation: one control, in the corner, opposite the account slot.
 *
 * Deliberately NOT abstracted into a shared popover with `AccountMenu`. Two call
 * sites is not three, and that component's version carries a modal-layering
 * special case this one has no use for — the shared thing would be a superset of
 * both rather than the intersection. The open/close behaviour here is copied on
 * purpose, and the reasons for each part of it are written out there.
 */
export function NavMenu({ screen, guard, onHome, onReview }: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    /*
     * `pointerdown`, not `click`: a document-level click fires after React's
     * synthetic handler, which makes the ordering awkward to reason about.
     *
     * The trigger is excluded on purpose — without that, its own click closes
     * the menu here and its onClick immediately reopens it, so it never appears
     * to toggle.
     */
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const leave = (go: () => void) => {
    if (guard && !window.confirm(CONFIRM[guard])) return
    setOpen(false)
    go()
  }

  const item = (label: string, here: boolean, go: () => void) => (
    <button
      type="button"
      role="menuitem"
      {...(here ? { 'aria-current': 'page' as const } : {})}
      onClick={() => leave(go)}
      className={`btn btn-quiet w-full justify-start border-0 bg-transparent ${
        here ? 'font-semibold text-primary' : ''
      }`}
    >
      {label}
    </button>
  )

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
        Menu
      </button>

      {open && (
        /*
         * `role="menu"` is load-bearing, not decorative. TestCard and StudyCard
         * bind Space/Enter/Y/N on `window` for the whole drill screen, and stand
         * down while a `[role="menu"]` or `[role="dialog"]` exists. Without this
         * role, typing `n` with the menu open mid-drill silently marks the card
         * wrong underneath whatever the user is reading.
         */
        <div
          ref={popoverRef}
          role="menu"
          className="card absolute left-0 z-40 mt-2 flex w-48 flex-col p-2 text-left"
        >
          {item('Home', screen === 'home', onHome)}
          {item('Review', screen === 'review' || screen === 'reviewDetail', onReview)}
        </div>
      )}
    </div>
  )
}
