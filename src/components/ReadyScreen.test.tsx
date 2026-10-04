import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReviewWindow } from '../state/missedWords'
import type { WordList } from '../state/types'
import { ReadyScreen, type SubsetCounts } from './ReadyScreen'

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

const NOTHING = { day: 0, week: 0, month: 0, all: 0 }

const NO_SUBSETS: SubsetCounts = { missed: NOTHING, missedNew: NOTHING, unseen: 0 }

/**
 * Counts as the app builds them: `missedNew` is `missed` plus the never-asked
 * words, which is exact because a word cannot be both.
 */
const countsOf = (missed: Record<ReviewWindow, number>, unseen: number): SubsetCounts => ({
  missed,
  missedNew: {
    day: missed.day + unseen,
    week: missed.week + unseen,
    month: missed.month + unseen,
    all: missed.all + unseen,
  },
  unseen,
})

const setup = (saved = false, over: Partial<Parameters<typeof ReadyScreen>[0]> = {}) => {
  const onStart = vi.fn()
  const onSave = vi.fn()
  const onBack = vi.fn()
  const onPickSubset = vi.fn()
  const onPractiseFull = vi.fn()
  const onOptionsChange = vi.fn()
  render(
    <ReadyScreen
      list={list}
      saved={saved}
      subset={null}
      counts={NO_SUBSETS}
      degraded={false}
      options={{ ordering: 'random', prompt: 'hear' }}
      voiceMissing={false}
      onOptionsChange={onOptionsChange}
      onStart={onStart}
      onPickSubset={onPickSubset}
      onPractiseFull={onPractiseFull}
      onSave={onSave}
      onBack={onBack}
      {...over}
    />,
  )
  return {
    onStart,
    onSave,
    onBack,
    onPickSubset,
    onPractiseFull,
    onOptionsChange,
    user: userEvent.setup(),
  }
}

describe('choosing a mode', () => {
  it('offers both modes in place of a single Start', () => {
    setup()
    expect(screen.getByRole('button', { name: /^practice$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^test$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^start$/i })).not.toBeInTheDocument()
  })

  it('explains each one in a line', () => {
    setup()
    // 009: practice no longer hands the answer over, so the line that promised
    // it would ("see it, see the answer") had to stop saying so.
    expect(screen.getByText(/reveal when you want/i)).toBeInTheDocument()
    expect(screen.getByText(/from memory/i)).toBeInTheDocument()
  })

  it('starts a practice run', async () => {
    const { user, onStart } = setup()
    await user.click(screen.getByRole('button', { name: /^practice$/i }))
    expect(onStart).toHaveBeenCalledWith('practice')
  })

  it('starts a test run', async () => {
    const { user, onStart } = setup()
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(onStart).toHaveBeenCalledWith('test')
  })

  /**
   * NFR-4. Both buttons are primary drill actions on a phone, and both are the
   * gesture that starts their mode's first utterance — a mis-tap costs the whole
   * iOS speech chain, not just a wrong screen.
   */
  it('keeps both touch targets at the large size', () => {
    setup()
    for (const name of [/^practice$/i, /^test$/i]) {
      expect(screen.getByRole('button', { name })).toHaveClass('btn-lg')
    }
  })
})

describe('what the screen already did', () => {
  it('still names the list and counts the words', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Lesson 3' })).toBeInTheDocument()
    expect(screen.getByText(/2 words/i)).toBeInTheDocument()
  })

  it('still says which language is heard and which is answered', () => {
    setup()
    expect(screen.getByText(/you'll hear/i)).toHaveTextContent(/Dutch/)
    expect(screen.getByText(/you'll hear/i)).toHaveTextContent(/English/)
  })

  it('still offers Save and Back', async () => {
    const { user, onSave, onBack } = setup()
    await user.click(screen.getByRole('button', { name: /save this list/i }))
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(onSave).toHaveBeenCalled()
    expect(onBack).toHaveBeenCalled()
  })

  it('still disables Save for an already-saved list', () => {
    setup(true)
    expect(screen.getByRole('button', { name: /saved/i })).toBeDisabled()
  })
})

describe('choosing which words (014)', () => {
  // 9 missed all time, narrowing to 3 this week; 4 words never asked.
  const counts = countsOf({ day: 0, week: 3, month: 7, all: 9 }, 4)

  it('offers the four sources, each carrying what it would deal', () => {
    setup(false, { counts })
    expect(screen.getByRole('button', { name: /^all words · 2$/i })).toBeInTheDocument()
    // All time is the seeded window, so the two mistake buttons read their widest.
    expect(screen.getByRole('button', { name: /^words i got wrong · 9$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^wrong & new words · 13$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^new words · 4$/i })).toBeInTheDocument()
  })

  it('disables a source with nothing in it, rather than hiding it', () => {
    // A zero tells the user they have no mistakes left, which is worth knowing.
    // A missing button would just look like a feature that is not there.
    setup()
    expect(screen.getByRole('button', { name: /^words i got wrong · 0$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^new words · 0$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^all words · 2$/i })).toBeEnabled()
  })

  it('asks for the mistakes over the whole of history, until told otherwise', async () => {
    const { user, onPickSubset } = setup(false, { counts })
    await user.click(screen.getByRole('button', { name: /^words i got wrong · 9$/i }))
    expect(onPickSubset).toHaveBeenCalledWith({ kind: 'window', source: 'missed', window: 'all' })
  })

  it('asks for mistakes and new words together', async () => {
    const { user, onPickSubset } = setup(false, { counts })
    await user.click(screen.getByRole('button', { name: /^wrong & new words · 13$/i }))
    expect(onPickSubset).toHaveBeenCalledWith({
      kind: 'window',
      source: 'missed-new',
      window: 'all',
    })
  })

  it('asks for the never-seen words with no window at all', async () => {
    const { user, onPickSubset } = setup(false, { counts })
    await user.click(screen.getByRole('button', { name: /^new words · 4$/i }))
    expect(onPickSubset).toHaveBeenCalledWith({ kind: 'new' })
  })

  it('keeps the windows out of sight until they have something to narrow', () => {
    setup(false, { counts })
    expect(screen.queryByRole('button', { name: /this week/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/counting mistakes from/i)).not.toBeInTheDocument()
  })

  it('offers a window per slice once a mistakes source is live, each with its count', () => {
    setup(false, {
      counts,
      subset: { count: 9, source: { kind: 'window', source: 'missed', window: 'all' } },
    })
    expect(screen.getByRole('button', { name: /^this week · 3$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^this month · 7$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^all time · 9$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /^today · 0$/i })).toBeDisabled()
  })

  it('counts the windows through the live source, new words included', () => {
    // On "wrong & new" every window carries the 4 never-asked words too, so a
    // chip cannot read 0 while the button above it reads 13.
    setup(false, {
      counts,
      subset: { count: 13, source: { kind: 'window', source: 'missed-new', window: 'all' } },
    })
    expect(screen.getByRole('button', { name: /^today · 4$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^this week · 7$/i })).toBeInTheDocument()
  })

  it('narrows the live source rather than switching back to mistakes-only', async () => {
    const { user, onPickSubset } = setup(false, {
      counts,
      subset: { count: 13, source: { kind: 'window', source: 'missed-new', window: 'all' } },
    })
    await user.click(screen.getByRole('button', { name: /^this week · 7$/i }))
    expect(onPickSubset).toHaveBeenCalledWith({
      kind: 'window',
      source: 'missed-new',
      window: 'week',
    })
  })

  it('remembers a narrowed window across a trip through another source', async () => {
    const { user, onPickSubset } = setup(false, {
      counts,
      subset: { count: 3, source: { kind: 'window', source: 'missed', window: 'week' } },
    })
    // The parent is a mock, so the subset prop does not move: what is under test
    // is that the screen keeps 'week' of its own accord once the chip is pressed.
    await user.click(screen.getByRole('button', { name: /^wrong & new words · 7$/i }))
    expect(onPickSubset).toHaveBeenLastCalledWith({
      kind: 'window',
      source: 'missed-new',
      window: 'week',
    })
  })

  it('restates each button through the chosen window', () => {
    setup(false, {
      counts,
      subset: { count: 3, source: { kind: 'window', source: 'missed', window: 'week' } },
    })
    expect(screen.getByRole('button', { name: /^words i got wrong · 3$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^wrong & new words · 7$/i })).toBeInTheDocument()
    // New words have no window, so this one does not move.
    expect(screen.getByRole('button', { name: /^new words · 4$/i })).toBeInTheDocument()
  })

  it('keeps the buttons at a full touch target', () => {
    setup(false, { counts })
    expect(screen.getByRole('button', { name: /^new words · 4$/i })).toHaveClass('btn')
  })

  it('explains a history that predates right-answer recording, both ways round', () => {
    setup(false, { counts, degraded: true })
    const note = screen.getByText(/before right answers were saved/i)
    expect(note).toHaveTextContent(/may still count as missed/i)
    expect(note).toHaveTextContent(/may still count as new/i)
  })

  it('says nothing about it when the history is complete', () => {
    setup(false, { counts })
    expect(screen.queryByText(/before right answers were saved/i)).not.toBeInTheDocument()
  })
})

describe('once a subset is selected', () => {
  const counts = countsOf({ day: 0, week: 3, month: 7, all: 9 }, 4)
  const subset = { count: 3, source: { kind: 'window', source: 'missed', window: 'week' } } as const

  it('says what will be drilled, in place of the languages panel', () => {
    setup(false, { counts, subset })
    expect(screen.getByText(/3 words you missed in the last week/i)).toBeInTheDocument()
    expect(screen.queryByText(/you'll hear/i)).not.toBeInTheDocument()
  })

  it('reads back a mistakes-and-new subset as the two things it is', () => {
    setup(false, {
      counts,
      subset: { count: 7, source: { kind: 'window', source: 'missed-new', window: 'week' } },
    })
    const said = screen.getByText(/7 words/i)
    expect(said).toHaveTextContent(/missed in the last week/i)
    expect(said).toHaveTextContent(/haven’t been asked yet/i)
  })

  it('reads back a never-asked subset without mentioning a window', () => {
    setup(false, { counts, subset: { count: 4, source: { kind: 'new' } } })
    const said = screen.getByText(/4 words/i)
    expect(said).toHaveTextContent(/haven’t been asked yet/i)
    expect(said).not.toHaveTextContent(/missed/i)
  })

  it('names the day when the subset came from one drill', () => {
    setup(false, {
      subset: { count: 1, source: { kind: 'session', finishedAt: Date.UTC(2026, 8, 4) } },
    })
    expect(screen.getByText(/1 word you missed on 04\/09\/2026/i)).toBeInTheDocument()
  })

  it('lights none of the four for a subset that came from the review screen', () => {
    setup(false, {
      counts,
      subset: { count: 1, source: { kind: 'session', finishedAt: Date.UTC(2026, 8, 4) } },
    })
    for (const name of [/^all words/i, /^words i got wrong/i, /^new words/i]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('HIDES Save, so a subset can never overwrite the real list', () => {
    setup(false, { counts, subset })
    expect(screen.queryByRole('button', { name: /save this list/i })).not.toBeInTheDocument()
  })

  it('offers a way back to the whole list, from the same Words choice', async () => {
    const { user, onPractiseFull } = setup(false, { counts, subset })
    await user.click(screen.getByRole('button', { name: /^all words · 2$/i }))
    expect(onPractiseFull).toHaveBeenCalled()
  })

  it('still starts in either mode, from the same two buttons', async () => {
    const { user, onStart } = setup(false, { counts, subset })
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(onStart).toHaveBeenCalledWith('test')
    await user.click(screen.getByRole('button', { name: /^practice$/i }))
    expect(onStart).toHaveBeenCalledWith('practice')
  })

  it('keeps the other windows on offer, with the chosen one marked', () => {
    setup(false, { counts, subset })
    expect(screen.getByRole('button', { name: /^this week · 3$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /^this month · 7$/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: /^all words/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})

describe('setting up the run, before starting it', () => {
  it('chooses all words by default, and marks it', () => {
    setup()
    expect(screen.getByRole('button', { name: /^all words · 2$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('puts the setup above the start buttons', () => {
    setup(false, { counts: countsOf({ day: 1, week: 1, month: 1, all: 1 }, 0) })
    const order = screen.getAllByRole('button').map((b) => b.textContent)
    expect(order.indexOf('All words · 2')).toBeLessThan(order.indexOf('Practice'))
    expect(order.indexOf('Random')).toBeLessThan(order.indexOf('Test'))
  })

  it('shows the current order and changes it', async () => {
    const { user, onOptionsChange } = setup()
    expect(screen.getByRole('button', { name: 'Random' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'List order' }))
    expect(onOptionsChange).toHaveBeenCalledWith({ ordering: 'list', prompt: 'hear' })
  })

  /*
   * Was a checkbox named "In Test, show the Dutch word as well as saying it". It is three
   * buttons now, because the checkbox could only ever add text on top of speech and had
   * no way to say "no sound at all". The two states it DID have still exist, unchanged,
   * as 'hear' and 'both'.
   */
  it('offers all three ways a test can give the word, listening preselected', () => {
    setup()
    expect(screen.getByRole('button', { name: /just listen/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    for (const name of [/show the word/i, /^both/i]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('reports the choice up, keeping the order alongside it', async () => {
    const { user, onOptionsChange } = setup(false, {
      options: { ordering: 'list', prompt: 'hear' },
    })
    await user.click(screen.getByRole('button', { name: /show the word/i }))
    expect(onOptionsChange).toHaveBeenCalledWith({ ordering: 'list', prompt: 'see' })
  })

  it('keeps it scoped to Test, where it applies', () => {
    setup()
    expect(screen.getByRole('heading', { name: /^in test$/i })).toBeInTheDocument()
  })

  it('warns up front that a missing voice will overrule “just listen”', () => {
    setup(false, { voiceMissing: true })
    expect(screen.getByText(/no voice for that language/i)).toBeInTheDocument()
  })

  it('says nothing about voices once the run is not going to speak anyway', () => {
    setup(false, { voiceMissing: true, options: { ordering: 'random', prompt: 'see' } })
    expect(screen.queryByText(/no voice for that language/i)).not.toBeInTheDocument()
  })
})

describe('a list that explains itself in its own language', () => {
  it('does not claim to translate between a language and itself', () => {
    setup(false, { list: { ...list, col1Lang: 'nl', col2Lang: 'nl' } })
    expect(screen.getByText(/both sides are/i)).toHaveTextContent(/Dutch/)
    expect(screen.queryByText(/answer in Dutch/i)).not.toBeInTheDocument()
  })

  it('still names both languages for an ordinary translation list', () => {
    setup()
    expect(screen.getByText(/you'll hear/i)).toHaveTextContent(/Dutch/)
    expect(screen.getByText(/you'll hear/i)).toHaveTextContent(/English/)
  })
})
