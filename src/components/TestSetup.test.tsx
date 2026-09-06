import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TestSetup } from './TestSetup'
import type { SavedTest } from '../state/testPlan'
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

const LISTS = [makeList({ id: 'A', name: 'Chapter 1' }), makeList({ id: 'B', name: 'Chapter 2' })]

const setup = (over: Parameters<typeof TestSetup>[0] extends infer P ? Partial<P> : never = {}) => {
  const props = {
    lists: LISTS,
    count: (_spec: PoolSpec) => 34,
    onStart: vi.fn(),
    onSave: vi.fn(),
    onBack: vi.fn(),
    onNewList: vi.fn(),
    ...over,
  }
  render(<TestSetup {...props} />)
  return { ...props, user: userEvent.setup() }
}

afterEach(() => vi.restoreAllMocks())

describe('with nothing to build from', () => {
  it('says so and offers a way to make a list', async () => {
    const { onNewList, user } = setup({ lists: [] })
    expect(screen.getByText(/need a list/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /new list/i }))
    expect(onNewList).toHaveBeenCalled()
  })

  it('says nothing definite while the lists are still arriving', () => {
    setup({ lists: [], loading: true })
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByText(/need a list/i)).not.toBeInTheDocument()
  })
})

describe('the pool', () => {
  it('shows how many words the selection has, and in which direction', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/34/)
    expect(screen.getByRole('status')).toHaveTextContent(/dutch/i)
    expect(screen.getByRole('status')).toHaveTextContent(/english/i)
  })

  it('asks for a list before it can say anything', () => {
    setup()
    expect(screen.getByRole('status')).toHaveTextContent(/pick at least one list/i)
  })

  it('explains an empty misses pool rather than showing a bare zero', async () => {
    const { user } = setup({ count: () => 0 })
    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: /words i got wrong/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/not got any of these wrong/i)
  })
})

describe('starting', () => {
  it('cannot start with nothing selected', () => {
    setup()
    expect(screen.getByRole('button', { name: /^test$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^practice$/i })).toBeDisabled()
  })

  it('starts a test with the plan and the mode', async () => {
    const { onStart, user } = setup()
    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    // 10 is the first chip, and the default the game already uses.
    expect(onStart).toHaveBeenCalledWith(
      { spec: { listIds: ['A'], source: 'all' }, count: 10 },
      'test',
      undefined,
    )
  })

  it('starts a practice run too (011 D-2)', async () => {
    const { onStart, user } = setup()
    await user.click(screen.getByRole('button', { name: /chapter 2/i }))
    await user.click(screen.getByRole('button', { name: /^practice$/i }))
    expect(onStart).toHaveBeenCalledWith(expect.anything(), 'practice', undefined)
  })

  it('carries the cap the user chose', async () => {
    const { onStart, user } = setup()
    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: '20' }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ count: 20 }), 'test', undefined)
  })

  it('carries an uncapped choice as uncapped', async () => {
    const { onStart, user } = setup()
    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: 'All 34' }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ count: null }), 'test', undefined)
  })

  it('can start a pool of one — a single word is a legitimate drill', async () => {
    const { onStart, user } = setup({ count: () => 1 })
    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(onStart).toHaveBeenCalled()
  })
})

describe('saving', () => {
  it('asks for a name and reports the test up', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Weak verbs')
    const { onSave, user } = setup()
    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: /save this test/i }))
    expect(onSave).toHaveBeenCalledWith(
      { spec: { listIds: ['A'], source: 'all' }, count: 10 },
      'Weak verbs',
    )
  })

  it('saves nothing when the name is cancelled or blank', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
    const { onSave, user } = setup()
    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: /save this test/i }))
    expect(onSave).not.toHaveBeenCalled()

    prompt.mockReturnValue('   ')
    await user.click(screen.getByRole('button', { name: /save this test/i }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('cannot be saved with no lists picked', () => {
    setup()
    expect(screen.getByRole('button', { name: /save this test/i })).toBeDisabled()
  })
})

describe('editing a saved test', () => {
  const saved: SavedTest = {
    id: 't1',
    name: 'Weak verbs',
    spec: { listIds: ['A', 'B'], source: 'missed' },
    count: null,
    createdAt: 1,
    updatedAt: 2,
  }

  it('opens pre-filled, under its own name', () => {
    setup({ initial: saved })
    expect(screen.getByRole('heading', { name: /weak verbs/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /chapter 1/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /words i got wrong/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('saves changes back under the same name, without asking again', async () => {
    const { onSave, user } = setup({ initial: saved })
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    expect(onSave).toHaveBeenCalledWith(
      { spec: { listIds: ['A', 'B'], source: 'missed' }, count: null },
      'Weak verbs',
    )
  })

  it('starts an edited test as the saved one it came from', async () => {
    const { onStart, user } = setup({ initial: saved })
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(onStart).toHaveBeenCalledWith(expect.anything(), 'test', 't1')
  })
})

describe('leaving', () => {
  it('goes back', async () => {
    const { onBack, user } = setup()
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })
})
