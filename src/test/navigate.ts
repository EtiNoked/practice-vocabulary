import { act, fireEvent, screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/**
 * Reach a section the way a user does — through the real menu.
 *
 * 012 moved the saved lists, the saved tests and the practice log off the home screen, so
 * roughly thirty end-to-end tests that opened with `renderApp()` and immediately clicked
 * Practise now need one navigation step first. Doing that by hand thirty times would
 * produce thirty slightly different paths and, worse, would tempt each one into a
 * shortcut — dispatching straight into the reducer, or reaching for a test id — which
 * would stop the suites exercising the navigation they now depend on (012 D-11).
 *
 * Found by ACCESSIBLE NAME throughout. A class or a test id is not a contract; the
 * trigger's name and the items' `role="menuitem"` are, and `NavMenu.test.tsx` holds them.
 */
export type Section = 'Home' | 'My lists' | 'My tests' | 'My games' | 'My practices'

const trigger = () => screen.getByRole('button', { name: /^menu$/i })

/** Exact, so 'My tests' cannot match 'My practices' or vice versa. */
const item = (section: Section) =>
  screen.getByRole('menuitem', { name: new RegExp(`^${section}$`, 'i') })

/** The userEvent form, for every suite that is not driving fake timers. */
export async function goTo(user: UserEvent, section: Section): Promise<void> {
  await user.click(trigger())
  await user.click(item(section))
}

/**
 * The `fireEvent` form, for `App.game.test.tsx` alone.
 *
 * That file runs a 100ms interval under fake timers and uses `fireEvent` because
 * userEvent drives timers of its own until the two deadlock — the reason is written at
 * the top of that file and at the top of `GameCloud.test.tsx`. This exists so that suite
 * can navigate without being converted to userEvent to fit one helper.
 */
export function goToSync(section: Section): void {
  act(() => void fireEvent.click(trigger()))
  act(() => void fireEvent.click(item(section)))
}
