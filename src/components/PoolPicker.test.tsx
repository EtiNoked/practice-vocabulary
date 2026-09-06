import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PoolPicker, usePoolDraft, type PoolDraft, type PoolLimits } from './PoolPicker'
import type { PoolSpec } from '../state/wordPool'
import type { WordList } from '../state/types'

const makeList = (over: Partial<WordList> & Pick<WordList, 'id' | 'name'>): WordList => ({
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [{ id: 'p1', col1: 'a', col2: 'b' }],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
  ...over,
})

const LISTS = [
  makeList({ id: 'A', name: 'Chapter 1' }),
  makeList({ id: 'B', name: 'Chapter 2' }),
  makeList({ id: 'F', name: 'Paris', col2Lang: 'fr' }),
]

const TEST_LIMITS: PoolLimits = {
  chips: [10, 15, 20],
  min: 1,
  allowUncapped: true,
}

/**
 * A harness, because the draft is a hook and the screens that use it read it.
 *
 * `seen` captures the latest draft so a test can assert on what a real parent would hand
 * to `onStart`, which is the half of this component that has no DOM.
 */
function setup(over: {
  limits?: PoolLimits
  count?: (spec: PoolSpec) => number
  initial?: { spec: PoolSpec; count: number | null }
} = {}) {
  const limits = over.limits ?? TEST_LIMITS
  const count = over.count ?? vi.fn(() => 34)
  const seen: PoolDraft[] = []

  function Harness() {
    const draft = usePoolDraft({
      ...(over.initial !== undefined ? { initial: over.initial } : {}),
      count,
      limits,
    })
    seen.push(draft)
    return <PoolPicker lists={LISTS} draft={draft} limits={limits} />
  }

  render(<Harness />)
  return { user: userEvent.setup(), draft: () => seen[seen.length - 1]!, count }
}

describe('which lists', () => {
  it('offers every list with its word count', () => {
    setup()
    for (const name of [/chapter 1/i, /chapter 2/i, /paris/i]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /chapter 1/i })).toHaveTextContent('1 word')
  })

  it('reports a selection up, in the order it was picked', async () => {
    const { user, draft } = setup()
    await user.click(screen.getByRole('button', { name: /chapter 2/i }))
    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    expect(draft().spec.listIds).toEqual(['B', 'A'])
  })

  it('deselects, and releases the language pair at zero', async () => {
    const { user, draft } = setup()
    const one = screen.getByRole('button', { name: /chapter 1/i })
    await user.click(one)
    expect(screen.getByRole('button', { name: /paris/i })).toBeDisabled()
    await user.click(one)
    expect(draft().spec.listIds).toEqual([])
    expect(screen.getByRole('button', { name: /paris/i })).toBeEnabled()
  })

  it('disables an incompatible list and states its pair as the reason', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    const paris = screen.getByRole('button', { name: /paris/i })
    expect(paris).toBeDisabled()
    expect(paris).toHaveTextContent(/english → french/i)
    expect(paris).toHaveTextContent(/one language pair/i)
  })
})

describe('which words', () => {
  it('starts on all words and switches to misses', async () => {
    const { user, draft } = setup()
    expect(draft().spec.source).toBe('all')
    await user.click(screen.getByRole('button', { name: /words i got wrong/i }))
    expect(draft().spec.source).toBe('missed')
  })

  it('rebuilds the pool when the source changes, and NOT when the number box does', async () => {
    const count = vi.fn(() => 34)
    const { user } = setup({ count })
    const before = count.mock.calls.length
    await user.type(screen.getByRole('spinbutton'), '2')
    expect(count.mock.calls.length).toBe(before)

    await user.click(screen.getByRole('button', { name: /words i got wrong/i }))
    expect(count.mock.calls.length).toBeGreaterThan(before)
  })
})

describe('how many', () => {
  it('offers the chips that fit the pool, and hides the ones that do not', () => {
    setup({ count: () => 12 })
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '15' })).not.toBeInTheDocument()
  })

  it('picks a chip', async () => {
    const { user, draft } = setup()
    await user.click(screen.getByRole('button', { name: '15' }))
    expect(draft().count).toBe(15)
    expect(draft().asking).toBe(15)
  })

  /*
   * THE regression this component exists to keep. The state is a raw string because a
   * controlled number input whose value is clamped on every render cannot be cleared:
   * emptying it re-renders as the minimum and the next digit appends to that, so typing
   * "4" over "10" gives 104.
   */
  it('can be cleared and retyped — 4 over 10 is 4, not 104', async () => {
    const { user, draft } = setup()
    const box = screen.getByRole('spinbutton')
    await user.clear(box)
    await user.type(box, '4')
    expect(draft().asking).toBe(4)
  })

  it('clamps a number above the pool at the point it is USED, not as it is typed', async () => {
    const { user, draft } = setup({ count: () => 34 })
    const box = screen.getByRole('spinbutton')
    await user.clear(box)
    await user.type(box, '99')
    expect(box).toHaveValue(99)
    expect(draft().asking).toBe(34)
  })

  it('hides the count controls entirely when the pool is too small to run', () => {
    setup({ count: () => 0 })
    expect(screen.queryByText(/how many words/i)).not.toBeInTheDocument()
  })

  it('respects a caller’s hard ceiling above the pool', () => {
    setup({ count: () => 400, limits: { chips: [10], min: 1, max: 50, allowUncapped: false } })
    expect(screen.getByRole('button', { name: 'All 50' })).toBeInTheDocument()
    expect(screen.getByText(/tops out at 50/i)).toBeInTheDocument()
  })
})

describe('“all of them”', () => {
  it('means UNCAPPED when the caller allows it, so a saved test grows with its lists', async () => {
    const { user, draft } = setup({ count: () => 34 })
    await user.click(screen.getByRole('button', { name: 'All 34' }))
    // null, not 34: re-run next month against 60 words and it asks all 60.
    expect(draft().count).toBeNull()
    expect(draft().asking).toBe(34)
  })

  it('means literally N when the caller does not, because a game is dealt once', async () => {
    const { user, draft } = setup({
      count: () => 7,
      limits: { chips: [10, 15, 20], min: 4, max: 50, allowUncapped: false },
    })
    await user.click(screen.getByRole('button', { name: 'All 7' }))
    expect(draft().count).toBe(7)
  })

  it('is given up the moment a number is typed', async () => {
    const { user, draft } = setup({ count: () => 34 })
    await user.click(screen.getByRole('button', { name: 'All 34' }))
    await user.type(screen.getByRole('spinbutton'), '5')
    expect(draft().count).toBe(5)
  })
})

describe('pre-filling', () => {
  it('restores a saved selection, source and cap', () => {
    const { draft } = setup({
      initial: { spec: { listIds: ['A', 'B'], source: 'missed' }, count: 15 },
    })
    expect(draft().spec).toEqual({ listIds: ['A', 'B'], source: 'missed' })
    expect(draft().count).toBe(15)
    expect(screen.getByRole('button', { name: /chapter 1/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('restores an uncapped test as uncapped, not as today’s number', () => {
    const { draft } = setup({
      count: () => 34,
      initial: { spec: { listIds: ['A'], source: 'all' }, count: null },
    })
    expect(draft().count).toBeNull()
    expect(screen.getByRole('button', { name: 'All 34' })).toHaveAttribute('aria-pressed', 'true')
  })
})
