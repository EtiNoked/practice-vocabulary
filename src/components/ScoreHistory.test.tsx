import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScoreHistory } from './ScoreHistory'
import type { SessionRecord } from '../state/types'

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: Math.random().toString(36),
  listId: 'l1',
  listName: 'Lesson 3',
  right: 8,
  wrong: 2,
  total: 10,
  pct: 80,
  wrongPairs: [],
  finishedAt: Date.UTC(2026, 8, 1),
  mode: 'full',
  partial: false,
  ...over,
})

describe('empty state', () => {
  it('invites a first drill rather than showing an empty table', () => {
    render(<ScoreHistory records={[]} />)
    expect(screen.getByText(/no practice yet/i)).toBeInTheDocument()
  })
})

describe('records', () => {
  it('shows the score and the list name', () => {
    render(<ScoreHistory records={[rec()]} />)
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
    expect(screen.getByText(/8 \/ 10 \(80%\)/)).toBeInTheDocument()
  })

  it('still reads sensibly for a list that has been deleted', () => {
    // The name came from the record, not a lookup — which is the whole reason
    // it is denormalised.
    render(<ScoreHistory records={[rec({ listName: 'Deleted list', listId: 'gone' })]} />)
    expect(screen.getByText('Deleted list')).toBeInTheDocument()
  })

  it('labels a wrong-only run', () => {
    render(<ScoreHistory records={[rec({ mode: 'wrong-only' })]} />)
    expect(screen.getByText(/missed words only/i)).toBeInTheDocument()
  })

  it('labels a run that was stopped early', () => {
    render(<ScoreHistory records={[rec({ partial: true })]} />)
    expect(screen.getByText(/stopped early/i)).toBeInTheDocument()
  })
})

describe('trend', () => {
  it('averages full runs once there are at least two', () => {
    render(<ScoreHistory records={[rec({ pct: 100 }), rec({ pct: 50 })]} />)
    expect(screen.getByText(/averaging 75% over your last 2 full runs/i)).toBeInTheDocument()
  })

  it('says nothing from a single run', () => {
    render(<ScoreHistory records={[rec()]} />)
    expect(screen.queryByText(/averaging/i)).not.toBeInTheDocument()
  })

  it('excludes wrong-only and partial runs from the average', () => {
    // A missed-words drill is a harder subset; counting it would understate
    // progress, and a quit-early run is not a real attempt.
    render(
      <ScoreHistory
        records={[
          rec({ pct: 100 }),
          rec({ pct: 100 }),
          rec({ pct: 0, mode: 'wrong-only' }),
          rec({ pct: 0, partial: true }),
        ]}
      />,
    )
    expect(screen.getByText(/averaging 100% over your last 2 full runs/i)).toBeInTheDocument()
  })

  it('caps the list at ten entries', () => {
    render(<ScoreHistory records={Array.from({ length: 25 }, () => rec())} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
  })
})

describe('each practice wears its score', () => {
  const row = () => screen.getByText('Lesson 3').closest('li')!

  it('goes green on a clean sweep', () => {
    render(<ScoreHistory records={[rec({ right: 10, total: 10, pct: 100 })]} />)
    expect(row()).toHaveClass('border-correct')
  })

  it('goes amber from 70 up', () => {
    render(<ScoreHistory records={[rec({ right: 7, total: 10, pct: 70 })]} />)
    expect(row()).toHaveClass('border-accent')
  })

  it('goes red below 70', () => {
    render(<ScoreHistory records={[rec({ right: 6, total: 10, pct: 60 })]} />)
    expect(row()).toHaveClass('border-incorrect')
  })

  it('does not show a rounded-up 100% as green', () => {
    render(<ScoreHistory records={[rec({ right: 199, total: 200, pct: 100 })]} />)
    expect(row()).toHaveClass('border-accent')
  })

  it('colours a wrong-only run on its own score, and still labels it', () => {
    render(
      <ScoreHistory records={[rec({ right: 0, total: 3, pct: 0, mode: 'wrong-only' })]} />,
    )
    expect(row()).toHaveClass('border-incorrect')
    expect(screen.getByText(/missed words only/i)).toBeInTheDocument()
  })

  it('keeps the score in text, so the colour is never the only signal', () => {
    // Colour-blind readers, forced-colours mode and greyscale screenshots all
    // lose the border and keep this.
    render(<ScoreHistory records={[rec({ right: 6, total: 10, pct: 60 })]} />)
    expect(screen.getByText(/6 \/ 10 \(60%\)/)).toBeInTheDocument()
  })

  it('gives every row the same border width, banded or not', () => {
    render(<ScoreHistory records={[rec()]} />)
    expect(row()).toHaveClass('border-2')
  })
})
