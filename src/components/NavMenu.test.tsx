import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NavMenu } from './NavMenu'
import type { AppState } from '../state/appMachine'

const setup = (over: Partial<Parameters<typeof NavMenu>[0]> = {}) => {
  const onHome = vi.fn()
  const onReview = vi.fn()
  render(
    <NavMenu
      screen={'home' as AppState['screen']}
      guard={null}
      onHome={onHome}
      onReview={onReview}
      {...over}
    />,
  )
  return { onHome, onReview, user: userEvent.setup() }
}

const trigger = () => screen.getByRole('button', { name: /menu/i })

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

  it('opens to the two destinations', async () => {
    const { user } = setup()
    await user.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /review/i })).toBeInTheDocument()
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

  it('marks the screen you are already on', async () => {
    const { user } = setup({ screen: 'review' as AppState['screen'] })
    await user.click(trigger())
    expect(screen.getByRole('menuitem', { name: /review/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('menuitem', { name: /home/i })).not.toHaveAttribute('aria-current')
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
    const { user, onReview } = setup()
    await user.click(trigger())
    await user.click(screen.getByRole('menuitem', { name: /review/i }))
    expect(onReview).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('leaving something unfinished', () => {
  it('says nothing when there is nothing to lose', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const { user, onReview } = setup({ guard: null })
    await user.click(trigger())
    await user.click(screen.getByRole('menuitem', { name: /review/i }))
    expect(confirm).not.toHaveBeenCalled()
    expect(onReview).toHaveBeenCalled()
  })

  it('warns that a drill will end and go unrecorded', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user, onReview } = setup({ guard: 'drill' })
    await user.click(trigger())
    await user.click(screen.getByRole('menuitem', { name: /review/i }))
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/won't be recorded/i))
    expect(onReview).toHaveBeenCalledTimes(1)
  })

  it('stays put when the warning is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user, onReview } = setup({ guard: 'drill' })
    await user.click(trigger())
    await user.click(screen.getByRole('menuitem', { name: /review/i }))
    expect(onReview).not.toHaveBeenCalled()
  })

  it('warns about unsaved list changes in the editor', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user, onHome } = setup({ guard: 'edit' })
    await user.click(trigger())
    await user.click(screen.getByRole('menuitem', { name: /home/i }))
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/have not saved/i))
    expect(onHome).toHaveBeenCalled()
  })
})
