import type { ReactNode } from 'react'
import { FixIcon, GamesIcon, ListsIcon, PracticeIcon } from './icons'
import { greeting } from '../state/greeting'

/**
 * Where the user stands, in numbers.
 *
 * Derived in `App` from the same live subscriptions the sections read, against the same
 * `now` (012 NFR-4) — nothing here is stored, and nothing is cached, so the brief cannot
 * drift from the screen it summarises.
 *
 * `misses` and `practiceTarget` are new in 013, and they are what make two of the four
 * tiles verbs rather than routes. Both are absent-or-zero in the same meaningful way the
 * "last" entries always were: an absence is a fact about the account, not a missing value
 * to paper over.
 */
export interface Brief {
  lists: number
  games: number
  /**
   * The name of the list the Practice tile would open, or null when there is none to
   * offer — no history at all, or none whose list still exists.
   *
   * A NAME, not a list. Which list it is belongs to `App`, which holds the live copy;
   * this screen only has to say it out loud (013 D-3).
   */
  practiceTarget: string | null
  /**
   * How many words the misses tile would deal.
   *
   * The same computation that builds the drill, against the same `now` (013 FR-15). A
   * second, cheaper count here is how a tile says 12 and the drill deals 11.
   */
  misses: number
  /** The newest RUN, already folded — never a raw record (012 D-6). */
  lastPractice: { label: string; right: number; total: number; pct: number } | null
  /**
   * How the last few full runs have gone, or null when there is not yet a trend.
   *
   * Carries My practices' only route off this screen since 013 dropped its tile, which is
   * what made dropping it affordable.
   */
  average: { pct: number; runs: number } | null
}

interface Props {
  /** Slot for account-level notices, e.g. the migration offer. */
  banner?: ReactNode
  /** True while we do not yet know whose data this is. */
  loading?: boolean
  brief: Brief
  /**
   * The clock, for the greeting — a parameter rather than a `Date.now()` in here.
   *
   * `App` refreshes it on arriving home, so a tab left open overnight does not still say
   * "Good afternoon", and the greeting agrees with the misses count beside it about which
   * instant this screen was drawn at.
   */
  now: number
  /** The signed-in user's display name, when there is one. Guests have none. */
  name?: string | null
  onLists: () => void
  onGames: () => void
  /** Open the ready screen for `brief.practiceTarget`. Never called when it is null. */
  onPractise: () => void
  /** Deal a drill of the words still being got wrong. Never called at zero. */
  onFixMisses: () => void
  /** The whole practice log — reached from the average line, not from a tile. */
  onPractices: () => void
}

/** "None yet" rather than "0 lists": a count of nothing is not a fact worth stating. */
const count = (n: number, one: string, many: string) =>
  n === 0 ? 'None yet' : `${n} ${n === 1 ? one : many}`

/**
 * The front door — a greeting, a question, and four squares.
 *
 * 012 D-1 emptied this screen of everything that competed for the eye and left four
 * destinations. 013 keeps that discipline and spends two of the four squares on verbs:
 * the list you practised last, and the words you are still getting wrong. Neither CREATES
 * anything — `New list`, `Build a test` and `Play a game` stay beside the collections they
 * add to — so 012 D-1 is narrowed rather than overturned.
 *
 * The banner survived both clear-outs on purpose. It is an account-level notice and
 * belongs at the front door, not buried one tap deep.
 */
export function Home({
  banner,
  loading = false,
  brief,
  now,
  name,
  onLists,
  onGames,
  onPractise,
  onFixMisses,
  onPractices,
}: Props) {
  /*
   * The one thing here that does not wait for the store: the hour is known before the
   * data is, and a greeting withheld until Firestore answers would make the app feel
   * slower than it is.
   */
  const hello = greeting(now, name)

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">{hello}</h1>
        {/*
          The question is also the tile group's accessible name, via aria-labelledby —
          said once, to everybody, rather than duplicated into an aria-label that would
          then be free to drift from what is on screen.
        */}
        <p id="home-question" className="mt-1 text-ink-muted">
          What do you want to do today?
        </p>
      </header>

      {banner}

      {/*
        One line, and a three-rung ladder.

        The average first, because it is the only thing on this screen that says how it is
        GOING rather than what happened once. Below two full runs there is no average —
        `trendOfRuns` returns null and `average` arrives here as null (App.tsx:363) — and a
        user who has just finished their first drill would otherwise read a greeting, four
        squares and no mention of it.

        Three states, like every other surface in this app. A brief that says "Nothing
        practised yet" to a signed-in user whose data is still arriving reads as an account
        that has lost everything, which is the one lie this screen can tell.
      */}
      {loading ? (
        <p className="text-ink-muted" role="status">
          Getting your things together…
        </p>
      ) : brief.average ? (
        <p className="text-ink-muted">
          Averaging <span className="text-ink">{brief.average.pct}%</span> over your last{' '}
          {brief.average.runs} full runs.{' '}
          <button
            type="button"
            onClick={onPractices}
            className="text-sm text-primary underline"
          >
            See all →
          </button>
        </p>
      ) : brief.lastPractice ? (
        <p className="text-ink-muted">
          Last practice: <span className="text-ink">{brief.lastPractice.label}</span>,{' '}
          {brief.lastPractice.right} / {brief.lastPractice.total} ({brief.lastPractice.pct}%)
        </p>
      ) : (
        <p className="text-ink-muted">Nothing practiced yet. Pick a list and go.</p>
      )}

      {/*
        A group rather than a <nav>, which is what 012 used when all four were
        destinations. Two of these now deal a drill, so this is a set of related controls
        and the visible question above is the honest label for it.

        `grid-cols-2` at every width: the whole point of the square is that a thumb finds
        four targets without reading a list, and that holds on the narrowest phone this app
        is used on.
      */}
      <div
        role="group"
        aria-labelledby="home-question"
        className="grid grid-cols-2 items-stretch gap-2"
      >
        <Tile
          icon={<ListsIcon />}
          label="My lists"
          hint={hint(loading, count(brief.lists, 'list', 'lists'))}
          onClick={onLists}
        />
        {/*
          With nothing practised yet there is no drill to open, so the tile routes to where
          one can be started rather than offering a button that would do nothing. A dead
          square is worse than a redirecting one — it costs the same quarter of the screen
          either way.
        */}
        <Tile
          icon={<PracticeIcon />}
          label="Practice"
          hint={hint(loading, brief.practiceTarget ?? 'Pick a list')}
          onClick={brief.practiceTarget === null ? onLists : onPractise}
        />
        <Tile
          icon={<GamesIcon />}
          label="My games"
          hint={hint(loading, count(brief.games, 'round', 'rounds'))}
          onClick={onGames}
        />
        {/*
          Disabled at zero rather than hidden — 006's rule for its zero-count chips: a
          missing control invites the question a disabled one answers. Disabled while
          loading too, because nothing is yet known about the pool, and a drill dealt from
          an unknown one is the tile lying about its own count.
        */}
        <Tile
          icon={<FixIcon />}
          label="Fix your misses"
          hint={hint(
            loading,
            brief.misses === 0 ? 'Nothing to fix' : count(brief.misses, 'word', 'words'),
          )}
          onClick={onFixMisses}
          disabled={loading || brief.misses === 0}
        />
      </div>
    </section>
  )
}

/** The hint waits for the data; the route does not (012 FR-2, 013 FR-12). */
const hint = (loading: boolean, text: string) => (loading ? '' : text)

function Tile({
  icon,
  label,
  hint,
  onClick,
  disabled = false,
}: {
  icon: ReactNode
  label: string
  hint: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      /*
       * `.btn` carries the 44px touch minimum and the radius (005); `min-h-32` makes this a
       * square-ish target rather than a row. The overrides undo `.btn`'s centring, which is
       * right for a lone label and wrong for a stacked icon, label and hint.
       */
      className="btn btn-quiet min-h-32 flex-col items-start justify-start gap-1 py-4 text-left"
    >
      <span className="text-xl text-primary">{icon}</span>
      {/* `min-w-0` so the hint below can wrap instead of forcing the grid column wider. */}
      <span className="mt-auto flex min-w-0 flex-col items-start">
        <span>{label}</span>
        {/*
          Empty while loading, and then it renders nothing at all rather than a placeholder
          that reserves space and flickers.

          `break-words` because this is the one hint the user wrote: a list named
          "Nederlands-woordenlijst" has no space to wrap at, and half a tile wide is not
          much to fit it in.
        */}
        {hint && (
          <span className="text-sm font-normal break-words text-ink-muted">{hint}</span>
        )}
      </span>
    </button>
  )
}
