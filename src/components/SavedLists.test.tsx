import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WordList } from '../state/types'
import { SavedLists } from './SavedLists'

const list: WordList = {
  id: 'a',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [{ id: 'p1', col1: 'daughter', col2: 'dochter' }],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

const setup = (lists: WordList[]) => {
  const handlers = {
    onPractise: vi.fn(),
    onEdit: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  }
  render(<SavedLists lists={lists} {...handlers} />)
  return { ...handlers, user: userEvent.setup() }
}

describe('SavedLists', () => {
  it('explains the empty state rather than showing a blank area', () => {
    setup([])
    expect(screen.getByText(/no saved lists yet/i)).toBeInTheDocument()
  })

  it('shows the name and word count', () => {
    setup([list])
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
    expect(screen.getByText(/1 word/)).toBeInTheDocument()
  })

  it.each(['practise', 'edit', 'rename', 'delete'] as const)('offers %s', async (action) => {
    const handlers = setup([list])
    await handlers.user.click(screen.getByRole('button', { name: new RegExp(action, 'i') }))
    const key = `on${action[0]!.toUpperCase()}${action.slice(1)}` as keyof typeof handlers
    expect(handlers[key]).toHaveBeenCalledWith(list)
  })
})
