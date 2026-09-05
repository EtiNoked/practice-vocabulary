import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountMenu } from './AccountMenu'
import { AuthProvider } from '../auth/AuthContext'
import type { AuthSnapshot, AuthStore } from '../auth/authStore'
import type { AuthUser, SignInOutcome } from '../auth/types'

const user: AuthUser = {
  uid: 'u1',
  displayName: 'Eti',
  email: 'eti@example.com',
  photoURL: null,
}

function fakeStore(snapshot: AuthSnapshot, over: Partial<AuthStore> = {}): AuthStore {
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    signIn: vi.fn(async () => ({ ok: true, user }) as SignInOutcome),
    signOut: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => ({ ok: true as const })),
    ...over,
  }
}

function renderMenu(store: AuthStore, props: Partial<Parameters<typeof AccountMenu>[0]> = {}) {
  const onSignedOut = props.onSignedOut ?? vi.fn()
  const result = render(
    <AuthProvider store={store}>
      <AccountMenu drillInProgress={props.drillInProgress ?? false} onSignedOut={onSignedOut} />
    </AuthProvider>,
  )
  return { ...result, onSignedOut }
}

const signedIn = (over: Partial<AuthStore> = {}, u: AuthUser = user) =>
  fakeStore({ status: 'signed-in', user: u, available: true }, over)

const asGuest = (over: Partial<AuthStore> = {}) =>
  fakeStore({ status: 'guest', user: null, available: true }, over)

/** Opens the menu and returns its trigger. */
async function open(name: RegExp) {
  const trigger = screen.getByRole('button', { name })
  await userEvent.click(trigger)
  return trigger
}

describe('unconfigured', () => {
  it('renders nothing at all', () => {
    const { container } = renderMenu(fakeStore({ status: 'guest', user: null, available: false }))

    // A sign-in control that cannot possibly work is worse than no control, and
    // the bar it sits in must collapse to nothing rather than to empty space.
    expect(container).toBeEmptyDOMElement()
  })
})

describe('resolving', () => {
  it('shows a neutral placeholder, never the signed-out control', () => {
    renderMenu(fakeStore({ status: 'resolving', user: null, available: true }))

    // R2: offering "Sign in" to someone whose session is still restoring reads
    // as having been silently logged out.
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('signed in', () => {
  it('is named for the person, not for the picture', async () => {
    renderMenu(signedIn())
    // The accessible name belongs on the button. Putting it in the image's alt
    // as well would announce it twice.
    await open(/eti/i)
    expect(screen.getByText('eti@example.com')).toBeInTheDocument()
  })

  it('falls back to the email when Google gives no display name', () => {
    renderMenu(signedIn({}, { ...user, displayName: null }))
    expect(screen.getByRole('button', { name: /eti@example\.com/i })).toBeInTheDocument()
  })

  it('says "your account" when Google gives neither name nor email', () => {
    renderMenu(signedIn({}, { ...user, displayName: null, email: null }))
    expect(screen.getByRole('button', { name: /your account/i })).toBeInTheDocument()
  })

  it('signs out', async () => {
    const store = signedIn()
    const { onSignedOut } = renderMenu(store)

    await open(/eti/i)
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(store.signOut).toHaveBeenCalledTimes(1)
    expect(onSignedOut).toHaveBeenCalledTimes(1)
  })
})

describe('the avatar', () => {
  it('shows the Google photo when there is one', async () => {
    renderMenu(signedIn({}, { ...user, photoURL: 'https://lh3.googleusercontent.com/a/x' }))
    expect(await screen.findByRole('presentation', { hidden: true })).toBeTruthy()
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'https://lh3.googleusercontent.com/a/x',
    )
  })

  it('falls back to an initial when the photo fails to load', () => {
    renderMenu(signedIn({}, { ...user, photoURL: 'https://lh3.googleusercontent.com/a/gone' }))

    const img = document.querySelector('img')!
    // A photo URL that was valid at sign-in can rot — revoked, rate-limited, or
    // simply offline. A broken-image icon in the corner is not an acceptable
    // resting state.
    fireEvent.error(img)

    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByRole('button', { name: /eti/i })).toHaveTextContent('E')
  })
})

describe('a guest', () => {
  it('gets a way back in without the home screen advertising it', async () => {
    const store = asGuest()
    renderMenu(store)

    await open(/sign in/i)
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(store.signIn).toHaveBeenCalledTimes(1)
  })

  it('reports a blocked popup inside the menu, without ejecting anywhere', async () => {
    renderMenu(
      asGuest({ signIn: vi.fn(async () => ({ ok: false, reason: 'blocked' }) as SignInOutcome) }),
    )

    await open(/sign in/i)
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/allow popups/i)
  })
})

describe('the popover', () => {
  it('tracks its open state for assistive tech', async () => {
    renderMenu(signedIn())
    const trigger = screen.getByRole('button', { name: /eti/i })

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes on Escape and gives focus back', async () => {
    renderMenu(signedIn())
    const trigger = await open(/eti/i)

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    // Closing a menu and dropping focus on <body> strands a keyboard user at the
    // top of the document.
    expect(document.activeElement).toBe(trigger)
  })

  it('closes when the user points somewhere else', async () => {
    renderMenu(signedIn())
    await open(/eti/i)

    await userEvent.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('toggles rather than reopening when its own trigger is clicked', async () => {
    renderMenu(signedIn())
    const trigger = await open(/eti/i)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // The outside-click handler must exclude the trigger, or the menu closes and
    // instantly reopens — which presents as "the menu never opens".
    await userEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('deleting the account', () => {
  const openDelete = async () => {
    await open(/eti/i)
    await userEvent.click(screen.getByRole('menuitem', { name: /delete my account/i }))
  }

  it('needs an explicit confirmation, not a single click', async () => {
    const store = signedIn()
    renderMenu(store)
    await openDelete()

    expect(store.deleteAccount).not.toHaveBeenCalled()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('interrupts rather than reflowing the page', async () => {
    renderMenu(signedIn())
    await openDelete()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Focus lands on the way out, never on the destructive button — a dialog
    // that opens with "Yes, delete everything" focused is one Enter keypress
    // away from an unrecoverable mistake.
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveFocus()
  })

  it('spells out exactly what is destroyed, and what is not', async () => {
    renderMenu(signedIn())
    await openDelete()

    expect(
      screen.getByText(/all your saved lists and all your practice history/i),
    ).toBeInTheDocument()
    // Device lists were never part of the account.
    expect(screen.getByText(/saved on this device .* are not affected/i)).toBeInTheDocument()
  })

  it('deletes once confirmed, and lands the user back at the front door', async () => {
    const store = signedIn()
    const { onSignedOut } = renderMenu(store)
    await openDelete()

    await userEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }))

    expect(store.deleteAccount).toHaveBeenCalledTimes(1)
    expect(onSignedOut).toHaveBeenCalledTimes(1)
  })

  it('can be backed out of', async () => {
    const store = signedIn()
    renderMenu(store)
    await openDelete()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(store.deleteAccount).not.toHaveBeenCalled()
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument()
  })

  it('can be backed out of with Escape', async () => {
    renderMenu(signedIn())
    await openDelete()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('explains a re-authentication requirement instead of showing a raw error', async () => {
    renderMenu(
      signedIn({
        deleteAccount: vi.fn(async () => ({
          ok: false as const,
          reason: 'requires-recent-login' as const,
        })),
      }),
    )
    await openDelete()
    await userEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/sign in again/i)
  })

  it('stays open after a partial failure so it can be retried', async () => {
    renderMenu(
      signedIn({
        deleteAccount: vi.fn(async () => ({
          ok: false as const,
          reason: 'partial' as const,
          message: 'Some of your data could not be deleted. Try again.',
        })),
      }),
    )
    await openDelete()
    await userEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/could not be deleted/i)
    expect(screen.getByRole('button', { name: /yes, delete everything/i })).toBeInTheDocument()
  })
})

describe('signing out mid-drill', () => {
  it('asks first, and abandons nothing if the answer is no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const store = signedIn()
    const { onSignedOut } = renderMenu(store, { drillInProgress: true })

    await open(/eti/i)
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(store.signOut).not.toHaveBeenCalled()
    expect(onSignedOut).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('goes ahead once the user accepts losing the drill', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const store = signedIn()
    const { onSignedOut } = renderMenu(store, { drillInProgress: true })

    await open(/eti/i)
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(store.signOut).toHaveBeenCalledTimes(1)
    expect(onSignedOut).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })

  it('does not ask when no drill is running', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const store = signedIn()
    renderMenu(store, { drillInProgress: false })

    await open(/eti/i)
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(confirm).not.toHaveBeenCalled()
    expect(store.signOut).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })
})
