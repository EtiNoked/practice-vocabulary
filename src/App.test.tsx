import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listRepo } from './storage/listRepo'
import { sessionRepo } from './storage/sessionRepo'
import type { WordList } from './state/types'
import { speechCalls } from './test/setup'
import { renderApp } from './test/renderApp'

const seeded: WordList = {
  id: 'seed',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [
    { id: 'p1', col1: 'daughter', col2: 'dochter' },
    { id: 'p2', col1: 'son', col2: 'zoon' },
  ],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

beforeEach(() => localStorage.clear())

describe('typing a list and practising it', () => {
  it('goes from an empty app to a score', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /new list/i }))

    const cells = () => screen.getAllByRole('textbox').filter((el) => el.dataset.cell !== undefined)
    await user.type(cells()[0]!, 'daughter')
    await user.type(cells()[1]!, 'dochter')

    await user.click(screen.getByRole('button', { name: /start practice/i }))
    expect(screen.getByText(/you'll hear/i)).toBeInTheDocument()

    // The Start tap is what establishes the iOS gesture chain for the session.
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /show answer/i }))
    expect(screen.getByText('daughter')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /right/i }))
    expect(screen.getByText(/1 \/ 1/)).toBeInTheDocument()
    expect(screen.getByText(/\(100%\)/)).toBeInTheDocument()
  })
})

describe('practising a saved list', () => {
  it('lists it on the home screen and drills it', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))

    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /wrong/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))

    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /practise wrong ones only/i })).toBeEnabled()
  })

  it('speaks a word for every card, including after marking', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
    // One for Start, one for the card that marking advanced to.
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(2)
  })
})

describe('editing a saved list', () => {
  it('updates it in place and keeps the same entry', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const daughter = screen.getByDisplayValue('daughter')
    await user.clear(daughter)
    await user.type(daughter, 'granddaughter')
    await user.click(screen.getByRole('button', { name: /start practice/i }))

    // Confirming an edit persists immediately — no separate Save step.
    const stored = listRepo.getAll()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.id).toBe('seed')
    expect(stored[0]!.pairs.map((p) => p.col1)).toContain('granddaughter')
  })
})

describe('pasting a list', () => {
  it('accepts a spreadsheet paste and practises it', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: /new list/i }))
    await user.click(screen.getByRole('button', { name: /paste or import/i }))

    await user.click(screen.getByRole('textbox', { name: /paste/i }))
    await user.paste('daughter\tdochter\nson\tzoon\nuncle\toom')
    await user.click(screen.getByRole('button', { name: /add to list/i }))

    expect(screen.getByText(/3 complete pairs/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /start practice/i }))
    expect(within(screen.getByRole('main')).getByText(/3 words/i)).toBeInTheDocument()
  })
})

describe('recording score history', () => {
  const drillToEnd = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /wrong/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
  }

  it('records a finished drill and shows it on the home screen', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    await drillToEnd(user)
    await user.click(screen.getByRole('button', { name: /done/i }))

    expect(sessionRepo.getAll()).toHaveLength(1)
    expect(sessionRepo.getAll()[0]).toMatchObject({
      listId: 'seed',
      listName: 'Lesson 3',
      right: 1,
      total: 2,
      mode: 'full',
      partial: false,
    })
    expect(screen.getByText(/1 \/ 2 \(50%\)/)).toBeInTheDocument()
  })

  it('records a quit-early drill as partial, over what was answered', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
    await user.click(screen.getByRole('button', { name: /quit/i }))

    expect(sessionRepo.getAll()[0]).toMatchObject({ total: 1, pct: 100, partial: true })
  })

  it('writes NOTHING when the user quits without answering a card', async () => {
    // An empty log entry is noise, and it would drag the average around for a
    // drill that never really happened.
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    await user.click(screen.getByRole('button', { name: /quit/i }))

    expect(sessionRepo.getAll()).toEqual([])
  })

  it('marks a wrong-only re-run so it cannot flatter the average', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    await drillToEnd(user)
    await user.click(screen.getByRole('button', { name: /practise wrong ones only/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))

    const modes = sessionRepo.getAll().map((r) => r.mode)
    expect(modes).toContain('wrong-only')
    expect(modes).toContain('full')
  })

  it('keeps history after the list is deleted', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp()

    await drillToEnd(user)
    await user.click(screen.getByRole('button', { name: /done/i }))
    await user.click(screen.getByRole('button', { name: /delete/i }))

    expect(screen.queryByRole('button', { name: /^practise$/i })).not.toBeInTheDocument()
    // The name was captured at drill time, so the record still reads sensibly.
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
