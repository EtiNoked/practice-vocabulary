import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { GameHistory } from './GameHistory'
import { gameLabel } from '../game/gameRecord'
import type { GameRecord } from '../game/types'

/**
 * The game log.
 *
 * The records have existed since 008 and have never been rendered anywhere — every
 * assertion here is about showing back data the app was already collecting, so the
 * things worth pinning are the ones a fresh surface gets wrong: ordering it does not
 * own, a list that has since been deleted, and a quit round passed off as a full one.
 */

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

/** A fixed 'now', so day headings never depend on when the suite runs. */
const NOW = at(2026, 9, 6, 9)

const game = (over: Partial<GameRecord> = {}): GameRecord => ({
  id: 'g1',
  finishedAt: at(2026, 9, 6, 8),
  listIds: ['a'],
  listNames: ['Lesson 3'],
  source: 'all',
  correct: 8,
  asked: 10,
  points: 64,
  available: 100,
  partial: false,
  ...over,
})

const renderAt = (props: Parameters<typeof GameHistory>[0]) => {
  // The component reads the clock once on mount, as ReviewScreen does — pinning it here
  // is what keeps 'Today' from meaning something different at 00:01.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  return render(<GameHistory {...props} />)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('three states, never two', () => {
  it('says nothing definite while the store is still loading', () => {
    renderAt({ games: [], loading: true })
    expect(screen.getByRole('status')).toBeInTheDocument()
    // "No games yet" shown to a signed-in user mid-load reads as data loss — the rule
    // SavedLists, SavedTests and ReviewScreen all follow.
    expect(screen.queryByText(/no games yet/i)).not.toBeInTheDocument()
  })

  it('says so when there really are none', () => {
    renderAt({ games: [] })
    expect(screen.getByText(/no games yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('lists the rounds when there are some', () => {
    renderAt({ games: [game()] })
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
  })
})

describe('ordering is this component’s job', () => {
  /*
   * `groupRuns` sorts for the drill log. NOTHING sorts games — `subscribeGames` makes no
   * promise this component can rely on — so it must sort for itself. Handing it records
   * out of order is the case that catches an implementation which assumed otherwise.
   */
  it('puts the newest round first even when handed them oldest-first', () => {
    renderAt({
      games: [
        game({ id: 'old', listNames: ['Older'], finishedAt: at(2026, 9, 4) }),
        game({ id: 'new', listNames: ['Newer'], finishedAt: at(2026, 9, 6, 8) }),
      ],
    })
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]!).getByText('Newer')).toBeInTheDocument()
  })

  it('groups by day, using the same headings the practice log uses', () => {
    renderAt({
      games: [
        game({ id: 'a', finishedAt: at(2026, 9, 6, 8) }),
        game({ id: 'b', finishedAt: at(2026, 9, 5, 20) }),
        game({ id: 'c', finishedAt: at(2026, 9, 1) }),
      ],
    })
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '01/09/2026' })).toBeInTheDocument()
  })
})

describe('what a row says', () => {
  it('reports right-of-asked and the points', () => {
    renderAt({ games: [game()] })
    const row = screen.getAllByRole('listitem')[0]!
    expect(row).toHaveTextContent('8 / 10')
    expect(row).toHaveTextContent('64 pts')
  })

  it('marks a round the user quit', () => {
    renderAt({ games: [game({ partial: true })] })
    expect(screen.getByText(/stopped early/i)).toBeInTheDocument()
  })

  it('marks a missed-words round, as the practice log does', () => {
    renderAt({ games: [game({ source: 'missed' })] })
    expect(screen.getByText(/missed words only/i)).toBeInTheDocument()
  })

  /*
   * `listNames` is denormalised on GameRecord for exactly this — a round has to outlive
   * its lists. A row built from a lookup against live lists would render blank here, and
   * would do it only for users who had deleted something.
   */
  it('still names a round whose lists have since been deleted', () => {
    renderAt({ games: [game({ listIds: ['gone'], listNames: ['Deleted list'] })] })
    expect(screen.getByText('Deleted list')).toBeInTheDocument()
  })
})

describe('gameLabel, shared with the brief so the two cannot disagree', () => {
  it('names a single-list round by its list', () => {
    expect(gameLabel(game())).toBe('Lesson 3')
  })

  it('counts a multi-list round, the way runLabel does', () => {
    expect(gameLabel(game({ listNames: ['A', 'B', 'C'] }))).toBe('3 lists')
  })

  it('counts DISTINCT lists — a name repeated is still one list', () => {
    expect(gameLabel(game({ listNames: ['A', 'A'] }))).toBe('A')
  })

  it('survives a record with no lists at all rather than rendering nothing', () => {
    expect(gameLabel(game({ listNames: [] }))).toBe('0 lists')
  })
})
