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

/**
 * How this list has been going, on the row itself (012 FR-5).
 *
 * The counts arrive as a function rather than a field on the list, for the reason every
 * live count in this app does: they are derived from history, and a number stored beside
 * the list would be wrong by the next drill.
 */
describe('the practice line', () => {
  const withPractices = (
    practices: (listId: string) => { count: number; lastPct: number } | null,
  ) => {
    const onOpenPractices = vi.fn()
    render(
      <SavedLists
        lists={[list]}
        practices={practices}
        onOpenPractices={onOpenPractices}
        onPractise={vi.fn()}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    return { onOpenPractices, user: userEvent.setup() }
  }

  it('is absent entirely when neither prop is supplied', () => {
    // Several tests render this component directly with no router to hand it — the same
    // rule `onSeeAllHistory` follows on Home.
    setup([list])
    expect(screen.queryByRole('button', { name: /practices/i })).not.toBeInTheDocument()
  })

  it('reports the count and the newest score', () => {
    withPractices(() => ({ count: 5, lastPct: 80 }))
    expect(screen.getByRole('button', { name: /5 practices · last 80%/i })).toBeInTheDocument()
  })

  it('says practice, singular, for one', () => {
    withPractices(() => ({ count: 1, lastPct: 100 }))
    expect(screen.getByRole('button', { name: /^1 practice · last 100%$/i })).toBeInTheDocument()
  })

  it('opens that list’s practices when tapped', async () => {
    const { onOpenPractices, user } = withPractices(() => ({ count: 2, lastPct: 50 }))
    await user.click(screen.getByRole('button', { name: /2 practices/i }))
    expect(onOpenPractices).toHaveBeenCalledWith(list)
  })

  it('shows nothing at all for a list that has never been drilled', () => {
    // Not "0 practices": a row that has nothing to say should say nothing, rather than
    // adding a line of noise to every list on a new account.
    withPractices(() => null)
    expect(screen.queryByRole('button', { name: /practice/i })).not.toBeInTheDocument()
  })

  it('is a button, so it is reachable by keyboard', () => {
    // Deliberately not an anchor: there is no URL in this app (012 D-12), and a hrefless
    // <a> is not focusable.
    withPractices(() => ({ count: 3, lastPct: 67 }))
    expect(screen.getByRole('button', { name: /3 practices/i }).tagName).toBe('BUTTON')
  })
})
