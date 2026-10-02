import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WordList } from '../state/types'
import { ReadyScreen } from './ReadyScreen'

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

const NO_MISSES = { day: 0, week: 0, month: 0, all: 0 }

const setup = (saved = false, over: Partial<Parameters<typeof ReadyScreen>[0]> = {}) => {
  const onStart = vi.fn()
  const onSave = vi.fn()
  const onBack = vi.fn()
  const onPickWindow = vi.fn()
  const onPractiseFull = vi.fn()
  const onOptionsChange = vi.fn()
  render(
    <ReadyScreen
      list={list}
      saved={saved}
      missed={null}
      counts={NO_MISSES}
      degraded={false}
      options={{ ordering: 'random', showWord: false }}
      onOptionsChange={onOptionsChange}
      onStart={onStart}
      onPickWindow={onPickWindow}
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
    onPickWindow,
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

describe('practicing the words you missed', () => {
  const counts = { day: 0, week: 3, month: 7, all: 9 }

  it('shows nothing at all when there is nothing missed', () => {
    setup()
    expect(screen.queryByText(/words you missed/i)).not.toBeInTheDocument()
  })

  it('offers a chip per window, each carrying its count', () => {
    setup(false, { counts })
    expect(screen.getByRole('button', { name: /this week · 3/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /this month · 7/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /all time · 9/i })).toBeInTheDocument()
  })

  it('disables a window with nothing in it, rather than hiding it', () => {
    // A zero tells the user their recent misses are cleared. A missing chip
    // would just look like a feature that is not there.
    setup(false, { counts })
    expect(screen.getByRole('button', { name: /today · 0/i })).toBeDisabled()
  })

  it('picks a window', async () => {
    const { user, onPickWindow } = setup(false, { counts })
    await user.click(screen.getByRole('button', { name: /this week · 3/i }))
    expect(onPickWindow).toHaveBeenCalledWith('week')
  })

  it('keeps the chips at a full touch target', () => {
    setup(false, { counts })
    expect(screen.getByRole('button', { name: /this week · 3/i })).toHaveClass('btn')
  })

  it('explains a history that predates right-answer recording', () => {
    setup(false, { counts, degraded: true })
    expect(screen.getByText(/before right answers were saved/i)).toBeInTheDocument()
  })

  it('says nothing about it when the history is complete', () => {
    setup(false, { counts })
    expect(screen.queryByText(/before right answers were saved/i)).not.toBeInTheDocument()
  })
})

describe('once a subset is selected', () => {
  const missed = { count: 3, source: { kind: 'window', window: 'week' } as const }

  it('says what will be drilled, in place of the languages panel', () => {
    setup(false, { missed })
    expect(screen.getByText(/3 words you missed in the last week/i)).toBeInTheDocument()
    expect(screen.queryByText(/you'll hear/i)).not.toBeInTheDocument()
  })

  it('names the day when the subset came from one drill', () => {
    setup(false, {
      missed: { count: 1, source: { kind: 'session', finishedAt: Date.UTC(2026, 8, 4) } },
    })
    expect(screen.getByText(/1 word you missed on 04\/09\/2026/i)).toBeInTheDocument()
  })

  it('HIDES Save, so a subset can never overwrite the real list', () => {
    setup(false, { missed })
    expect(screen.queryByRole('button', { name: /save this list/i })).not.toBeInTheDocument()
  })

  it('offers a way back to the whole list, from the same Words choice', async () => {
    const { user, onPractiseFull } = setup(false, { missed })
    await user.click(screen.getByRole('button', { name: /^all words · 2$/i }))
    expect(onPractiseFull).toHaveBeenCalled()
  })

  it('still starts in either mode, from the same two buttons', async () => {
    const { user, onStart } = setup(false, { missed })
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(onStart).toHaveBeenCalledWith('test')
    await user.click(screen.getByRole('button', { name: /^practice$/i }))
    expect(onStart).toHaveBeenCalledWith('practice')
  })

  it('keeps the other windows on offer, with the chosen one marked', () => {
    setup(false, { missed, counts: { day: 0, week: 3, month: 7, all: 9 } })
    expect(screen.getByRole('button', { name: /this week · 3/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /this month · 7/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /^all words/i })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('setting up the run, before starting it', () => {
  it('chooses all words by default, and marks it', () => {
    setup()
    expect(screen.getByRole('button', { name: /^all words · 2$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('puts the setup above the start buttons', () => {
    setup(false, { counts: { day: 1, week: 1, month: 1, all: 1 } })
    const order = screen.getAllByRole('button').map((b) => b.textContent)
    expect(order.indexOf('All words · 2')).toBeLessThan(order.indexOf('Practice'))
    expect(order.indexOf('Random')).toBeLessThan(order.indexOf('Test'))
  })

  it('shows the current order and changes it', async () => {
    const { user, onOptionsChange } = setup()
    expect(screen.getByRole('button', { name: 'Random' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'List order' }))
    expect(onOptionsChange).toHaveBeenCalledWith({ ordering: 'list', showWord: false })
  })

  it('offers to show the word in a test, naming the language', async () => {
    const { user, onOptionsChange } = setup(false, { options: { ordering: 'list', showWord: false } })
    const box = screen.getByRole('checkbox', { name: /in test, show the dutch word/i })
    expect(box).not.toBeChecked()
    await user.click(box)
    expect(onOptionsChange).toHaveBeenCalledWith({ ordering: 'list', showWord: true })
  })
})
