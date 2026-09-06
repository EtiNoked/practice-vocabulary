import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReviewDetail } from './ReviewDetail'
import type { SessionRecord, WordList, WordPair } from '../state/types'

const pair = (id: string, col1: string, col2: string): WordPair => ({ id, col1, col2 })

const list: WordList = {
  id: 'l1',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [pair('p1', 'daughter', 'dochter'), pair('p2', 'son', 'zoon')],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 'r1',
  listId: 'l1',
  listName: 'Lesson 3',
  right: 1,
  wrong: 1,
  total: 2,
  pct: 50,
  wrongPairs: [pair('p1', 'daughter', 'dochter')],
  rightPairs: [pair('p2', 'son', 'zoon')],
  finishedAt: Date.UTC(2026, 8, 4, 10, 30),
  mode: 'full',
  partial: false,
  ...over,
})

const setup = (over: Partial<Parameters<typeof ReviewDetail>[0]> = {}) => {
  const onPractiseMisses = vi.fn()
  const onBack = vi.fn()
  render(
    <ReviewDetail
      record={rec()}
      list={list}
      onPractiseMisses={onPractiseMisses}
      onBack={onBack}
      {...over}
    />,
  )
  return { onPractiseMisses, onBack, user: userEvent.setup() }
}

describe('the header', () => {
  it('names the list and shows the score', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Lesson 3' })).toBeInTheDocument()
    // Split across a span, as on the results screen — asserted in two halves the
    // same way App.test.tsx does.
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument()
    expect(screen.getByText(/\(50%\)/)).toBeInTheDocument()
  })

  it('reads sensibly for a list that has since been deleted', () => {
    // The name comes from the record, not a lookup — the whole reason it is
    // denormalised.
    setup({ record: rec({ listName: 'Deleted list' }), list: null })
    expect(screen.getByRole('heading', { name: 'Deleted list' })).toBeInTheDocument()
  })

  it('flags a wrong-only run and a run stopped early', () => {
    setup({ record: rec({ mode: 'wrong-only', partial: true }) })
    expect(screen.getByText(/missed words only/i)).toBeInTheDocument()
    expect(screen.getByText(/stopped early/i)).toBeInTheDocument()
  })
})

describe('what was right and what was wrong', () => {
  it('lists the misses first, because they are why you opened this', () => {
    setup()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')
    expect(headings[0]).toMatch(/wrong/i)
    expect(headings[1]).toMatch(/right/i)
  })

  it('counts each section', () => {
    setup()
    expect(screen.getByRole('heading', { name: /wrong \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /right \(1\)/i })).toBeInTheDocument()
  })

  it('shows both sides of every word', () => {
    setup()
    expect(screen.getByText('dochter')).toBeInTheDocument()
    expect(screen.getByText('daughter')).toBeInTheDocument()
    expect(screen.getByText('zoon')).toBeInTheDocument()
    expect(screen.getByText('son')).toBeInTheDocument()
  })

  it('carries a glyph as well as a colour', () => {
    // Colour is never the sole carrier of meaning — forced-colors mode strips it.
    setup()
    expect(screen.getByText('✓', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('✗', { exact: false })).toBeInTheDocument()
  })
})

describe('a drill recorded before right answers were saved', () => {
  const legacy = () => {
    const r = rec()
    delete r.rightPairs
    return r
  }

  it('explains the gap instead of showing an empty Right section', () => {
    setup({ record: legacy() })
    expect(screen.queryByRole('heading', { name: /right \(/i })).not.toBeInTheDocument()
    expect(screen.getByText(/before right answers were saved/i)).toBeInTheDocument()
  })

  it('still lists the misses', () => {
    setup({ record: legacy() })
    expect(screen.getByRole('heading', { name: /wrong \(1\)/i })).toBeInTheDocument()
    expect(screen.getByText('dochter')).toBeInTheDocument()
  })

  it('DOES show Right (0) when the record genuinely recorded none', () => {
    /*
     * Absent and empty are different things, and this is the test that keeps
     * them different: "not recorded" is a gap in the data, "none" is a fact
     * about the drill.
     */
    setup({ record: rec({ rightPairs: [], right: 0 }) })
    expect(screen.getByRole('heading', { name: /right \(0\)/i })).toBeInTheDocument()
    expect(screen.queryByText(/before right answers were saved/i)).not.toBeInTheDocument()
  })
})

describe('practising the misses again', () => {
  it('offers the drill, counting the words', async () => {
    const { user, onPractiseMisses } = setup()
    await user.click(screen.getByRole('button', { name: /practise these 1 missed word/i }))
    expect(onPractiseMisses).toHaveBeenCalledTimes(1)
  })

  it('is disabled when nothing was missed', () => {
    setup({ record: rec({ wrongPairs: [], wrong: 0 }) })
    expect(screen.getByRole('button', { name: /practise these/i })).toBeDisabled()
  })

  it('is disabled with a reason when the list has been deleted', () => {
    setup({ list: null })
    expect(screen.getByRole('button', { name: /practise these/i })).toBeDisabled()
    expect(screen.getByText(/list has been deleted/i)).toBeInTheDocument()
  })
})

describe('a record that is no longer there', () => {
  it('says so, and Back still works', async () => {
    // Account deletion, or history trimmed under the cap, while the screen is up.
    const { user, onBack } = setup({ record: null })
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('the score wears its band', () => {
  // Via the percentage span, not a slash — the date line has slashes too.
  const scoreLine = (pct: number) => screen.getByText(`(${pct}%)`).closest('p')!

  it('agrees with the row the screen was opened from', () => {
    setup({ record: rec({ right: 2, total: 2, pct: 100 }) })
    expect(scoreLine(100)).toHaveClass('border-correct')
  })

  it('bands a poor run red', () => {
    setup({ record: rec({ right: 1, total: 10, pct: 10 }) })
    expect(scoreLine(10)).toHaveClass('border-incorrect')
  })
})
