import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ListMember, WordList } from '../state/types'
import { joinUrl, LINK_LIFETIME_MS } from './links'
import SharingDialog from './SharingDialog'
import type { ShareLink, ShareStore } from './types'

const NOW = Date.UTC(2026, 8, 25, 12)
const ORIGIN = 'https://vocab.example'

const member = (role: ListMember['role'], name: string, joinedAt: number): ListMember => ({
  role,
  displayName: name,
  email: `${name.toLowerCase()}@example.com`,
  photoURL: null,
  joinedAt,
})

function sharedList(members: Record<string, ListMember>): WordList {
  return {
    id: 'l1',
    name: 'French verbs',
    col1Lang: 'en',
    col2Lang: 'fr',
    langSource: 'header',
    pairs: [
      { id: 'p1', col1: 'to be', col2: 'être' },
      { id: 'p2', col1: 'to have', col2: 'avoir' },
    ],
    createdAt: 1,
    updatedAt: 1,
    origin: 'manual',
    sharing: {
      ownerUid: 'owner',
      memberUids: Object.keys(members),
      members,
      updatedBy: 'owner',
    },
  }
}

const privateList = sharedList({ owner: member('owner', 'Eti', 1) })
const twoPeople = sharedList({ owner: member('owner', 'Eti', 1), dana: member('editor', 'Dana', 2) })
const threePeople = sharedList({
  owner: member('owner', 'Eti', 1),
  dana: member('editor', 'Dana', 2),
  noa: member('viewer', 'Noa', 3),
})

function link(over: Partial<ShareLink> = {}): ShareLink {
  return {
    code: 'code-1',
    listId: 'l1',
    role: 'editor',
    label: null,
    maxUses: 1,
    uses: 0,
    declined: false,
    createdByUid: 'owner',
    createdAt: NOW - 2 * 60 * 60 * 1000,
    preview: { listName: 'French verbs', ownerName: 'Eti', wordCount: 2, col1Lang: 'en', col2Lang: 'fr' },
    ...over,
  }
}

function fakeStore(links: ShareLink[] = [], over: Partial<ShareStore> = {}) {
  const store = {
    createLink: vi.fn<ShareStore['createLink']>(async (_list, options) => ({
      ok: true as const,
      link: link({ code: 'new-code', ...options }),
    })),
    // Synchronous, like Firestore's cached first snapshot, so the links are on screen at once.
    subscribeLinks: vi.fn<ShareStore['subscribeLinks']>((_id, onChange) => {
      onChange(links)
      return () => {}
    }),
    cancelLink: vi.fn<ShareStore['cancelLink']>(async () => ({ ok: true })),
    join: vi.fn<ShareStore['join']>(async () => ({ ok: true, listId: 'l1', already: false })),
    decline: vi.fn<ShareStore['decline']>(async () => ({ ok: true })),
    setRole: vi.fn<ShareStore['setRole']>(async () => ({ ok: true })),
    removeMember: vi.fn<ShareStore['removeMember']>(async () => ({ ok: true })),
    leave: vi.fn<ShareStore['leave']>(async () => ({ ok: true })),
    stopSharing: vi.fn<ShareStore['stopSharing']>(async () => ({ ok: true })),
    subscribeFarewells: vi.fn<ShareStore['subscribeFarewells']>(() => () => {}),
    keepCopy: vi.fn<ShareStore['keepCopy']>(async () => ({ ok: true })),
    dismiss: vi.fn<ShareStore['dismiss']>(async () => ({ ok: true })),
    dispose: vi.fn<ShareStore['dispose']>(async () => {}),
    ...over,
  }
  return store
}

function renderDialog({
  list = twoPeople,
  uid = 'owner',
  links = [] as ShareLink[],
  online = true,
  store = fakeStore(links),
} = {}) {
  const onClose = vi.fn()
  const onMessage = vi.fn()
  render(
    <SharingDialog
      list={list}
      uid={uid}
      store={store}
      online={online}
      origin={ORIGIN}
      now={NOW}
      onClose={onClose}
      onMessage={onMessage}
    />,
  )
  return { store, onClose, onMessage, user: userEvent.setup() }
}

const membersList = () => within(screen.getByRole('region', { name: /members/i })).getAllByRole('listitem')
const linksList = () => within(screen.getByRole('region', { name: /^links$/i })).getAllByRole('listitem')

afterEach(() => {
  delete (navigator as { share?: unknown }).share
  delete (navigator as { canShare?: unknown }).canShare
})

describe('the owner view', () => {
  it('is headed with the list it shares', () => {
    renderDialog()
    expect(screen.getByRole('heading', { name: 'Share “French verbs”' })).toBeInTheDocument()
  })

  it('lists the members, owner first, and marks you', () => {
    renderDialog({ list: threePeople })
    const rows = membersList()
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Eti (you)')
    expect(rows[1]).toHaveTextContent('Dana')
    expect(rows[1]).not.toHaveTextContent('(you)')
  })

  it('offers a role choice and Remove for everyone but the owner', () => {
    renderDialog({ list: threePeople })
    const [owner, dana, noa] = membersList()
    expect(within(owner!).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(owner!).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(within(dana!).getByRole('combobox')).toHaveValue('editor')
    expect(within(noa!).getByRole('combobox')).toHaveValue('viewer')
    expect(within(dana!).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('changes a member’s role', async () => {
    const { store, user } = renderDialog()
    await user.selectOptions(within(membersList()[1]!).getByRole('combobox'), 'viewer')
    expect(store.setRole).toHaveBeenCalledWith(twoPeople, 'dana', 'viewer')
  })

  it('removes a member after confirming', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const { store, user } = renderDialog()
    await user.click(within(membersList()[1]!).getByRole('button', { name: 'Remove' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(store.removeMember).toHaveBeenCalledWith(twoPeople, 'dana')
  })
})

describe('creating a link', () => {
  it('makes a one-person link by default', async () => {
    const { store, user } = renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Practise only' }))
    await user.type(screen.getByRole('textbox', { name: /label/i }), 'For Dana')
    await user.click(screen.getByRole('button', { name: 'Create link' }))
    expect(store.createLink).toHaveBeenCalledWith(twoPeople, { role: 'viewer', label: 'For Dana', maxUses: 1 })
  })

  it('sends no label when none was typed', async () => {
    const { store, user } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Create link' }))
    expect(store.createLink).toHaveBeenCalledWith(twoPeople, { role: 'editor', label: null, maxUses: 1 })
  })

  it('makes a group link for as many people as the list still has room for', async () => {
    const { store, user } = renderDialog({ list: threePeople })
    await user.click(screen.getByRole('checkbox', { name: /one link for a group/i }))
    await user.click(screen.getByRole('button', { name: 'Create link' }))
    expect(store.createLink).toHaveBeenCalledWith(threePeople, { role: 'editor', label: null, maxUses: 17 })
  })

  it('reports a refused link rather than showing share options for it', async () => {
    const store = fakeStore([], { createLink: vi.fn(async () => ({ ok: false as const, reason: 'offline' as const })) })
    const { onMessage, user } = renderDialog({ store })
    await user.click(screen.getByRole('button', { name: 'Create link' }))
    expect(onMessage).toHaveBeenCalledWith(expect.stringMatching(/offline/i))
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument()
  })

  it('cannot be done offline, and says why', () => {
    renderDialog({ online: false })
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled()
    expect(screen.getByText(/you're offline\. a link has to be saved before it can be sent/i)).toBeInTheDocument()
  })
})

describe('sending a link', () => {
  const url = joinUrl(ORIGIN, 'new-code')

  async function created() {
    const result = renderDialog()
    await result.user.click(screen.getByRole('button', { name: 'Create link' }))
    return result
  }

  it('offers WhatsApp with the join link in the message', async () => {
    await created()
    const href = screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')!
    expect(href.startsWith('https://wa.me/?text=')).toBe(true)
    expect(href).toContain(encodeURIComponent(url))
  })

  it('offers Email with the join link in the body', async () => {
    await created()
    const href = screen.getByRole('link', { name: 'Email' }).getAttribute('href')!
    expect(href.startsWith('mailto:?subject=')).toBe(true)
    expect(href).toContain(encodeURIComponent(url))
  })

  it('copies the link', async () => {
    const { user } = await created()
    // userEvent.setup() installs its own clipboard, so this reads back what was written.
    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await navigator.clipboard.readText()).toBe(url)
    expect(await screen.findByRole('button', { name: 'Copied ✓' })).toBeInTheDocument()
  })

  it('shows a small QR code and a full-screen one on request', async () => {
    const { user } = await created()
    expect(screen.getByRole('img', { name: /qr code that opens the invitation/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show QR code' }))
    const full = screen.getByRole('dialog', { name: 'QR code for French verbs' })
    expect(within(full).getByRole('img').tagName.toLowerCase()).toBe('svg')
    await user.click(within(full).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog', { name: /qr code/i })).not.toBeInTheDocument()
  })

  it('has no Share… button where there is no share sheet', async () => {
    await created()
    expect(screen.queryByRole('button', { name: 'Share…' })).not.toBeInTheDocument()
  })

  it('opens the share sheet where there is one', async () => {
    const share = vi.fn(async () => {})
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true })
    const { user } = await created()
    await user.click(screen.getByRole('button', { name: 'Share…' }))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url }))
  })
})

describe('copying an existing link', () => {
  it('copies a waiting link straight from its row, without reopening the share options', async () => {
    const { user } = renderDialog({ links: [link({ code: 'older-code', label: 'For Noa' })] })
    await user.click(within(linksList()[0]!).getByRole('button', { name: 'Copy link' }))
    expect(await navigator.clipboard.readText()).toBe(joinUrl(ORIGIN, 'older-code'))
    expect(within(linksList()[0]!).getByRole('button', { name: 'Copied ✓' })).toBeInTheDocument()
  })

  it('offers no copy on a link that no longer works', () => {
    renderDialog({ links: [link({ declined: true }), link({ code: 'old', createdAt: NOW - LINK_LIFETIME_MS - 1 })] })
    for (const row of linksList()) expect(within(row).queryByRole('button', { name: 'Copy link' })).toBeNull()
  })
})

describe('link statuses', () => {
  it('shows a waiting link with when it was made', () => {
    renderDialog({ links: [link()] })
    expect(linksList()[0]).toHaveTextContent('Waiting · created 2h ago')
  })

  it('shows how many have joined a group link', () => {
    renderDialog({ links: [link({ maxUses: 5, uses: 2 })] })
    expect(linksList()[0]).toHaveTextContent('2 of 5 joined')
  })

  it('shows a declined link', () => {
    renderDialog({ links: [link({ declined: true })] })
    expect(linksList()[0]).toHaveTextContent('Declined')
  })

  it('shows a link past its lifetime as expired', () => {
    renderDialog({ links: [link({ createdAt: NOW - LINK_LIFETIME_MS - 1 })] })
    expect(linksList()[0]).toHaveTextContent('Expired')
  })

  it('leaves out a used link, whose person is under Members now', () => {
    renderDialog({ links: [link({ code: 'used', label: 'For Dana', uses: 1 }), link({ code: 'open', label: 'For Noa' })] })
    expect(linksList()).toHaveLength(1)
    expect(screen.queryByText(/for dana/i)).not.toBeInTheDocument()
  })

  it('has no Links section when every link is used', () => {
    renderDialog({ links: [link({ uses: 1 })] })
    expect(screen.queryByRole('region', { name: /^links$/i })).not.toBeInTheDocument()
  })

  it('cancels a link after confirming', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const { store, user } = renderDialog({ links: [link({ label: 'For Dana' })] })
    await user.click(screen.getByRole('button', { name: 'Cancel link' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('For Dana'))
    expect(store.cancelLink).toHaveBeenCalledWith('code-1')
  })

  it('keeps the link when the confirmation is refused', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const { store, user } = renderDialog({ links: [link()] })
    await user.click(screen.getByRole('button', { name: 'Cancel link' }))
    expect(store.cancelLink).not.toHaveBeenCalled()
  })
})

describe('stopping sharing', () => {
  it('is not offered on a list nobody else is in', () => {
    renderDialog({ list: privateList })
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument()
  })

  it('stops after confirming, naming how many people lose it', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const { store, user } = renderDialog({ list: threePeople })
    await user.click(screen.getByRole('button', { name: 'Stop sharing' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2 people'))
    expect(store.stopSharing).toHaveBeenCalledWith(threePeople)
  })

  it('does nothing when the confirmation is refused', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const { store, user } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Stop sharing' }))
    expect(store.stopSharing).not.toHaveBeenCalled()
  })
})

describe('the member view', () => {
  it('has no way to make links', () => {
    renderDialog({ list: threePeople, uid: 'noa' })
    expect(screen.getByRole('heading', { name: '“French verbs”' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create link' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument()
    expect(screen.getByText(/you can practise it/i)).toBeInTheDocument()
  })

  it('shows the members without controls over them', () => {
    renderDialog({ list: threePeople, uid: 'noa' })
    const rows = membersList()
    expect(rows[2]).toHaveTextContent('Noa (you)')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('leaves and keeps a copy, without asking', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const { store, onClose, user } = renderDialog({ list: threePeople, uid: 'noa' })
    await user.click(screen.getByRole('button', { name: 'Leave and keep a copy' }))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(store.leave).toHaveBeenCalledWith(threePeople, { keepCopy: true })
    expect(onClose).toHaveBeenCalled()
  })

  it('asks before leaving without a copy', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const { store, onClose, user } = renderDialog({ list: threePeople, uid: 'noa' })
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(store.leave).toHaveBeenCalledWith(threePeople, { keepCopy: false })
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open when leaving fails', async () => {
    const store = fakeStore([], { leave: vi.fn(async () => ({ ok: false as const, reason: 'offline' as const })) })
    const { onClose, onMessage, user } = renderDialog({ list: threePeople, uid: 'noa', store })
    await user.click(screen.getByRole('button', { name: 'Leave and keep a copy' }))
    expect(onMessage).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('closing', () => {
  it('closes on Escape', () => {
    const { onClose } = renderDialog()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes with the Close button', async () => {
    const { onClose, user } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('lets Escape close only the full-screen QR code when it is open', async () => {
    const { onClose, user } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Create link' }))
    await user.click(screen.getByRole('button', { name: 'Show QR code' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /qr code/i })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
