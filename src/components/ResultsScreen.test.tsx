import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createSession, mark, reveal } from '../state/session'
import type { Session, WordList } from '../state/types'
import { ResultsScreen } from './ResultsScreen'

const list: WordList = {
  id: 'a',
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

const noShuffle = () => 0.999999999

/** A finished test drill: one right, one wrong. */
function finishedTest(): Session {
  let s = createSession(list.pairs, noShuffle, list.id, 'test')
  s = mark(reveal(s), 'wrong')
  s = mark(reveal(s), 'right')
  return s
}

/** A finished practice run: nothing marked, because practice never marks. */
function finishedPractice(): Session {
  return { ...createSession(list.pairs, noShuffle, list.id, 'practice'), index: 2 }
}

const setup = (session: Session) => {
  const onRestartShuffled = vi.fn()
  const onRestartWrongOnly = vi.fn()
  const onSwitchMode = vi.fn()
  const onDone = vi.fn()
  render(
    <ResultsScreen
      subject={list}
      session={session}
      onRestartShuffled={onRestartShuffled}
      onRestartWrongOnly={onRestartWrongOnly}
      onSwitchMode={onSwitchMode}
      onDone={onDone}
    />,
  )
  return {
    onRestartShuffled,
    onRestartWrongOnly,
    onSwitchMode,
    onDone,
    user: userEvent.setup(),
  }
}

// FR-14: test mode is unchanged from 001.
describe('after a test drill', () => {
  it('still shows the score and the percentage', () => {
    setup(finishedTest())
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument()
    expect(screen.getByText(/\(50%\)/)).toBeInTheDocument()
  })

  it('still lists the missed pairs', () => {
    setup(finishedTest())
    expect(screen.getByText(/worth another look/i)).toBeInTheDocument()
    expect(screen.getByText('dochter')).toBeInTheDocument()
  })

  it('still offers a shuffled re-run and a wrong-only re-run', async () => {
    const { user, onRestartShuffled, onRestartWrongOnly } = setup(finishedTest())
    await user.click(screen.getByRole('button', { name: /shuffle & restart/i }))
    await user.click(screen.getByRole('button', { name: /wrong ones only/i }))
    expect(onRestartShuffled).toHaveBeenCalled()
    expect(onRestartWrongOnly).toHaveBeenCalled()
  })

  // FR-15: the way into the other mode.
  it('offers a switch to practice', async () => {
    const { user, onSwitchMode } = setup(finishedTest())
    await user.click(screen.getByRole('button', { name: /study these/i }))
    expect(onSwitchMode).toHaveBeenCalled()
  })

  it('still goes home', async () => {
    const { user, onDone } = setup(finishedTest())
    await user.click(screen.getByRole('button', { name: /done/i }))
    expect(onDone).toHaveBeenCalled()
  })
})

describe('after a practice run', () => {
  /**
   * The load-bearing assertion of this task. A practice session marks nothing,
   * so score() reports total: 0 — and rendering "0 / 0 (0%)" after a completed
   * study run would be actively misleading rather than merely wrong.
   */
  it('shows no score, no total and no percentage', () => {
    setup(finishedPractice())
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0 \/ 0/)).not.toBeInTheDocument()
  })

  it('says what was actually accomplished', () => {
    setup(finishedPractice())
    expect(screen.getByText(/all 2 words/i)).toBeInTheDocument()
  })

  it('does not offer a wrong-only re-run, because nothing was marked', () => {
    setup(finishedPractice())
    expect(screen.queryByRole('button', { name: /wrong ones only/i })).not.toBeInTheDocument()
  })

  it('never shows the missed-pairs panel', () => {
    setup(finishedPractice())
    expect(screen.queryByText(/worth another look/i)).not.toBeInTheDocument()
  })

  // FR-15: same mode again, the other mode, or home.
  it('offers practice again', async () => {
    const { user, onRestartShuffled } = setup(finishedPractice())
    await user.click(screen.getByRole('button', { name: /practice again/i }))
    expect(onRestartShuffled).toHaveBeenCalled()
  })

  it('offers a switch to test', async () => {
    const { user, onSwitchMode } = setup(finishedPractice())
    await user.click(screen.getByRole('button', { name: /test yourself/i }))
    expect(onSwitchMode).toHaveBeenCalled()
  })

  it('offers going home', async () => {
    const { user, onDone } = setup(finishedPractice())
    await user.click(screen.getByRole('button', { name: /done/i }))
    expect(onDone).toHaveBeenCalled()
  })

  it('still names the list', () => {
    setup(finishedPractice())
    expect(screen.getByRole('heading', { name: 'Lesson 3' })).toBeInTheDocument()
  })
})
