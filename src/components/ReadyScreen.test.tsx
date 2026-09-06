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

const setup = (saved = false) => {
  const onStart = vi.fn()
  const onSave = vi.fn()
  const onBack = vi.fn()
  render(
    <ReadyScreen list={list} saved={saved} onStart={onStart} onSave={onSave} onBack={onBack} />,
  )
  return { onStart, onSave, onBack, user: userEvent.setup() }
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
