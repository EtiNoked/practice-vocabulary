import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewScreen } from './ReviewScreen'
import type { SessionRecord } from '../state/types'

const DAY = 86_400_000
const NOW = new Date(2026, 8, 5, 12, 0, 0).getTime()

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: Math.random().toString(36).slice(2),
  listId: 'l1',
  listName: 'Lesson 3',
  right: 8,
  wrong: 2,
  total: 10,
  pct: 80,
  wrongPairs: [],
  rightPairs: [],
  finishedAt: NOW,
  mode: 'full',
  partial: false,
  ...over,
})

const setup = (records: SessionRecord[], over = {}) => {
  const onOpen = vi.fn()
  const onHome = vi.fn()
  render(<ReviewScreen records={records} onOpen={onOpen} onHome={onHome} {...over} />)
  return { onOpen, onHome, user: userEvent.setup() }
}

beforeEach(() => {
  // 'Today' and 'Yesterday' are relative to the clock, so CI running near
  // midnight would otherwise decide whether these pass.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('empty states', () => {
  it('says nothing definite while the records are still arriving', () => {
    setup([], { loading: true })
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
    expect(screen.queryByText(/no practice yet/i)).not.toBeInTheDocument()
  })

  it('invites a first drill when there is no history at all', () => {
    setup([])
    expect(screen.getByText(/no practice yet/i)).toBeInTheDocument()
  })

  it('distinguishes an empty filter from an empty history', async () => {
    const { user } = setup([rec({ listId: 'l1', listName: 'Lesson 3' })])
    await user.selectOptions(screen.getByRole('combobox', { name: /list/i }), 'l1')
    expect(screen.queryByText(/no practice yet/i)).not.toBeInTheDocument()
  })
})

describe('grouping by day', () => {
  it('heads each day, naming today and yesterday', () => {
    setup([
      rec({ id: 'a', finishedAt: NOW - 3_600_000 }),
      rec({ id: 'b', finishedAt: NOW - DAY }),
      rec({ id: 'c', finishedAt: NOW - 4 * DAY }),
    ])
    expect(screen.getByRole('heading', { name: /^today$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^yesterday$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '01/09/2026' })).toBeInTheDocument()
  })

  it('compares local midnights, not raw elapsed time', () => {
    // 23:30 yesterday and 00:30 today are 1 hour apart but two different days.
    const lateYesterday = new Date(2026, 8, 4, 23, 30).getTime()
    vi.setSystemTime(new Date(2026, 8, 5, 0, 30).getTime())
    setup([rec({ id: 'a', finishedAt: lateYesterday })])
    expect(screen.getByRole('heading', { name: /^yesterday$/i })).toBeInTheDocument()
  })

  it('puts the newest drill first', () => {
    setup([
      rec({ id: 'old', listName: 'Older', finishedAt: NOW - 5 * DAY }),
      rec({ id: 'new', listName: 'Newer', finishedAt: NOW }),
    ])
    const names = screen.getAllByRole('button').map((b) => b.textContent ?? '')
    expect(names.findIndex((n) => n.includes('Newer'))).toBeLessThan(
      names.findIndex((n) => n.includes('Older')),
    )
  })
})

describe('a row', () => {
  it('shows the list name and the score', () => {
    setup([rec()])
    const row = screen.getByRole('button', { name: /Lesson 3/ })
    expect(row).toHaveTextContent('Lesson 3')
    expect(row).toHaveTextContent(/8 \/ 10 \(80%\)/)
  })

  it('flags a wrong-only run and a run stopped early', () => {
    setup([rec({ mode: 'wrong-only', partial: true })])
    const row = screen.getByRole('button', { name: /Lesson 3/ })
    expect(row).toHaveTextContent(/missed words only/i)
    expect(row).toHaveTextContent(/stopped early/i)
  })

  it('opens that drill', async () => {
    const { user, onOpen } = setup([rec({ id: 'r-42' })])
    await user.click(screen.getByRole('button', { name: /Lesson 3/ }))
    expect(onOpen).toHaveBeenCalledWith('r-42')
  })

  it('is a button, so a keyboard can reach it', () => {
    setup([rec()])
    expect(screen.getByRole('button', { name: /Lesson 3/ }).tagName).toBe('BUTTON')
  })
})

describe('filtering by list', () => {
  const two = () => [
    rec({ id: 'a', listId: 'l1', listName: 'Lesson 3' }),
    rec({ id: 'b', listId: 'l2', listName: 'Food' }),
  ]

  it('offers every list that appears in the history', () => {
    setup(two())
    const select = screen.getByRole('combobox', { name: /list/i })
    expect(within(select).getByRole('option', { name: 'Lesson 3' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Food' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: /all lists/i })).toBeInTheDocument()
  })

  it('narrows the rows, and restores them', async () => {
    const { user } = setup(two())
    const select = screen.getByRole('combobox', { name: /list/i })

    await user.selectOptions(select, 'l2')
    expect(screen.queryByRole('button', { name: /Lesson 3/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Food/ })).toBeInTheDocument()

    await user.selectOptions(select, 'all')
    expect(screen.getByRole('button', { name: /Lesson 3/ })).toBeInTheDocument()
  })

  it('still offers a list that has since been deleted', () => {
    /*
     * Options come from the RECORDS, never from saved lists. `listName` is
     * denormalised precisely so history outlives its list, and reading the
     * options from the live lists would throw that away.
     */
    setup([rec({ listId: 'gone', listName: 'Deleted list' })])
    expect(screen.getByRole('option', { name: 'Deleted list' })).toBeInTheDocument()
  })

  it('names a list once however many times it was drilled', () => {
    setup([rec({ id: 'a' }), rec({ id: 'b' }), rec({ id: 'c' })])
    expect(screen.getAllByRole('option', { name: 'Lesson 3' })).toHaveLength(1)
  })

  it('uses the most recent name a list was drilled under', () => {
    // Renames are not retrospective in history, but the filter should read as
    // the list is called now.
    setup([
      rec({ id: 'old', listName: 'Old name', finishedAt: NOW - DAY }),
      rec({ id: 'new', listName: 'New name', finishedAt: NOW }),
    ])
    expect(screen.getByRole('option', { name: 'New name' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Old name' })).not.toBeInTheDocument()
  })
})

describe('each practice wears its score', () => {
  const row = () => screen.getByRole('button', { name: /Lesson 3/ })

  it('bands the row by how the run went', () => {
    setup([rec({ right: 10, total: 10, pct: 100 })])
    expect(row()).toHaveClass('border-correct')
  })

  it('bands a middling run amber', () => {
    setup([rec({ right: 8, total: 10, pct: 80 })])
    expect(row()).toHaveClass('border-accent')
  })

  it('bands a poor run red', () => {
    setup([rec({ right: 2, total: 10, pct: 20 })])
    expect(row()).toHaveClass('border-incorrect')
  })

  it('overrides the card border rather than sitting beside it', () => {
    // `.card` brings its own 1px line; the utility has to win or the band is
    // drawn under it and never seen.
    setup([rec({ right: 2, total: 10, pct: 20 })])
    expect(row()).toHaveClass('border-2')
    expect(row()).toHaveClass('card')
  })
})

describe('a run over several lists is one run (011 D-3)', () => {
  const spanning = [
    rec({ id: 'a', runId: 'r7', listId: 'A', listName: 'Chapter 1', right: 4, wrong: 1, total: 5, pct: 80 }),
    rec({ id: 'b', runId: 'r7', listId: 'B', listName: 'Chapter 2', right: 5, wrong: 1, total: 6, pct: 83 }),
  ]

  it('shows one summary for the run, with the run’s own score', () => {
    setup(spanning)
    expect(screen.getByText(/2 lists/)).toBeInTheDocument()
    expect(screen.getByText(/9 \/ 11 \(82%\)/)).toBeInTheDocument()
  })

  it('offers each list’s share as its own way in, since detail is per list', () => {
    setup(spanning)
    expect(screen.getByRole('button', { name: /chapter 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /chapter 2/i })).toBeInTheDocument()
  })

  it('opens the record for the list that was clicked', async () => {
    const { onOpen, user } = setup(spanning)
    await user.click(screen.getByRole('button', { name: /chapter 2/i }))
    expect(onOpen).toHaveBeenCalledWith('b')
  })

  it('filters to one list and shows that list’s share alone', async () => {
    const { user } = setup(spanning)
    await user.selectOptions(screen.getByLabelText(/list/i), 'B')
    expect(screen.getByText(/5 \/ 6 \(83%\)/)).toBeInTheDocument()
    expect(screen.queryByText(/9 \/ 11/)).not.toBeInTheDocument()
  })

  it('leaves a single-record run exactly as it was — one clickable row', async () => {
    const { onOpen, user } = setup([rec({ id: 'solo', listName: 'Lesson 3' })])
    await user.click(screen.getByRole('button', { name: /lesson 3/i }))
    expect(onOpen).toHaveBeenCalledWith('solo')
  })
})
