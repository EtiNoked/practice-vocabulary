import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NavMenu } from './NavMenu'
import type { AppState } from '../state/appMachine'

const setup = (over: Partial<Parameters<typeof NavMenu>[0]> = {}) => {
  const routes = {
    onHome: vi.fn(),
    onLists: vi.fn(),
    onTests: vi.fn(),
    onGames: vi.fn(),
    onPractices: vi.fn(),
  }
  render(
    <NavMenu screen={'home' as AppState['screen']} guard={null} {...routes} {...over} />,
  )
  return { ...routes, user: userEvent.setup() }
}

const trigger = () => screen.getByRole('button', { name: /^menu$/i })
const item = (name: string) => screen.getByRole('menuitem', { name })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the popover', () => {
  it('starts closed and announces itself as a menu trigger', () => {
    setup()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps a text label on the trigger, glyph or no glyph', () => {
    // An icon-only trigger would break NFR-5 and every end-to-end suite's accessible-name
    // lookup in the same stroke.
    setup()
    expect(trigger()).toHaveTextContent('Menu')
  })

  it('opens to the five sections', async () => {
    const { user } = setup()
    await user.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    for (const name of ['Home', 'My lists', 'My tests', 'My games', 'My practices']) {
      expect(item(name)).toBeInTheDocument()
    }
  })

  it('uses role="menu", which is what stands the drill keyboard down', async () => {
    /*
     * TestCard and StudyCard bind their keys on `window` and bail while a
     * `[role="menu"]` or `[role="dialog"]` exists. Without that role here,
     * typing `n` with this menu open mid-drill marks the current card wrong
     * underneath whatever the user is reading.
     */
    const { user } = setup()
    await user.click(trigger())
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
  })

  it('closes on Escape and hands focus back to the trigger', async () => {
    const { user } = setup()
    await user.click(trigger())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('closes on a click outside', async () => {
    const { user } = setup()
    await user.click(trigger())
    await user.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes again on a second click of the trigger, rather than reopening', async () => {
    // The trigger is excluded from the outside-click check on purpose: without
    // that, its own click closes the menu and the onClick reopens it, so it
    // never appears to toggle.
    const { user } = setup()
    await user.click(trigger())
    await user.click(trigger())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes after navigating', async () => {
    const { user, onPractices } = setup()
    await user.click(trigger())
    await user.click(item('My practices'))
    expect(onPractices).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('every section is reachable', () => {
  it.each([
    ['Home', 'onHome'],
    ['My lists', 'onLists'],
    ['My tests', 'onTests'],
    ['My games', 'onGames'],
    ['My practices', 'onPractices'],
  ] as const)('%s calls its route', async (name, handler) => {
    const harness = setup()
    await harness.user.click(trigger())
    await harness.user.click(item(name))
    expect(harness[handler]).toHaveBeenCalled()
  })

  it('gives every item an icon, and hides every icon from assistive tech', async () => {
    const { user } = setup()
    await user.click(trigger())
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(5)
    for (const el of items) {
      const svg = el.querySelector('svg')
      expect(svg).not.toBeNull()
      // The label is the name; the glyph must not join it.
      expect(svg!.getAttribute('aria-hidden')).toBe('true')
    }
  })
})

/**
 * `aria-current` marks the SECTION, not the screen (012 FR-10).
 *
 * A section owns several screens — the editor and the ready screen belong to My lists,
 * the builder to My tests — and telling a user they are nowhere while they are two taps
 * into a section is the failure worth guarding.
 */
describe('marking where you are', () => {
  const currentItem = () =>
    screen.getAllByRole('menuitem').find((el) => el.hasAttribute('aria-current')) ?? null

  it.each([
    ['home', 'Home'],
    ['lists', 'My lists'],
    ['editing', 'My lists'],
    ['ready', 'My lists'],
    ['tests', 'My tests'],
    ['testSetup', 'My tests'],
    ['games', 'My games'],
    ['gameSetup', 'My games'],
    ['playing', 'My games'],
    ['gameResults', 'My games'],
    ['review', 'My practices'],
    ['reviewDetail', 'My practices'],
  ] as const)('%s belongs to %s', async (screenName, expected) => {
    const { user } = setup({ screen: screenName as AppState['screen'] })
    await user.click(trigger())
    expect(item(expected)).toHaveAttribute('aria-current', 'page')
    expect(currentItem()).toBe(item(expected))
  })

  /*
   * A drill can be reached from a list OR from a saved test, so there is no honest
   * section to mark. Absent is the answer rather than a gap: marking one would tell the
   * user they are somewhere they may not be.
   */
  it.each(['practising', 'results'] as const)('%s belongs to no section', async (where) => {
    const { user } = setup({ screen: where as AppState['screen'] })
    await user.click(trigger())
    expect(currentItem()).toBeNull()
  })
})

describe('leaving something unfinished', () => {
  it('says nothing when there is nothing to lose', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const { user, onPractices } = setup({ guard: null })
    await user.click(trigger())
    await user.click(item('My practices'))
    expect(confirm).not.toHaveBeenCalled()
    expect(onPractices).toHaveBeenCalled()
  })

  it('warns that a drill will end and go unrecorded', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user, onPractices } = setup({ guard: 'drill' })
    await user.click(trigger())
    await user.click(item('My practices'))
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/won't be recorded/i))
    expect(onPractices).toHaveBeenCalledTimes(1)
  })

  it('stays put — and stays open — when the warning is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user, onPractices } = setup({ guard: 'drill' })
    await user.click(trigger())
    await user.click(item('My practices'))
    expect(onPractices).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeInTheDocument()
  })

  it('warns about unsaved list changes in the editor', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user, onHome } = setup({ guard: 'edit' })
    await user.click(trigger())
    await user.click(item('Home'))
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/have not saved/i))
    expect(onHome).toHaveBeenCalled()
  })

  it('warns before abandoning a game, and says what is actually kept', async () => {
    // A quit game IS recorded for what it asked, so this must not borrow the drill's
    // "it won't be recorded" wording.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user, onHome } = setup({ screen: 'playing' as AppState['screen'], guard: 'game' })
    await user.click(trigger())
    await user.click(item('Home'))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('scored so far'))
    expect(onHome).not.toHaveBeenCalled()
  })

  it('leaves the game when the warning is accepted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user, onHome } = setup({ screen: 'playing' as AppState['screen'], guard: 'game' })
    await user.click(trigger())
    await user.click(item('Home'))
    expect(onHome).toHaveBeenCalled()
  })
})
