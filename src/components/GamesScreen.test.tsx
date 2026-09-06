import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GamesScreen } from './GamesScreen'
import type { GameRecord } from '../game/types'

const record: GameRecord = {
  id: 'g1',
  finishedAt: Date.now(),
  listIds: ['a'],
  listNames: ['Lesson 3'],
  source: 'all',
  correct: 8,
  asked: 10,
  points: 64,
  available: 100,
  partial: false,
}

const setup = (over: Partial<Parameters<typeof GamesScreen>[0]> = {}) => {
  const onPlayGame = vi.fn()
  render(<GamesScreen games={[record]} onPlayGame={onPlayGame} {...over} />)
  return { onPlayGame, user: userEvent.setup() }
}

describe('GamesScreen', () => {
  it('names itself', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'My games' })).toBeInTheDocument()
  })

  it('keeps Play a game as the primary action', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Play a game' })).toHaveClass('btn-primary')
  })

  it('calls back when it is tapped', async () => {
    const { onPlayGame, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Play a game' }))
    expect(onPlayGame).toHaveBeenCalled()
  })

  /*
   * The point of the screen (012 D-3). These records have been written since 008 and
   * rendered nowhere — `visibleGames` fed the missed-words pool and nothing else.
   */
  it('shows rounds that were previously stored and never displayed', () => {
    setup()
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
    expect(screen.getByText(/8 \/ 10/)).toBeInTheDocument()
  })

  it('passes loading through rather than answering for it', () => {
    setup({ games: [], loading: true })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
