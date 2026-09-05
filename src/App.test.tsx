import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { listRepo } from './storage/listRepo'
import type { WordList } from './state/types'
import { speechCalls } from './test/setup'

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
    render(<App />)

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
    render(<App />)

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
    render(<App />)
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
    render(<App />)

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
    render(<App />)
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
