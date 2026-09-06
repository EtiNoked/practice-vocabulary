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

const setup = (over: { session?: Session; resumed?: boolean; answersOpen?: boolean } = {}) => {
  const onNext = vi.fn()
  const onPrev = vi.fn()
  const onToggleAnswer = vi.fn()
  const onQuit = vi.fn()
  const base = over.session ?? createSession(list.pairs, noShuffle, list.id, 'practice')
  const session = over.answersOpen === undefined ? base : { ...base, answersOpen: over.answersOpen }
  render(
    <StudyCard
      subject={list}
      session={session}
      resumed={over.resumed ?? false}
      onNext={onNext}
      onPrev={onPrev}
      onToggleAnswer={onToggleAnswer}
      onQuit={onQuit}
    />,
  )
  return { onNext, onPrev, onToggleAnswer, onQuit, session, user: userEvent.setup() }
}

/** The element carrying the answer text, covered or not. */
const answer = () => screen.getByText('daughter')

describe('what a study card shows', () => {
  /*
   * INVERTED, deliberately and visibly.
   *
   * Through 002 this said the prompt and the answer are shown together, and
   * cited that spec's FR-11: "the whole point of practice mode — nothing is
   * hidden". 009 revokes that requirement. Reading a translation is not recall,
   * and a mode with the answer already on screen offers no moment at which the
   * user tries — which is the gap between "everything given" and Test mode's
   * "graded" that this feature exists to fill.
   *
   * The prompt is still simply there. Only the answer moved.
   */
  it('shows the prompt word plainly, and the answer covered', () => {
    setup()
    const prompt = screen.getByText('dochter')
    expect(prompt).toBeInTheDocument()
    expect(prompt).not.toHaveClass('answer-masked')

    /*
     * Asserted on the class and the accessibility tree, NOT on presence. The
     * covered answer is still ordinary text in the DOM — `toBeInTheDocument`
     * passes either way and would be a test that cannot fail.
     */
    expect(answer()).toHaveClass('answer-masked')
    expect(answer()).toHaveAttribute('aria-hidden', 'true')
  })

  it('uncovers the answer once the run has been opened', () => {
    setup({ answersOpen: true })
    expect(answer()).not.toHaveClass('answer-masked')
    expect(answer()).not.toHaveAttribute('aria-hidden')
  })

  // E-11. The prompt is the question, and it is what gets spoken — covering it
  // would make the card useless to anyone with no voice for that language.
  it('never covers the prompt, in either state', () => {
    setup({ answersOpen: true })
    expect(screen.getByText('dochter')).not.toHaveClass('answer-masked')
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

  /*
   * INVERTED, deliberately — the other half of 002's FR-11. See the note in
   * "what a study card shows" above for why that requirement no longer holds.
   *
   * It keeps checking for "Show answer" specifically, and that is not an
   * oversight: this card's control is "Reveal answer", and Test mode's is "Show
   * answer". App.test.tsx tells a restored practice drill from a test one by
   * exactly that string, so the two names must stay distinct.
   */
  it('offers a reveal of its own, and not test mode’s', () => {
    setup()
    expect(screen.getByRole('button', { name: /reveal answer/i })).toBeInTheDocument()
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

// 009. The eye: the whole of what practice mode gained.
describe('uncovering the answer', () => {
  it('asks to be uncovered when the answer is covered', async () => {
    const { user, onToggleAnswer } = setup()
    await user.click(screen.getByRole('button', { name: /reveal answer/i }))
    expect(onToggleAnswer).toHaveBeenCalledTimes(1)
  })

  // US-3: a peek is not a one-way door. The label carries the state, which is
  // what a sighted user and a screen reader both read.
  it('offers to cover it again once it is open', async () => {
    const { user, onToggleAnswer } = setup({ answersOpen: true })
    const button = screen.getByRole('button', { name: /hide answer/i })
    await user.click(button)
    expect(onToggleAnswer).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /reveal answer/i })).not.toBeInTheDocument()
  })

  /*
   * No aria-pressed beside the changing label. Carrying both makes a screen
   * reader announce the state twice — "Hide answer, toggle button, pressed" —
   * which is the pattern the ARIA practices warn against for this control.
   */
  it('says the state in the label rather than in a pressed flag', () => {
    setup({ answersOpen: true })
    expect(screen.getByRole('button', { name: /hide answer/i })).not.toHaveAttribute('aria-pressed')
  })

  // FR-10. Uncovering is not an advance; nothing about the card changed.
  it('does not speak', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /reveal answer/i }))
    expect(speechCalls).toHaveLength(0)
  })

  it('does not navigate', async () => {
    const { user, onNext, onPrev } = setup()
    await user.click(screen.getByRole('button', { name: /reveal answer/i }))
    expect(onNext).not.toHaveBeenCalled()
    expect(onPrev).not.toHaveBeenCalled()
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
   * `a` for answer, and not Enter: Enter already advances in this card, and
   * re-pointing it would break both muscle memory and the test above.
   */
  it('uncovers the answer on A', async () => {
    const { user, onToggleAnswer } = setup()
    await user.keyboard('a')
    expect(onToggleAnswer).toHaveBeenCalledTimes(1)
  })

  it('covers it again on a second A', async () => {
    const { user, onToggleAnswer } = setup({ answersOpen: true })
    await user.keyboard('A')
    expect(onToggleAnswer).toHaveBeenCalledTimes(1)
  })

  it('says so in the shortcut hint, or nobody finds it', () => {
    setup()
    expect(screen.getByText(/\bA\b.*answer/i)).toBeInTheDocument()
  })

  /*
   * The same guard TestCard carries: these bindings live on window, so they are
   * live while the account menu is open on top of the drill.
   */
  it('ignores keys while a menu owns the keyboard', async () => {
    const { user, onNext, onToggleAnswer } = setup()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)

    await user.keyboard('{ArrowRight}')
    await user.keyboard('a')

    expect(onNext).not.toHaveBeenCalled()
    expect(onToggleAnswer).not.toHaveBeenCalled()
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
