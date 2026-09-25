import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Farewell } from '../share/types'
import { FarewellBanner } from './FarewellBanner'

function farewell(reason: Farewell['reason'], byName: string | null = 'Dana'): Farewell {
  return {
    id: `f-${reason}`,
    uid: 'u1',
    listId: 'l1',
    reason,
    byName,
    at: 1,
    list: {
      id: 'l1',
      name: 'French verbs',
      col1Lang: 'en',
      col2Lang: 'fr',
      langSource: 'header',
      pairs: [
        { id: 'p1', col1: 'to be', col2: 'être' },
        { id: 'p2', col1: 'to have', col2: 'avoir' },
      ],
      createdAt: 1,
      updatedAt: 1,
      origin: 'manual',
    },
  }
}

function renderBanner(farewells: Farewell[]) {
  const onKeep = vi.fn()
  const onDismiss = vi.fn()
  const result = render(<FarewellBanner farewells={farewells} onKeep={onKeep} onDismiss={onDismiss} />)
  return { ...result, onKeep, onDismiss, user: userEvent.setup() }
}

describe('FarewellBanner', () => {
  it('renders nothing when no list was lost', () => {
    const { container } = renderBanner([])
    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['removed', 'Dana removed you from “French verbs”.'],
    ['stopped', 'Dana stopped sharing “French verbs” with you.'],
    ['deleted', 'Dana deleted “French verbs”.'],
  ] as const)('says what happened when the owner %s it', (reason, sentence) => {
    renderBanner([farewell(reason)])
    expect(screen.getByText(sentence)).toBeInTheDocument()
  })

  it('falls back to "The owner" when the name is unknown', () => {
    renderBanner([farewell('deleted', null)])
    expect(screen.getByText('The owner deleted “French verbs”.')).toBeInTheDocument()
  })

  it('offers a copy of the words as they last were', () => {
    renderBanner([farewell('removed')])
    expect(screen.getByText(/keep a private copy of its 2 words/i)).toBeInTheDocument()
  })

  it('keeps a copy of that farewell’s list', async () => {
    const f = farewell('stopped')
    const { onKeep, onDismiss, user } = renderBanner([farewell('removed'), f])
    await user.click(screen.getAllByRole('button', { name: 'Keep a private copy' })[1]!)
    expect(onKeep).toHaveBeenCalledWith(f)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses that farewell', async () => {
    const f = farewell('deleted')
    const { onKeep, onDismiss, user } = renderBanner([f])
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledWith(f)
    expect(onKeep).not.toHaveBeenCalled()
  })
})
