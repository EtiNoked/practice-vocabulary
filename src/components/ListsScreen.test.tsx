import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ListsScreen } from './ListsScreen'
import type { WordList } from '../state/types'

/**
 * A section screen is a heading, its create verb, and a collection that has its own suite.
 *
 * So there is little to test here and that is the point (012 § E): if this file ever needs
 * to assert what the collection RENDERS, the screen has started deriving something, and
 * derivation belongs in `App` where the single `now` lives.
 */

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

const setup = (over: Partial<Parameters<typeof ListsScreen>[0]> = {}) => {
  const onNewList = vi.fn()
  render(
    <ListsScreen
      lists={[list]}
      onNewList={onNewList}
      onPractise={vi.fn()}
      onEdit={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      {...over}
    />,
  )
  return { onNewList, user: userEvent.setup() }
}

describe('ListsScreen', () => {
  it('names itself', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'My lists' })).toBeInTheDocument()
  })

  it('keeps New list as the primary action, where the lists are', () => {
    // Moved off home in 012 D-1: a verb belongs beside the collection it adds to.
    setup()
    expect(screen.getByRole('button', { name: 'New list' })).toHaveClass('btn-primary')
  })

  it('calls back when it is tapped', async () => {
    const { onNewList, user } = setup()
    await user.click(screen.getByRole('button', { name: 'New list' }))
    expect(onNewList).toHaveBeenCalled()
  })

  it('shows the saved lists', () => {
    setup()
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
  })

  it('passes loading through rather than answering for it', () => {
    setup({ lists: [], loading: true })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
