import type { ReactNode } from 'react'
import { GamesIcon, ListsIcon, PracticesIcon, TestsIcon } from './icons'

/**
 * Where the user stands, in numbers.
 *
 * Derived in `App` from the same live subscriptions the sections read, against the same
 * `now` (012 NFR-4) — nothing here is stored, and nothing is cached, so the brief cannot
 * drift from the screen it summarises.
 *
 * The two "last" entries are nullable and their absence is meaningful: no practice yet is
 * a different thing from a practice that scored nothing.
 */
export interface Brief {
  lists: number
  tests: number
  games: number
  practices: number
  /** The newest RUN, already folded — never a raw record (012 D-6). */
  lastPractice: { label: string; right: number; total: number; pct: number } | null
  lastGame: { label: string; correct: number; asked: number } | null
  /**
   * How the last few full runs have gone, or null when there is not yet a trend.
   *
   * The one thing `ScoreHistory` carried that nothing else did. Its ten-row log is
   * `ReviewScreen`'s job now — day-grouped, filterable, openable — but an average has to
   * be somewhere, and a brief is exactly where it belongs.
   */
  average: { pct: number; runs: number } | null
}

interface Props {
  /** Slot for account-level notices, e.g. the migration offer. */
  banner?: ReactNode
  /** True while we do not yet know whose data this is. */
  loading?: boolean
  brief: Brief
  onLists: () => void
  onTests: () => void
  onGames: () => void
  onPractices: () => void
}

/** "None yet" rather than "0 lists": a count of nothing is not a fact worth stating. */
const count = (n: number, one: string, many: string) =>
  n === 0 ? 'None yet' : `${n} ${n === 1 ? one : many}`

/**
 * The front door — a brief, and four ways out of it.
 *
 * This screen used to carry three verbs, two collections and a history log, all competing
 * for the same eye. 012 D-1 moved every one of them beside the thing it acts on: the verbs
 * to their sections, the collections to theirs. What is left is the two questions worth
 * answering on arrival — how am I doing, and where am I going.
 *
 * The banner survived the clear-out on purpose. It is an account-level notice and belongs
 * at the front door, not buried one tap deep.
 */
export function Home({
  banner,
  loading = false,
  brief,
  onLists,
  onTests,
  onGames,
  onPractices,
}: Props) {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Vocabulary Trainer</h1>
        <p className="mt-1 text-ink-muted">Hear a word, say the answer, mark yourself.</p>
      </header>

      {banner}

      {/*
        Three states, like every other surface in this app. A brief that says "0 lists"
        to a signed-in user whose data is still arriving reads as an account that has
        lost everything, which is the one lie this screen is capable of telling.
      */}
      {loading ? (
        <p className="text-ink-muted" role="status">
          Getting your things together…
        </p>
      ) : (
        <div className="flex flex-col gap-1 text-ink-muted">
          {brief.lastPractice === null && brief.lastGame === null ? (
            <p>Nothing practised yet. Pick a list and go.</p>
          ) : (
            <>
              {brief.lastPractice && (
                <p>
                  Last practice:{' '}
                  <span className="text-ink">{brief.lastPractice.label}</span>,{' '}
                  {brief.lastPractice.right} / {brief.lastPractice.total} (
                  {brief.lastPractice.pct}%)
                </p>
              )}
              {brief.lastGame && (
                <p>
                  Last game: <span className="text-ink">{brief.lastGame.label}</span>,{' '}
                  {brief.lastGame.correct} / {brief.lastGame.asked}
                </p>
              )}
              {brief.average && (
                <p>
                  Averaging{' '}
                  <span className="text-ink">{brief.average.pct}%</span> over your last{' '}
                  {brief.average.runs} full runs.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/*
        A nav rather than a bare stack of buttons: these four ARE the navigation of the
        app, and the menu in the corner is the same four. Naming the region says so to a
        screen reader instead of leaving it to be inferred from four adjacent buttons.
      */}
      <nav aria-label="Sections" className="flex flex-col gap-2">
        <Card icon={<ListsIcon />} label="My lists" hint={hint(loading, brief.lists, 'list', 'lists')} onClick={onLists} />
        <Card icon={<TestsIcon />} label="My tests" hint={hint(loading, brief.tests, 'saved', 'saved')} onClick={onTests} />
        <Card icon={<GamesIcon />} label="My games" hint={hint(loading, brief.games, 'round', 'rounds')} onClick={onGames} />
        <Card
          icon={<PracticesIcon />}
          label="My practices"
          hint={hint(loading, brief.practices, 'run', 'runs')}
          onClick={onPractices}
        />
      </nav>
    </section>
  )
}

/** The hint waits for the data; the route does not (012 FR-2). */
const hint = (loading: boolean, n: number, one: string, many: string) =>
  loading ? '' : count(n, one, many)

function Card({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="btn btn-quiet btn-lg justify-start gap-3">
      {icon}
      <span className="flex flex-col items-start">
        <span>{label}</span>
        {/*
          Empty while loading, and then it renders nothing at all rather than a
          placeholder that reserves space and flickers.
        */}
        {hint && <span className="text-sm font-normal text-ink-muted">{hint}</span>}
      </span>
    </button>
  )
}
