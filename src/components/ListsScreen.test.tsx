import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeList } from '../test/fixtures/words'
import { ListsScreen } from './ListsScreen'
import type { WordList } from '../state/types'

/**
 * A section screen is a heading, its create verb, and a collection that has its own suite.
 *
 * So there is little to test here and that is the point (012 § E): if this file ever needs
 * to assert what the collection RENDERS, the screen has started deriving something, and
 * derivation belongs in `App` where the single `now` lives.
 */

const list = makeList({ createdAt: 1, updatedAt: 1 })

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

describe('ordering the lists', () => {
  const named = (id: string, name: string, updatedAt: number): WordList => ({ ...list, id, name, updatedAt })
  // The store delivers newest-changed first; that is the Recent order.
  const lists = [named('z', 'Zoo animals', 3), named('a', 'animals at home', 2), named('m', 'Market', 1)]
  const names = () => screen.getAllByRole('listitem').map((li) => li.querySelector('.font-semibold')!.textContent)

  it('shows the lists as they come (most recently changed first) until A to Z is chosen', async () => {
    const { user } = setup({ lists })
    expect(names()).toEqual(['Zoo animals', 'animals at home', 'Market'])
    expect(screen.getByRole('button', { name: 'Recent' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'A to Z' }))
    expect(names()).toEqual(['animals at home', 'Market', 'Zoo animals'])

    await user.click(screen.getByRole('button', { name: 'Recent' }))
    expect(names()).toEqual(['Zoo animals', 'animals at home', 'Market'])
  })

  it('remembers A to Z on this device', async () => {
    const first = setup({ lists })
    await first.user.click(screen.getByRole('button', { name: 'A to Z' }))
    document.body.innerHTML = ''
    setup({ lists })
    expect(screen.getByRole('button', { name: 'A to Z' })).toHaveAttribute('aria-pressed', 'true')
    expect(names()[0]).toBe('animals at home')
  })

  it('offers no ordering for a single list', () => {
    setup()
    expect(screen.queryByRole('group', { name: /order lists/i })).not.toBeInTheDocument()
  })
})
