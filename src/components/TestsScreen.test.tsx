import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TestsScreen } from './TestsScreen'
import type { WordList } from '../state/types'
import type { SavedTest } from '../state/testPlan'

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

const savedTest: SavedTest = {
  id: 't1',
  name: 'Weak verbs',
  spec: { listIds: ['a'], source: 'all' },
  count: 10,
  createdAt: 1,
  updatedAt: 2,
}

const setup = (over: Partial<Parameters<typeof TestsScreen>[0]> = {}) => {
  const onBuildTest = vi.fn()
  render(
    <TestsScreen
      tests={[savedTest]}
      lists={[list]}
      count={() => 10}
      onBuildTest={onBuildTest}
      onRun={vi.fn()}
      onEdit={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      {...over}
    />,
  )
  return { onBuildTest, user: userEvent.setup() }
}

describe('TestsScreen', () => {
  it('names itself', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'My tests' })).toBeInTheDocument()
  })

  it('keeps Build a test as the primary action', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Build a test' })).toHaveClass('btn-primary')
  })

  it('calls back when it is tapped', async () => {
    const { onBuildTest, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Build a test' }))
    expect(onBuildTest).toHaveBeenCalled()
  })

  it('shows the saved tests', () => {
    setup()
    expect(screen.getByText('Weak verbs')).toBeInTheDocument()
  })

  /*
   * The live count travels end to end. `SavedTests` renders "how many words this selects
   * RIGHT NOW", and a screen that dropped the prop would show a stale number with no
   * visible symptom at all.
   */
  it('hands the live count straight through', () => {
    const count = vi.fn(() => 7)
    setup({ count })
    expect(count).toHaveBeenCalledWith(savedTest.spec)
  })

  it('passes loading through rather than answering for it', () => {
    setup({ tests: [], loading: true })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
