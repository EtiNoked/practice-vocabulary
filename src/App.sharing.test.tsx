import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareStore } from './share/types'
import type { ListStore } from './storage/types'
import type { ListMember, WordList } from './state/types'
import { createMemoryStore } from './storage/memoryStore'
import { configuredGuestStore, renderApp, signedInStore } from './test/renderApp'
import { goTo } from './test/navigate'

/**
 * App-level sharing (016): where a share link lands, and what saving over someone else's
 * newer edit does. The two store hooks are replaced so a signed-in app has a shared list
 * without Firebase; the components themselves have their own suites.
 */

const hooks = vi.hoisted(() => ({
  store: null as ListStore | null,
  share: null as ShareStore | null,
}))

vi.mock('./storage/useListStore', () => ({
  useListStore: () => ({ store: hooks.store, error: null }),
}))
vi.mock('./share/useShareStore', () => ({
  useShareStore: () => hooks.share,
}))
// The join screen has its own suite; here only where App sends people matters.
vi.mock('./share/JoinScreen', () => ({
  default: ({ code, onDone }: { code: string; onDone: (id: string | null) => void }) => (
    <section>
      <h1>Join screen for {code}</h1>
      <button type="button" onClick={() => onDone('shared-1')}>
        Joined
      </button>
      <button type="button" onClick={() => onDone(null)}>
        Not now
      </button>
    </section>
  ),
}))

const account = { uid: 'eti', displayName: 'Eti', email: 'eti@example.com', photoURL: null }

const member = (role: ListMember['role'], displayName: string): ListMember => ({
  role,
  displayName,
  email: null,
  photoURL: null,
  joinedAt: 1,
})

const sharedList = (over: Partial<WordList> = {}): WordList => ({
  id: 'shared-1',
  name: 'French verbs',
  col1Lang: 'en',
  col2Lang: 'fr',
  langSource: 'manual',
  pairs: [{ id: 'p1', col1: 'to be', col2: 'être' }],
  createdAt: 1,
  updatedAt: 100,
  origin: 'manual',
  sharing: {
    ownerUid: 'dana',
    memberUids: ['dana', 'eti'],
    members: { dana: member('owner', 'Dana'), eti: member('editor', 'Eti') },
    updatedBy: 'dana',
  },
  ...over,
})

function fakeShare(): ShareStore {
  return {
    createLink: vi.fn(),
    subscribeLinks: vi.fn(() => () => {}),
    cancelLink: vi.fn(),
    join: vi.fn(),
    decline: vi.fn(),
    setRole: vi.fn(),
    removeMember: vi.fn(),
    leave: vi.fn(),
    stopSharing: vi.fn(),
    subscribeFarewells: vi.fn(() => () => {}),
    keepCopy: vi.fn(),
    dismiss: vi.fn(),
    dispose: vi.fn(),
  } as unknown as ShareStore
}

beforeEach(() => {
  hooks.store = createMemoryStore([sharedList()])
  hooks.share = fakeShare()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a share link', () => {
  it('opens the join screen instead of the welcome screen for a guest', async () => {
    sessionStorage.setItem('pvt.join.pending', 'code-123')
    renderApp(configuredGuestStore())
    expect(await screen.findByRole('heading', { name: /join screen for code-123/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue as guest/i })).not.toBeInTheDocument()
  })

  it('goes to My lists after joining, and does not come back on the next render', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem('pvt.join.pending', 'code-123')
    renderApp(signedInStore(account))
    await user.click(await screen.findByRole('button', { name: 'Joined' }))

    expect(screen.getByRole('heading', { name: /my lists/i })).toBeInTheDocument()
    expect(sessionStorage.getItem('pvt.join.pending')).toBeNull()
  })

  it('a guest who says not now meets the ordinary welcome screen', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem('pvt.join.pending', 'code-123')
    renderApp(configuredGuestStore())
    await user.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(screen.getByRole('button', { name: /continue as guest/i })).toBeInTheDocument()
  })

  it('is ignored entirely without a Firebase project', () => {
    sessionStorage.setItem('pvt.join.pending', 'code-123')
    renderApp()
    expect(screen.queryByRole('heading', { name: /join screen/i })).not.toBeInTheDocument()
  })
})

describe('a shared list on My lists', () => {
  it('shows it as shared, with Members and Leave rather than Delete for a member', async () => {
    const user = userEvent.setup()
    renderApp(signedInStore(account))
    await goTo(user, 'My lists')
    expect(screen.getByText('Shared')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Members' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /leave/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

describe('saving over someone else’s newer edit (016 D-8)', () => {
  async function openEditor(user: ReturnType<typeof userEvent.setup>) {
    await goTo(user, 'My lists')
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await screen.findByRole('button', { name: /start practice/i })
  }

  /** Dana saves while Eti's editor is open. */
  async function danaSaves() {
    await act(async () => {
      await hooks.store!.saveList(sharedList({ name: 'French verbs', updatedAt: 200, pairs: [...sharedList().pairs, { id: 'p2', col1: 'to go', col2: 'aller' }] }))
    })
  }

  const confirmButton = () => screen.getByRole('button', { name: /start practice/i })

  it('asks first, naming who changed it, and keeps theirs on Cancel', async () => {
    const user = userEvent.setup()
    renderApp(signedInStore(account))
    await openEditor(user)
    await danaSaves()

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const save = vi.spyOn(hooks.store!, 'saveList')
    await user.click(confirmButton())

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^Dana changed “French verbs” since you opened it/))
    expect(save).not.toHaveBeenCalled()
    // Back in the editor, now holding Dana's version.
    await waitFor(() => expect(screen.getAllByDisplayValue('aller').length).toBeGreaterThan(0))
  })

  it('saves over theirs on OK', async () => {
    const user = userEvent.setup()
    renderApp(signedInStore(account))
    await openEditor(user)
    await danaSaves()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const save = vi.spyOn(hooks.store!, 'saveList')
    await user.click(confirmButton())
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('does not ask when nobody else has saved', async () => {
    const user = userEvent.setup()
    renderApp(signedInStore(account))
    await openEditor(user)

    const confirm = vi.spyOn(window, 'confirm')
    const save = vi.spyOn(hooks.store!, 'saveList')
    await user.click(confirmButton())
    expect(confirm).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledTimes(1)
  })
})
