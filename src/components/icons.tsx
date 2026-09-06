import type { ReactNode } from 'react'

/**
 * The navigation icons.
 *
 * Inline SVG rather than an icon library or emoji (012 D-7). A library is a dependency
 * and a bundle-guard fight for six glyphs; emoji render at wildly different weights
 * across platforms and several go full-colour in dark mode, which would fight the token
 * palette 007 built.
 *
 * `1em` and `currentColor` are the whole design. An icon inherits the type scale and the
 * theme token of whatever it sits inside, so there is no second palette to keep in sync
 * with `theme.css` and no dark-mode variant for anyone to forget. Nothing in this file
 * names a colour, and `icons.test.tsx` fails the build if that changes.
 *
 * Every glyph is `aria-hidden` and every one is rendered beside a real text label
 * (012 NFR-5). None of them is ever the only carrier of meaning.
 */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      /*
       * `shrink-0` is not cosmetic: these sit in flex rows beside labels that wrap on a
       * narrow phone, and a flex item with no basis squashes to nothing there.
       */
      className="shrink-0"
    >
      {children}
    </svg>
  )
}

/** A roof over a house. */
export function HomeIcon() {
  return (
    <Glyph>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </Glyph>
  )
}

/** Bulleted lines — a word list. */
export function ListsIcon() {
  return (
    <Glyph>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </Glyph>
  )
}

/** A clipboard with a tick — a test you have set up. */
export function TestsIcon() {
  return (
    <Glyph>
      <path d="M9 3h6v3H9z" />
      <path d="M8 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-2" />
      <path d="m9 13.5 2 2 4-4" />
    </Glyph>
  )
}

/** A gamepad. */
export function GamesIcon() {
  return (
    <Glyph>
      <path d="M17 7H7a5 5 0 0 0-5 5v1a4 4 0 0 0 7 2.6h6A4 4 0 0 0 22 13v-1a5 5 0 0 0-5-5z" />
      <path d="M6.5 12h3M8 10.5v3" />
      <path d="M15.5 11h.01M17.5 13h.01" />
    </Glyph>
  )
}

/** Bars on a baseline — scores over time. */
export function PracticesIcon() {
  return (
    <Glyph>
      <path d="M3 21h18" />
      <path d="M7 21v-6M12 21v-11M17 21v-8" />
    </Glyph>
  )
}

/**
 * The menu trigger's glyph.
 *
 * Beside the word "Menu", never instead of it: an icon-only trigger would break NFR-5 and
 * every end-to-end suite's accessible-name lookup at the same time.
 */
export function MenuIcon() {
  return (
    <Glyph>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Glyph>
  )
}
