import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createSession } from '../state/session'
import type { WordList } from '../state/types'
import { speechCalls } from '../test/setup'
import { TestCard } from './TestCard'

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

const setup = (voiceMissing = false, resumed = false) => {
  const onReveal = vi.fn()
  const onMark = vi.fn()
  const onQuit = vi.fn()
  const session = createSession(list.pairs, noShuffle, list.id)
  const utils = render(
    <TestCard
      list={list}
      session={session}
      voiceMissing={voiceMissing}
      resumed={resumed}
      onReveal={onReveal}
      onMark={onMark}
      onQuit={onQuit}
    />,
  )
  return { onReveal, onMark, onQuit, session, user: userEvent.setup(), ...utils }
}

describe('the prompt state', () => {
  // iOS Safari drops speech that does not descend from a user gesture, so the
  // component must never speak from a mount effect. Start/Right/Wrong do it.
  it('does not speak on mount', () => {
    setup()
    expect(speechCalls).toHaveLength(0)
  })

  it('hides the answer from the DOM entirely, not just visually', () => {
    setup()
    expect(screen.queryByText('daughter')).not.toBeInTheDocument()
  })

  it('replays the prompt word on demand, in the prompt language', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /hear it again/i }))
    expect(speechCalls).toEqual([
      { type: 'cancel' },
      { type: 'speak', text: 'dochter', lang: 'nl-NL', voice: 'Google Nederlands', rate: 0.9 },
    ])
  })

  it('can be replayed repeatedly', async () => {
    const { user } = setup()
    const button = screen.getByRole('button', { name: /hear it again/i })
    await user.click(button)
    await user.click(button)
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(2)
  })

  it('shows progress and the running tally', () => {
    setup()
    expect(screen.getByText(/card 1 of 2/i)).toBeInTheDocument()
  })

  it('asks the caller to reveal', async () => {
    const { user, onReveal } = setup()
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    expect(onReveal).toHaveBeenCalled()
  })

  it('offers no marking buttons before the answer is revealed', () => {
    setup()
    expect(screen.queryByRole('button', { name: /right/i })).not.toBeInTheDocument()
  })
})

describe('the revealed state', () => {
  const revealed = () => {
    const onMark = vi.fn()
    const session = { ...createSession(list.pairs, noShuffle, list.id), revealed: true }
    render(
      <TestCard
        list={list}
        session={session}
        voiceMissing={false}
        resumed={false}
        onReveal={vi.fn()}
        onMark={onMark}
        onQuit={vi.fn()}
      />,
    )
    return { onMark, user: userEvent.setup() }
  }

  it('shows both columns', () => {
    revealed()
    expect(screen.getByText('daughter')).toBeInTheDocument()
    expect(screen.getByText('dochter')).toBeInTheDocument()
  })

  it('marks right', async () => {
    const { user, onMark } = revealed()
    await user.click(screen.getByRole('button', { name: /right/i }))
    expect(onMark).toHaveBeenCalledWith('right')
  })

  it('marks wrong', async () => {
    const { user, onMark } = revealed()
    await user.click(screen.getByRole('button', { name: /wrong/i }))
    expect(onMark).toHaveBeenCalledWith('wrong')
  })
})

describe('keyboard shortcuts', () => {
  it('replays on Space', async () => {
    const { user } = setup()
    await user.keyboard(' ')
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(1)
  })

  it('reveals on Enter', async () => {
    const { user, onReveal } = setup()
    await user.keyboard('{Enter}')
    expect(onReveal).toHaveBeenCalled()
  })
})

describe('degraded mode when no voice is installed', () => {
  it('shows the prompt word as text so the drill still works', () => {
    setup(true)
    expect(screen.getByText('dochter')).toBeInTheDocument()
  })

  it('still keeps the answer hidden', () => {
    setup(true)
    expect(screen.queryByText('daughter')).not.toBeInTheDocument()
  })
})

// FR-3. A restore has no user gesture in scope, so nothing was spoken and on
// iOS nothing could be. The card has to explain the silence.
describe('after a restore', () => {
  it('offers the resumed hint', () => {
    setup(false, true)
    expect(screen.getByText(/resumed/i)).toBeInTheDocument()
  })

  it('does not show the hint in normal flow', () => {
    setup()
    expect(screen.queryByText(/resumed/i)).not.toBeInTheDocument()
  })

  it('still does not speak just because it was resumed', () => {
    setup(false, true)
    expect(speechCalls).toHaveLength(0)
  })

  it('still keeps the answer hidden', () => {
    setup(false, true)
    expect(screen.queryByText('daughter')).not.toBeInTheDocument()
  })
})

describe('quitting', () => {
  it('lets the user stop early', async () => {
    const { user, onQuit } = setup()
    await user.click(screen.getByRole('button', { name: /quit/i }))
    expect(onQuit).toHaveBeenCalled()
  })
})
