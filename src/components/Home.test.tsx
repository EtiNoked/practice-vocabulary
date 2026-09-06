import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Home, type Brief } from './Home'

/**
 * The brief.
 *
 * 012 D-1 emptied this screen: no collection, no log, no create verb. What is left is
 * where you stand and where you can go, and both of those are worth pinning — an
 * at-a-glance line that invents a number while the store is still loading is the specific
 * way this screen can lie.
 */

const brief = (over: Partial<Brief> = {}): Brief => ({
  lists: 3,
  tests: 2,
  games: 12,
  practices: 18,
  lastPractice: { label: 'Lesson 3', right: 10, total: 12, pct: 83 },
  lastGame: { label: 'Food', correct: 8, asked: 10 },
  average: { pct: 76, runs: 5 },
  ...over,
})

const setup = (over: Partial<Parameters<typeof Home>[0]> = {}) => {
  const routes = {
    onLists: vi.fn(),
    onTests: vi.fn(),
    onGames: vi.fn(),
    onPractices: vi.fn(),
  }
  render(<Home brief={brief()} {...routes} {...over} />)
  return { ...routes, user: userEvent.setup() }
}

describe('the four ways out', () => {
  it.each([
    ['My lists', 'onLists'],
    ['My tests', 'onTests'],
    ['My games', 'onGames'],
    ['My practices', 'onPractices'],
  ] as const)('%s routes to its section', async (name, handler) => {
    const harness = setup()
    await harness.user.click(screen.getByRole('button', { name: new RegExp(name, 'i') }))
    expect(harness[handler]).toHaveBeenCalled()
  })

  it('hints how much is in each', () => {
    setup()
    expect(screen.getByRole('button', { name: /my lists/i })).toHaveTextContent('3 lists')
    expect(screen.getByRole('button', { name: /my tests/i })).toHaveTextContent('2 saved')
    expect(screen.getByRole('button', { name: /my games/i })).toHaveTextContent('12 rounds')
    expect(screen.getByRole('button', { name: /my practices/i })).toHaveTextContent('18 runs')
  })

  it('says none rather than zero for an empty section', () => {
    setup({ brief: brief({ lists: 0, tests: 0, games: 0, practices: 0 }) })
    expect(screen.getByRole('button', { name: /my lists/i })).toHaveTextContent(/none yet/i)
  })
})

describe('where you stand', () => {
  // `selector: 'p'` because the label is its own span inside the line — without it the
  // query lands on the span and there is no score there to assert against.
  const line = (what: RegExp) => screen.getByText(what, { selector: 'p' })

  it('leads with the most recent practice and game', () => {
    setup()
    expect(line(/^Last practice:/)).toHaveTextContent('Lesson 3')
    expect(line(/^Last practice:/)).toHaveTextContent('10 / 12 (83%)')
    expect(line(/^Last game:/)).toHaveTextContent('Food')
    expect(line(/^Last game:/)).toHaveTextContent('8 / 10')
  })

  it('omits a clause it has nothing to say about', () => {
    setup({ brief: brief({ lastGame: null }) })
    expect(line(/^Last practice:/)).toBeInTheDocument()
    expect(screen.queryByText(/^Last game:/, { selector: 'p' })).not.toBeInTheDocument()
  })

  it('invites a first drill when there is no history at all', () => {
    setup({ brief: brief({ lastPractice: null, lastGame: null, average: null }) })
    expect(screen.getByText(/nothing practised yet/i)).toBeInTheDocument()
  })

  it('carries the rolling average, which used to live on the home log', () => {
    setup()
    expect(line(/^Averaging/)).toHaveTextContent('76% over your last 5 full runs')
  })

  it('says nothing about an average before there is one', () => {
    // One run is not a trend — `trend()` returns null below two, and the brief must not
    // invent a sentence for it.
    setup({ brief: brief({ average: null }) })
    expect(screen.queryByText(/averaging/i)).not.toBeInTheDocument()
  })

  /*
   * The one way this screen can lie.
   *
   * "0 lists" shown to a signed-in user whose data is still arriving reads as an account
   * that has lost everything — the same reason SavedLists, SavedTests, GameHistory and
   * ReviewScreen each carry three states rather than two.
   */
  it('claims no numbers at all while the store is still loading', () => {
    setup({
      loading: true,
      brief: brief({ lists: 0, tests: 0, games: 0, practices: 0, average: null }),
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText(/0 lists/)).not.toBeInTheDocument()
    expect(screen.queryByText(/none yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/nothing practised yet/i)).not.toBeInTheDocument()
  })

  it('still offers the four routes while loading', () => {
    // The sections work before their contents arrive; only the counts have to wait.
    setup({ loading: true })
    expect(screen.getByRole('button', { name: /my lists/i })).toBeInTheDocument()
  })
})

describe('what no longer lives here (012 D-1)', () => {
  it.each(['New list', 'Build a test', 'Play a game'])('has no %s button', (verb) => {
    setup()
    expect(screen.queryByRole('button', { name: verb })).not.toBeInTheDocument()
  })

  it('shows no collection', () => {
    setup()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('the banner slot', () => {
  it('renders an account notice at the front door', () => {
    // The migration offer is account-level and belongs here rather than buried in a
    // section — it is the one thing that survived the clear-out.
    setup({ banner: <p>Copy 3 lists</p> })
    expect(screen.getByText('Copy 3 lists')).toBeInTheDocument()
  })

  it('renders nothing when there is nothing to say', () => {
    setup()
    expect(screen.queryByText('Copy 3 lists')).not.toBeInTheDocument()
  })
})
