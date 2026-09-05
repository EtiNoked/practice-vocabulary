import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createSession, nextCard } from '../state/session'
import type { Session, WordList } from '../state/types'
import { speechCalls } from '../test/setup'
import { StudyCard } from './StudyCard'

const list: WordList = {
  id: 'a',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [
    { id: 'p1', col1: 'daughter', col2: 'dochter' },
    { id: 'p2', col1: 'son', col2: 'zoon' },
    { id: 'p3', col1: 'uncle', col2: 'oom' },
  ],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

const noShuffle = () => 0.999999999

const setup = (over: { session?: Session; resumed?: boolean } = {}) => {
  const onNext = vi.fn()
  const onPrev = vi.fn()
  const onQuit = vi.fn()
  const session = over.session ?? createSession(list.pairs, noShuffle, list.id, 'practice')
  render(
    <StudyCard
      list={list}
      session={session}
      resumed={over.resumed ?? false}
      onNext={onNext}
      onPrev={onPrev}
      onQuit={onQuit}
    />,
  )
  return { onNext, onPrev, onQuit, session, user: userEvent.setup() }
}

describe('what a study card shows', () => {
  // FR-11: the whole point of practice mode — nothing is hidden.
  it('shows the prompt word and the answer together, with no interaction', () => {
    setup()
    expect(screen.getByText('dochter')).toBeInTheDocument()
    expect(screen.getByText('daughter')).toBeInTheDocument()
  })

  it('labels both languages', () => {
    setup()
    expect(screen.getByText(/dutch/i)).toBeInTheDocument()
    expect(screen.getByText(/english/i)).toBeInTheDocument()
  })

  it('shows the position in the list', () => {
    setup()
    expect(screen.getByText(/card 1 of 3/i)).toBeInTheDocument()
  })

  it('follows the session index', () => {
    const session = nextCard(createSession(list.pairs, noShuffle, list.id, 'practice'))
    setup({ session })
    expect(screen.getByText(/card 2 of 3/i)).toBeInTheDocument()
    expect(screen.getByText('zoon')).toBeInTheDocument()
    expect(screen.getByText('son')).toBeInTheDocument()
  })

  // iOS Safari drops speech with no user gesture behind it. Same rule as TestCard:
  // no mount effect ever speaks.
  it('does not speak on mount', () => {
    setup()
    expect(speechCalls).toHaveLength(0)
  })
})

// FR-13: no marking and no score, not even hidden.
describe('what a study card must NOT show', () => {
  it('offers no marking buttons', () => {
    setup()
    expect(screen.queryByRole('button', { name: /right/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /wrong/i })).not.toBeInTheDocument()
  })

  it('offers no reveal, because nothing is hidden', () => {
    setup()
    expect(screen.queryByRole('button', { name: /show answer/i })).not.toBeInTheDocument()
  })

  it('shows no tally and no percentage', () => {
    setup()
    expect(screen.queryByText(/✓/)).not.toBeInTheDocument()
    expect(screen.queryByText(/✗/)).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })
})

describe('moving through the list', () => {
  it('advances on Next', async () => {
    const { user, onNext } = setup()
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(onNext).toHaveBeenCalled()
  })

  it('goes back on Previous', async () => {
    const session = nextCard(createSession(list.pairs, noShuffle, list.id, 'practice'))
    const { user, onPrev } = setup({ session })
    await user.click(screen.getByRole('button', { name: /previous/i }))
    expect(onPrev).toHaveBeenCalled()
  })

  // FR-12: there is nowhere to go back to from the first card.
  it('disables Previous on the first card', () => {
    setup()
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })

  it('enables Previous once past the first card', () => {
    const session = nextCard(createSession(list.pairs, noShuffle, list.id, 'practice'))
    setup({ session })
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled()
  })

  it('lets the user stop early', async () => {
    const { user, onQuit } = setup()
    await user.click(screen.getByRole('button', { name: /quit/i }))
    expect(onQuit).toHaveBeenCalled()
  })
})

describe('hearing the word again', () => {
  it('replays the prompt word in the prompt language', async () => {
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
})

describe('keyboard shortcuts', () => {
  it('replays on Space', async () => {
    const { user } = setup()
    await user.keyboard(' ')
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(1)
  })

  it('advances on the right arrow', async () => {
    const { user, onNext } = setup()
    await user.keyboard('{ArrowRight}')
    expect(onNext).toHaveBeenCalled()
  })

  it('advances on Enter', async () => {
    const { user, onNext } = setup()
    await user.keyboard('{Enter}')
    expect(onNext).toHaveBeenCalled()
  })

  it('goes back on the left arrow', async () => {
    const session = nextCard(createSession(list.pairs, noShuffle, list.id, 'practice'))
    const { user, onPrev } = setup({ session })
    await user.keyboard('{ArrowLeft}')
    expect(onPrev).toHaveBeenCalled()
  })

  it('does not go back past the first card', async () => {
    const { user, onPrev } = setup()
    await user.keyboard('{ArrowLeft}')
    expect(onPrev).not.toHaveBeenCalled()
  })

  /*
   * The same guard TestCard carries: these bindings live on window, so they are
   * live while the account menu is open on top of the drill.
   */
  it('ignores keys while a menu owns the keyboard', async () => {
    const { user, onNext } = setup()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)

    await user.keyboard('{ArrowRight}')

    expect(onNext).not.toHaveBeenCalled()
    menu.remove()
  })
})

// FR-3. A restore has no user gesture in scope, so nothing was spoken; the card
// has to say so, or the user is looking at a silent screen wondering why.
describe('after a restore', () => {
  it('offers the resumed hint', () => {
    setup({ resumed: true })
    expect(screen.getByText(/resumed/i)).toBeInTheDocument()
  })

  it('does not show the hint in normal flow', () => {
    setup()
    expect(screen.queryByText(/resumed/i)).not.toBeInTheDocument()
  })

  it('still does not speak just because it was resumed', () => {
    setup({ resumed: true })
    expect(speechCalls).toHaveLength(0)
  })
})
