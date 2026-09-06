import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SavedTests } from './SavedTests'
import type { SavedTest } from '../state/testPlan'
import type { PoolSpec } from '../state/wordPool'
import type { WordList } from '../state/types'

const makeList = (id: string, name: string): WordList => ({
  id,
  name,
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [{ id: 'p1', col1: 'a', col2: 'b' }],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
})

const LISTS = [makeList('A', 'Chapter 1'), makeList('B', 'Chapter 2')]

const test = (over: Partial<SavedTest> = {}): SavedTest => ({
  id: 't1',
  name: 'Weak verbs',
  spec: { listIds: ['A', 'B'], source: 'missed' },
  count: 15,
  createdAt: 1,
  updatedAt: 2,
  ...over,
})

const setup = (tests: SavedTest[], over: Record<string, unknown> = {}) => {
  const props = {
    tests,
    lists: LISTS,
    count: (_spec: PoolSpec) => 34,
    onRun: vi.fn(),
    onEdit: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  }
  render(<SavedTests {...props} />)
  return { ...props, user: userEvent.setup() }
}

describe('empty and loading', () => {
  it('says nothing definite while tests are still arriving', () => {
    setup([], { loading: true })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText(/no saved tests/i)).not.toBeInTheDocument()
  })

  it('explains what a saved test is for rather than showing an empty list', () => {
    setup([])
    expect(screen.getByText(/no saved tests/i)).toBeInTheDocument()
  })
})

describe('a row', () => {
  it('names the test and describes how it is set up', () => {
    setup([test()])
    expect(screen.getByText('Weak verbs')).toBeInTheDocument()
    expect(screen.getByText(/2 lists · words i got wrong · 15 of 34/i)).toBeInTheDocument()
  })

  /*
   * FR-14: the count is computed NOW. A number stored beside the definition would claim
   * words the user has since learned — and for a misses-only test that is the whole point.
   */
  it('counts against today’s lists, not a stored number', () => {
    const count = vi.fn(() => 6)
    setup([test()], { count })
    expect(count).toHaveBeenCalledWith({ listIds: ['A', 'B'], source: 'missed' })
    expect(screen.getByText(/all 6/i)).toBeInTheDocument()
  })

  it('runs in either mode', async () => {
    const { onRun, user } = setup([test()])
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(onRun).toHaveBeenCalledWith(test(), 'test')
    await user.click(screen.getByRole('button', { name: /^practice$/i }))
    expect(onRun).toHaveBeenCalledWith(test(), 'practice')
  })

  it('edits, renames and deletes', async () => {
    const { onEdit, onRename, onDelete, user } = setup([test()])
    await user.click(screen.getByRole('button', { name: /edit/i }))
    expect(onEdit).toHaveBeenCalledWith(test())
    await user.click(screen.getByRole('button', { name: /rename/i }))
    expect(onRename).toHaveBeenCalledWith(test())
    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledWith(test())
  })
})

describe('a test that can no longer run', () => {
  const orphan = test({ spec: { listIds: ['gone'], source: 'all' } })

  it('says its lists are gone rather than showing a zero', () => {
    setup([orphan], { count: () => 0 })
    expect(screen.getByText(/no lists left/i)).toBeInTheDocument()
  })

  it('cannot be started, but can still be deleted', () => {
    setup([orphan], { count: () => 0 })
    expect(screen.getByRole('button', { name: /^test$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^practice$/i })).toBeDisabled()
    // Never auto-deleted (FR-17) — but the user must be able to clear it out.
    expect(screen.getByRole('button', { name: /delete/i })).toBeEnabled()
  })

  it('cannot be started when its lists are alive but select nothing', () => {
    setup([test()], { count: () => 0 })
    expect(screen.getByRole('button', { name: /^test$/i })).toBeDisabled()
    expect(screen.getByText(/nothing to practise yet/i)).toBeInTheDocument()
  })
})
