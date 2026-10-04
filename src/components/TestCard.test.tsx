import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeList, pair } from '../test/fixtures/words'
import { createSession } from '../state/session'
import type { PromptMode, WordList } from '../state/types'
import { speechCalls } from '../test/setup'
import { TestCard } from './TestCard'

const list = makeList({
  pairs: [pair('p1', 'daughter', 'dochter'), pair('p2', 'son', 'zoon')],
  createdAt: 1,
  updatedAt: 1,
})

const noShuffle = () => 0.999999999

const setup = (voiceMissing = false, resumed = false, prompt: PromptMode = 'hear') => {
  const onReveal = vi.fn()
  const onMark = vi.fn()
  const onQuit = vi.fn()
  const session = createSession(list.pairs, noShuffle, list.id, 'test', { prompt })
  const utils = render(
    <TestCard
      subject={list}
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

/**
 * The card as it stands AFTER the reveal.
 *
 * Built by handing it a revealed session rather than by clicking Show answer, because
 * `onReveal` is a spy here — the card reports the tap and nothing moves. Reveal is the
 * reducer's job, and `appMachine.test.ts` is where that is checked.
 */
const renderRevealed = (
  over: { prompt?: PromptMode; subject?: WordList; voiceMissing?: boolean } = {},
) => {
  const base = createSession(list.pairs, noShuffle, list.id, 'test', {
    prompt: over.prompt ?? 'hear',
  })
  render(
    <TestCard
      subject={over.subject ?? list}
      session={{ ...base, revealed: true }}
      voiceMissing={over.voiceMissing ?? false}
      resumed={false}
      onReveal={vi.fn()}
      onMark={vi.fn()}
      onQuit={vi.fn()}
    />,
  )
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
        subject={list}
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

describe('Show the word (chosen on the start screen)', () => {
  it('hides the spoken word by default: a test is listen and answer', () => {
    const { session } = setup()
    const word = session.pairs.find((p) => p.id === session.order[0])!.col2
    expect(screen.queryByText(word)).not.toBeInTheDocument()
  })

  it('shows the spoken word as text when the test was started with it on', () => {
    const { session } = setup(false, false, 'both')
    const word = session.pairs.find((p) => p.id === session.order[0])!.col2
    expect(screen.getByText(word)).toBeInTheDocument()
  })
})

/**
 * The third state the checkbox could not express: the word on screen and NO sound.
 *
 * 'hear' and 'both' are the two the boolean already had, covered above. Everything here
 * is about what the absence of sound has to take with it — a speaker button that would do
 * nothing, a shortcut that would do nothing, and a resume hint that promises a replay.
 */
describe('a silent test', () => {
  it('shows the word and offers no speaker', () => {
    setup(false, false, 'see')
    expect(screen.getByText('dochter')).toBeInTheDocument()
    // Absent rather than disabled: a dead speaker on a card the user asked to be silent
    // invites the question an absent one never raises.
    expect(screen.queryByRole('button', { name: /hear it again/i })).not.toBeInTheDocument()
  })

  it('keeps the answer hidden all the same', () => {
    setup(false, false, 'see')
    expect(screen.queryByText('daughter')).not.toBeInTheDocument()
  })

  it('says nothing on Space, and does not advertise it', async () => {
    const { user } = setup(false, false, 'see')
    await user.keyboard(' ')
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(0)
    expect(screen.queryByText(/space replays/i)).not.toBeInTheDocument()
    expect(screen.getByText(/enter reveals/i)).toBeInTheDocument()
  })

  it('drops the resume hint, which promises a replay it cannot give', () => {
    setup(false, true, 'see')
    expect(screen.queryByText(/resumed/i)).not.toBeInTheDocument()
  })

  /*
   * The override goes ONE way. A listening run on a device with no voice would be a
   * blank, unanswerable card, so it shows the word. A silent run is left alone: the user
   * asked for quiet, and a missing voice is no reason to overrule a run that was never
   * going to make a sound.
   */
  it('is not turned back on by a missing voice', async () => {
    const { user } = setup(true, false, 'see')
    expect(screen.getByText('dochter')).toBeInTheDocument()
    await user.keyboard(' ')
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(0)
  })

  it('prints the prompt once, not twice, when the answer comes out', () => {
    // Rendered already revealed rather than clicked there: `onReveal` is a spy, so the
    // card never advances on its own.
    renderRevealed({ prompt: 'see' })
    // getByText throws on a duplicate, which is the assertion: the pre-reveal copy has
    // to step aside for the answer block's, or a shown prompt appears twice.
    expect(screen.getByText('dochter')).toBeInTheDocument()
    expect(screen.getByText('daughter')).toBeInTheDocument()
  })
})

describe('a list that explains itself in its own language', () => {
  const dutchBoth: WordList = { ...list, col1Lang: 'nl', col2Lang: 'nl' }

  it('names the sides by role rather than printing one language twice', () => {
    renderRevealed({ prompt: 'hear', subject: dutchBoth })
    expect(screen.getByText(/^answer$/i)).toBeInTheDocument()
    expect(screen.queryByText(/dutch/i)).not.toBeInTheDocument()
  })

  it('says Listen — Clue over the prompt, where the language name would say nothing', () => {
    render(
      <TestCard
        subject={dutchBoth}
        session={createSession(list.pairs, noShuffle, list.id, 'test', { prompt: 'hear' })}
        voiceMissing={false}
        resumed={false}
        onReveal={vi.fn()}
        onMark={vi.fn()}
        onQuit={vi.fn()}
      />,
    )
    expect(screen.getByText(/listen — clue/i)).toBeInTheDocument()
  })
})
