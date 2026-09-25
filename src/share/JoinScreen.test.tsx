import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { createAuthStore, type AuthStore } from '../auth/authStore'
import type { AuthPort, AuthUser } from '../auth/types'
import JoinScreen from './JoinScreen'
import { LINK_LIFETIME_MS } from './links'
import type { ShareLink, ShareStore } from './types'

vi.mock('../auth/firebase', () => ({
  loadFirebase: async () => ({ db: {}, fs: {} }),
  resetFirebaseForTests: () => {},
}))

const readLink = vi.fn<(services: unknown, code: string) => Promise<ShareLink | null>>()
vi.mock('./firestoreShareStore', () => ({
  readLink: (services: unknown, code: string) => readLink(services, code),
}))

const dana: AuthUser = { uid: 'dana', displayName: 'Dana', email: 'dana@example.com', photoURL: null }

function link(over: Partial<ShareLink> = {}): ShareLink {
  return {
    code: 'abc',
    listId: 'l1',
    role: 'editor',
    label: null,
    maxUses: 1,
    uses: 0,
    declined: false,
    createdByUid: 'eti',
    createdAt: Date.now() - 60_000,
    preview: { listName: 'French verbs', ownerName: 'Eti', wordCount: 12, col1Lang: 'en', col2Lang: 'fr' },
    ...over,
  }
}

function portFor(u: AuthUser | null): AuthPort {
  return {
    subscribe: (cb) => {
      cb(u)
      return () => {}
    },
    signIn: vi.fn(async () => ({ ok: true as const, user: dana })),
    signOut: async () => {},
    deleteAccount: async () => ({ ok: true }),
  }
}

// A hint makes the store subscribe to the port at once, so it settles on the port's user.
const signedIn = (u: AuthUser = dana) => createAuthStore({ port: portFor(u), configured: true, hasHint: true })
const asGuest = () => {
  const port = portFor(null)
  return { port, auth: createAuthStore({ port, configured: true, hasHint: false }) }
}

function fakeStore(over: Partial<ShareStore> = {}): ShareStore {
  return {
    createLink: vi.fn(),
    subscribeLinks: vi.fn(() => () => {}),
    cancelLink: vi.fn(async () => ({ ok: true as const })),
    join: vi.fn(async () => ({ ok: true as const, listId: 'l1', already: false })),
    decline: vi.fn(async () => ({ ok: true as const })),
    setRole: vi.fn(),
    removeMember: vi.fn(),
    leave: vi.fn(),
    stopSharing: vi.fn(),
    subscribeFarewells: vi.fn(() => () => {}),
    keepCopy: vi.fn(),
    dismiss: vi.fn(),
    dispose: vi.fn(async () => {}),
    ...over,
  }
}

function renderJoin(auth: AuthStore, store: ShareStore | null = null) {
  const onDone = vi.fn()
  render(
    <AuthProvider store={auth}>
      <JoinScreen code="abc" store={store} onDone={onDone} />
    </AuthProvider>,
  )
  return { onDone, user: userEvent.setup() }
}

beforeEach(() => {
  readLink.mockReset()
  readLink.mockResolvedValue(link())
})

describe('a guest', () => {
  it('sees who is inviting them, and to what, before signing in', async () => {
    renderJoin(asGuest().auth)
    expect(await screen.findByText('Eti')).toBeInTheDocument()
    expect(screen.getByText('“French verbs”')).toBeInTheDocument()
    expect(screen.getByText(/12 words/)).toBeInTheDocument()
    expect(readLink).toHaveBeenCalledWith(expect.anything(), 'abc')
  })

  it('is asked to sign in, and signing in is one tap', async () => {
    const { port, auth } = asGuest()
    const { user } = renderJoin(auth)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Google to join' }))
    expect(port.signIn).toHaveBeenCalled()
  })

  it('is not offered Join before signing in', async () => {
    renderJoin(asGuest().auth)
    await screen.findByRole('button', { name: 'Sign in with Google to join' })
    expect(screen.queryByRole('button', { name: 'Join list' })).not.toBeInTheDocument()
  })
})

describe('someone signed in', () => {
  it('can join or say no thanks', async () => {
    renderJoin(signedIn(), fakeStore())
    expect(await screen.findByRole('button', { name: 'Join list' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'No thanks' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
  })

  it('joins, then goes to the list', async () => {
    const store = fakeStore()
    const { onDone, user } = renderJoin(signedIn(), store)
    await user.click(await screen.findByRole('button', { name: 'Join list' }))
    expect(store.join).toHaveBeenCalledWith('abc')
    expect(onDone).toHaveBeenCalledWith('l1')
  })

  it('says why a join was refused, and stays', async () => {
    const store = fakeStore({ join: vi.fn(async () => ({ ok: false as const, reason: 'full' as const })) })
    const { onDone, user } = renderJoin(signedIn(), store)
    await user.click(await screen.findByRole('button', { name: 'Join list' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This list is full')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('declines a one-person link on No thanks, so its owner sees it', async () => {
    const store = fakeStore()
    const { onDone, user } = renderJoin(signedIn(), store)
    await user.click(await screen.findByRole('button', { name: 'No thanks' }))
    expect(store.decline).toHaveBeenCalledWith('abc')
    expect(onDone).toHaveBeenCalledWith(null)
  })

  it('does not decline a group link for everyone else on it', async () => {
    readLink.mockResolvedValue(link({ maxUses: 5 }))
    const store = fakeStore()
    const { onDone, user } = renderJoin(signedIn(), store)
    await user.click(await screen.findByRole('button', { name: 'No thanks' }))
    expect(store.decline).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledWith(null)
  })

  it('is told when the link is their own', async () => {
    readLink.mockResolvedValue(link({ createdByUid: 'dana' }))
    renderJoin(signedIn(), fakeStore())
    expect(await screen.findByText(/this is your own link/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join list' })).not.toBeInTheDocument()
  })
})

describe('a link that does not work', () => {
  it('says a missing link is no longer available', async () => {
    readLink.mockResolvedValue(null)
    renderJoin(signedIn(), fakeStore())
    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join list' })).not.toBeInTheDocument()
  })

  it('says an old link has expired', async () => {
    readLink.mockResolvedValue(link({ createdAt: Date.now() - LINK_LIFETIME_MS - 60_000 }))
    renderJoin(asGuest().auth)
    expect(await screen.findByText(/expired/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
  })
})

describe('inside an app’s embedded browser', () => {
  const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent')!

  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0',
      configurable: true,
    })
  })

  afterEach(() => {
    // The override sits on the instance; removing it lets the prototype's getter show through.
    delete (navigator as { userAgent?: string }).userAgent
    expect(Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent')).toEqual(original)
  })

  it('says to open the link in a browser, where Google sign-in works', () => {
    renderJoin(asGuest().auth)
    expect(screen.getByText(/open this link in your browser to join/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
  })
})
