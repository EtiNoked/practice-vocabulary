import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppState } from '../state/appMachine'
import {
  GamesIcon,
  HomeIcon,
  ListsIcon,
  MenuIcon,
  PracticesIcon,
  TestsIcon,
} from './icons'

interface Props {
  /** Which screen is showing, so the menu can mark where you already are. */
  screen: AppState['screen']
  /** What leaving would cost, if anything. */
  guard: 'drill' | 'edit' | 'game' | null
  onHome: () => void
  onLists: () => void
  onTests: () => void
  onGames: () => void
  onPractices: () => void
}

/**
 * What leaving costs, named rather than implied.
 *
 * "Are you sure?" tells a user nothing they did not already know. Both of these
 * say what specifically disappears, which is the only part worth reading.
 */
const CONFIRM: Record<'drill' | 'edit' | 'game', string> = {
  drill:
    "You're in the middle of a drill. Leaving will end it and it won't be recorded. Leave anyway?",
  edit: 'You have a list open. Leaving will discard anything you have not saved. Leave anyway?',
  /*
   * Says "scored so far" rather than "won't be recorded", because a quit game IS
   * recorded — for the questions it asked (008 FR-30). Reusing the drill's sentence
   * here would be a small lie about what the button does.
   */
  game: "You're in the middle of a game. Leaving will end it and keep only what you've scored so far. Leave anyway?",
}

/** The five destinations, as the menu and the home cards both name them. */
type Section = 'home' | 'lists' | 'tests' | 'games' | 'practices'

/**
 * Which section a screen belongs to.
 *
 * A section owns several screens: the editor and the ready screen are places you got to
 * from My lists, and the builder from My tests. Marking only the exact screen would leave
 * a user two taps into a section told they are nowhere.
 *
 * `practising` and `results` are deliberately ABSENT, and absent is the answer rather
 * than an oversight — a drill can be reached from a list OR from a saved test, so there
 * is no honest section to mark, and marking one would say something that may be false.
 */
const SECTION: Partial<Record<AppState['screen'], Section>> = {
  home: 'home',
  lists: 'lists',
  editing: 'lists',
  ready: 'lists',
  tests: 'tests',
  testSetup: 'tests',
  games: 'games',
  gameSetup: 'games',
  playing: 'games',
  gameResults: 'games',
  review: 'practices',
  reviewDetail: 'practices',
}

/**
 * Navigation: one control, in the corner, opposite the account slot.
 *
 * Deliberately NOT abstracted into a shared popover with `AccountMenu`. Two call
 * sites is not three, and that component's version carries a modal-layering
 * special case this one has no use for — the shared thing would be a superset of
 * both rather than the intersection. The open/close behaviour here is copied on
 * purpose, and the reasons for each part of it are written out there.
 *
 * Five destinations since 012, and only destinations: the verbs ("New list", "Build a
 * test", "Play a game") moved to the sections they add to, so this menu answers exactly
 * one question — where do you want to be.
 */
export function NavMenu({
  screen,
  guard,
  onHome,
  onLists,
  onTests,
  onGames,
  onPractices,
}: Props) {
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

  const here = SECTION[screen]

  const item = (icon: ReactNode, label: string, section: Section, go: () => void) => {
    const current = here === section
    return (
      <button
        type="button"
        role="menuitem"
        {...(current ? { 'aria-current': 'page' as const } : {})}
        onClick={() => leave(go)}
        className={`btn btn-quiet w-full justify-start gap-2 border-0 bg-transparent ${
          current ? 'font-semibold text-primary' : ''
        }`}
      >
        {icon}
        {label}
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="btn btn-quiet gap-2 text-sm"
      >
        {/* Beside the word, never instead of it — the glyph is aria-hidden, so the
            trigger's accessible name is still exactly "Menu". */}
        <MenuIcon />
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
          className="card absolute left-0 z-40 mt-2 flex w-52 flex-col p-2 text-left"
        >
          {item(<HomeIcon />, 'Home', 'home', onHome)}
          {item(<ListsIcon />, 'My lists', 'lists', onLists)}
          {item(<TestsIcon />, 'My tests', 'tests', onTests)}
          {item(<GamesIcon />, 'My games', 'games', onGames)}
          {item(<PracticesIcon />, 'My practices', 'practices', onPractices)}
        </div>
      )}
    </div>
  )
}
