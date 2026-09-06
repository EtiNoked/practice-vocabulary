import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Home } from './Home'

/**
 * Home is covered end to end by App.test.tsx; this file exists for the props it
 * renders conditionally, which an integration test cannot easily turn off.
 */
const listActions = {
  onPractise: () => {},
  onEdit: () => {},
  onRename: () => {},
  onDelete: () => {},
}

describe('the game entry (008 FR-1)', () => {
  it('offers a game when a route is supplied', () => {
    const onPlayGame = vi.fn()
    render(<Home lists={[]} onNewList={() => {}} onPlayGame={onPlayGame} {...listActions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play a game' }))
    expect(onPlayGame).toHaveBeenCalled()
  })

  it('renders no game button without one', () => {
    // Optional for the same reason onSeeAllHistory is: this component is rendered
    // directly by tests that have no router to hand it.
    render(<Home lists={[]} onNewList={() => {}} {...listActions} />)
    expect(screen.queryByRole('button', { name: 'Play a game' })).not.toBeInTheDocument()
  })

  it('keeps New list as the primary action', () => {
    render(<Home lists={[]} onNewList={() => {}} onPlayGame={() => {}} {...listActions} />)
    expect(screen.getByRole('button', { name: 'New list' })).toHaveClass('btn-primary')
  })
})
