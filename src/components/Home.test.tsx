import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Home, type Brief } from './Home'

/**
 * The front door.
 *
 * 012 made this a brief and four destinations. 013 makes it a greeting, one line of
 * where-you-stand and four squares — two of which START something rather than going
 * somewhere. What is worth pinning here is unchanged in kind: the copy that must never
 * appear before the data does, and the fact that a tile which cannot act says so instead
 * of failing quietly.
 */

/** A fixed local morning, so the greeting reads as a clock time. */
const MORNING = new Date(2026, 8, 7, 9, 30).getTime()

const brief = (over: Partial<Brief> = {}): Brief => ({
  lists: 3,
  games: 12,
  practiceTarget: 'Lesson 3',
  misses: 12,
  lastPractice: { label: 'Lesson 3', right: 10, total: 12, pct: 83 },
  average: { pct: 76, runs: 5 },
  ...over,
})

const setup = (over: Partial<Parameters<typeof Home>[0]> = {}) => {
  const routes = {
    onLists: vi.fn(),
    onGames: vi.fn(),
    onPractise: vi.fn(),
    onFixMisses: vi.fn(),
    onPractices: vi.fn(),
  }
  render(<Home brief={brief()} now={MORNING} {...routes} {...over} />)
  return { ...routes, user: userEvent.setup() }
}

const tile = (name: RegExp) => screen.getByRole('button', { name })

describe('the greeting (FR-1, FR-2)', () => {
  it('greets a signed-in user by their first name', () => {
    setup({ name: 'Eti Dahan Noked' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Eti')
  })

  /*
   * Guests are the DEFAULT, not an edge case — the local-only build has no accounts at
   * all. The nameless greeting has to read as a finished sentence, with no comma left
   * dangling and no "there" standing in for a name nobody gave us.
   */
  it('greets a guest without inventing a name', () => {
    setup()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Good morning')
    expect(heading.textContent).not.toMatch(/,/)
  })

  it('reads the clock it is given rather than the real one', () => {
    setup({ now: new Date(2026, 8, 7, 20, 0).getTime(), name: 'Eti' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good evening, Eti')
  })

  it('asks the question (FR-3)', () => {
    setup()
    expect(screen.getByText(/what do you want to do today\?/i)).toBeInTheDocument()
  })

  /*
   * The question is the group's accessible name, rather than being read out twice.
   *
   * 012 wrapped these in a <nav aria-label="Sections">, which was right when all four
   * were destinations. Two of them now start a drill, so the region is a group of
   * controls and the visible question is already the best label it could have.
   */
  it('labels the tiles with the question instead of repeating it for a screen reader', () => {
    setup()
    const group = screen.getByRole('group')
    expect(group).toHaveAccessibleName(/what do you want to do today\?/i)
  })
})

describe('the four squares (FR-7)', () => {
  it.each([
    [/^my lists/i, 'onLists'],
    [/^my games/i, 'onGames'],
    [/^practice/i, 'onPractise'],
    [/^fix your misses/i, 'onFixMisses'],
  ] as const)('%s acts', async (name, handler) => {
    const harness = setup()
    await harness.user.click(tile(name))
    expect(harness[handler]).toHaveBeenCalled()
  })

  it('hints what is behind each collection (FR-8, FR-10)', () => {
    setup()
    expect(tile(/^my lists/i)).toHaveTextContent('3 lists')
    expect(tile(/^my games/i)).toHaveTextContent('12 rounds')
  })

  it('says none rather than zero for an empty collection', () => {
    setup({ brief: brief({ lists: 0, games: 0 }) })
    expect(tile(/^my lists/i)).toHaveTextContent(/none yet/i)
    expect(tile(/^my games/i)).toHaveTextContent(/none yet/i)
  })

  it('names the list the Practice tile would open (FR-9)', () => {
    setup()
    expect(tile(/^practice/i)).toHaveTextContent('Lesson 3')
  })

  it('counts the words the misses tile would deal (FR-11)', () => {
    setup()
    expect(tile(/^fix your misses/i)).toHaveTextContent('12 words')
  })

  it('counts one missed word in the singular', () => {
    setup({ brief: brief({ misses: 1 }) })
    expect(tile(/^fix your misses/i)).toHaveTextContent('1 word')
  })
})

describe('a tile with nothing to act on', () => {
  /*
   * There is no drill to start, so the tile sends you where one can be made rather than
   * offering a button that would do nothing. A dead tile in a 2x2 is worse than a
   * redirecting one: the square is a quarter of the screen either way.
   */
  it('sends Practice to My lists when no list has been practised (FR-9)', async () => {
    const harness = setup({ brief: brief({ practiceTarget: null }) })
    expect(tile(/^practice/i)).toHaveTextContent(/pick a list/i)
    await harness.user.click(tile(/^practice/i))
    expect(harness.onLists).toHaveBeenCalled()
    expect(harness.onPractise).not.toHaveBeenCalled()
  })

  /*
   * Disabled beats hidden, which is 006's rule for its zero-count chips: a missing
   * control invites the question a disabled one answers. And "Nothing to fix" is a
   * genuinely good thing to read.
   */
  it('disables the misses tile at zero rather than dealing an empty drill (FR-11)', async () => {
    const harness = setup({ brief: brief({ misses: 0 }) })
    expect(tile(/^fix your misses/i)).toBeDisabled()
    expect(tile(/^fix your misses/i)).toHaveTextContent(/nothing to fix/i)
    await harness.user.click(tile(/^fix your misses/i))
    expect(harness.onFixMisses).not.toHaveBeenCalled()
  })
})

describe('where you stand (FR-4)', () => {
  it('leads with the rolling average and offers the whole log', async () => {
    const harness = setup()
    expect(screen.getByText(/averaging/i)).toHaveTextContent('76% over your last 5 full runs')
    await harness.user.click(screen.getByRole('button', { name: /see all/i }))
    expect(harness.onPractices).toHaveBeenCalled()
  })

  /*
   * The middle rung, and the reason the ladder has three.
   *
   * `trend()` returns null below two full runs, so a user who has just finished their
   * first drill would otherwise get a greeting, four squares and no mention of the thing
   * they just did.
   */
  it('falls back to the last run when there is no average yet', () => {
    setup({ brief: brief({ average: null }) })
    expect(screen.queryByText(/averaging/i)).not.toBeInTheDocument()
    expect(screen.getByText(/^Last practice:/)).toHaveTextContent('Lesson 3, 10 / 12 (83%)')
  })

  it('invites a first drill when there is no history at all', () => {
    setup({ brief: brief({ average: null, lastPractice: null }) })
    expect(screen.getByText(/nothing practised yet/i)).toBeInTheDocument()
  })

  /*
   * THE one way this screen can lie (FR-5).
   *
   * "None yet" and "Nothing practised yet" shown to a signed-in user whose data is still
   * arriving read as an account that has lost everything — the same reason SavedLists,
   * SavedTests, GameHistory and ReviewScreen each carry three states rather than two.
   */
  it('claims no numbers at all while the store is still loading', () => {
    setup({
      loading: true,
      brief: brief({
        lists: 0,
        games: 0,
        misses: 0,
        practiceTarget: null,
        lastPractice: null,
        average: null,
      }),
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText(/none yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/nothing practised yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/nothing to fix/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pick a list/i)).not.toBeInTheDocument()
  })

  it('greets you while loading, since the hour does not depend on the store', () => {
    setup({ loading: true, name: 'Eti' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Eti')
  })

  it('still offers the routes that need no data, and no drill that does (FR-12)', () => {
    setup({ loading: true, brief: brief({ misses: 0, practiceTarget: null }) })
    expect(tile(/^my lists/i)).toBeEnabled()
    expect(tile(/^my games/i)).toBeEnabled()
    // Nothing is known about the pool yet, so there is no honest drill to deal.
    expect(tile(/^fix your misses/i)).toBeDisabled()
  })
})

describe('what still does not live here (012 D-1, narrowed by 013 D-2)', () => {
  /*
   * The verbs that CREATE things stayed on their sections. 013 added two that START
   * something over words that already exist, which is a different kind of verb — and the
   * distinction is the whole of what 012 D-1 is left saying.
   */
  it.each(['New list', 'Build a test', 'Play a game'])('has no %s button', (verb) => {
    setup()
    expect(screen.queryByRole('button', { name: verb })).not.toBeInTheDocument()
  })

  it('shows no collection', () => {
    setup()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('the banner slot (FR-6)', () => {
  it('renders an account notice at the front door', () => {
    setup({ banner: <p>Copy 3 lists</p> })
    expect(screen.getByText('Copy 3 lists')).toBeInTheDocument()
  })

  it('renders nothing when there is nothing to say', () => {
    setup()
    expect(screen.queryByText('Copy 3 lists')).not.toBeInTheDocument()
  })
})
