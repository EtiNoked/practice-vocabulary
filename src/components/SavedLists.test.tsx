import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SessionRecord, WordList } from '../state/types'
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

describe('a list wears its last score', () => {
  const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
    id: 'r1',
    listId: 'a',
    listName: 'Lesson 3',
    right: 8,
    wrong: 2,
    total: 10,
    pct: 80,
    wrongPairs: [],
    rightPairs: [],
    finishedAt: 1000,
    mode: 'full',
    partial: false,
    ...over,
  })

  const row = () => screen.getByText('Lesson 3').closest('li')!

  const withScore = (record: SessionRecord | null) =>
    render(
      <SavedLists
        lists={[list]}
        {...(record ? { scores: new Map([['a', record]]) } : {})}
        onPractise={vi.fn()}
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

  it('goes green on a clean sweep', () => {
    withScore(rec({ right: 10, total: 10, pct: 100 }))
    expect(row()).toHaveClass('border-correct')
  })

  it('goes amber from 70 up', () => {
    withScore(rec({ right: 7, total: 10, pct: 70 }))
    expect(row()).toHaveClass('border-accent')
  })

  it('goes red below 70', () => {
    withScore(rec({ right: 6, total: 10, pct: 60 }))
    expect(row()).toHaveClass('border-incorrect')
  })

  it('stays neutral for a list never drilled', () => {
    withScore(null)
    expect(row()).toHaveClass('border-line-strong')
    expect(screen.queryByText(/last score/i)).not.toBeInTheDocument()
  })

  it('prints the score, so the colour is never the only signal', () => {
    // Colour-blind readers, forced-colours mode and greyscale screenshots all
    // lose the border and keep this.
    withScore(rec())
    expect(screen.getByText(/last score 8 \/ 10 \(80%\)/i)).toBeInTheDocument()
  })

  it('does not show a rounded-up 100% as green', () => {
    withScore(rec({ right: 199, total: 200, pct: 100 }))
    expect(row()).toHaveClass('border-accent')
    // And the fraction beside it explains why the colour disagrees with the %.
    expect(screen.getByText(/199 \/ 200 \(100%\)/)).toBeInTheDocument()
  })

  it('keeps every row the same width, scored or not', () => {
    // A border that thickens on scoring would shuffle the column by a pixel.
    withScore(null)
    expect(row()).toHaveClass('border-2')
  })
})
