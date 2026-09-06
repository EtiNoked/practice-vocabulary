import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameResults } from './GameResults'
import { advance, answer, createGame, currentQuestion, timeOut } from '../game/game'
import { QUESTION_MS, type Game, type GameSettings } from '../game/types'
import { seededRng } from '../state/session'
import type { PooledWord } from '../state/wordPool'

const POOL: PooledWord[] = [
  'bread/brood',
  'cheese/kaas',
  'apple/appel',
  'money/geld',
  'water/water',
  'milk/melk',
].map((s, i) => ({
  id: `w${i}`,
  col1: s.split('/')[0]!,
  col2: s.split('/')[1]!,
  listId: 'l1',
  listName: 'Food',
}))

const settings: GameSettings = {
  spec: { listIds: ['l1'], source: 'all' },
  count: 4,
  col1Lang: 'en',
  col2Lang: 'nl',
}

/** Play `count` questions, getting the first `rights` of them correct. */
function play(rights: number, count = 4, lastTimesOut = false): Game {
  let g = createGame({ ...settings, count }, POOL, seededRng(1))
  for (let i = 0; i < count; i++) {
    const q = currentQuestion(g)!
    if (lastTimesOut && i === count - 1) g = timeOut(g)
    else if (i < rights) g = answer(g, q.word.id, QUESTION_MS - 2000)
    else g = answer(g, q.options.find((o) => o.id !== q.word.id)!.id, QUESTION_MS - 2000)
    g = advance(g)
  }
  return g
}

const setup = (game: Game, partial = false) => {
  const onReplay = vi.fn()
  const onNewGame = vi.fn()
  const onDone = vi.fn()
  render(
    <GameResults
      game={game}
      partial={partial}
      onReplay={onReplay}
      onNewGame={onNewGame}
      onDone={onDone}
    />,
  )
  return { onReplay, onNewGame, onDone }
}

describe('the score', () => {
  it('reports right answers against questions asked', () => {
    setup(play(3))
    expect(screen.getByText(/3 of 4 right/)).toBeInTheDocument()
  })

  it('reports points scored against points available', () => {
    setup(play(3))
    // Three at 8 points each, out of a possible 40.
    expect(screen.getByText(/24 out of 40 possible/)).toBeInTheDocument()
  })

  it('celebrates a clean sweep', () => {
    setup(play(4))
    expect(screen.getByRole('heading', { name: /perfect round/i })).toBeInTheDocument()
  })

  it('does not celebrate anything less', () => {
    setup(play(3))
    expect(screen.queryByRole('heading', { name: /perfect/i })).not.toBeInTheDocument()
  })
})

describe('what was missed', () => {
  it('lists them with both sides', () => {
    setup(play(2))
    const missed = screen.getByRole('list')
    expect(missed).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('marks the ones that ran out of time', () => {
    setup(play(3, 4, true))
    expect(screen.getByText(/ran out of time/i)).toBeInTheDocument()
  })

  it('says where they have gone, so the game connects to the drill', () => {
    setup(play(2))
    expect(screen.getByText(/words you got wrong/i)).toBeInTheDocument()
  })

  it('shows no empty section after a clean sweep', () => {
    setup(play(4))
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText(/worth another look/i)).not.toBeInTheDocument()
  })
})

describe('a game that was quit', () => {
  it('says so, rather than presenting a short game as a full one', () => {
    setup(play(1, 2), true)
    expect(screen.getByRole('heading', { name: /game ended/i })).toBeInTheDocument()
    expect(screen.getByText(/you left early/i)).toBeInTheDocument()
  })

  it('scores only what was actually answered', () => {
    setup(play(1, 2), true)
    expect(screen.getByText(/1 of 2 right/)).toBeInTheDocument()
  })

  it('says nothing about leaving early when the game was finished', () => {
    setup(play(4))
    expect(screen.queryByText(/you left early/i)).not.toBeInTheDocument()
  })
})

describe('going again', () => {
  it('offers a replay with the same settings', () => {
    const { onReplay } = setup(play(2))
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(onReplay).toHaveBeenCalled()
  })

  it('offers a fresh setup', () => {
    const { onNewGame } = setup(play(2))
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(onNewGame).toHaveBeenCalled()
  })

  it('offers a way out', () => {
    const { onDone } = setup(play(2))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalled()
  })
})
