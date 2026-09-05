import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listRepo } from './storage/listRepo'
import { sessionRepo } from './storage/sessionRepo'
import type { WordList } from './state/types'
import { setStubVoices, speechCalls } from './test/setup'
import { renderApp } from './test/renderApp'

const seeded: WordList = {
  id: 'seed',
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

beforeEach(() => localStorage.clear())

describe('typing a list and practising it', () => {
  it('goes from an empty app to a score', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /new list/i }))

    const cells = () => screen.getAllByRole('textbox').filter((el) => el.dataset.cell !== undefined)
    await user.type(cells()[0]!, 'daughter')
    await user.type(cells()[1]!, 'dochter')

    await user.click(screen.getByRole('button', { name: /start practice/i }))
    expect(screen.getByText(/you'll hear/i)).toBeInTheDocument()

    // The Start tap is what establishes the iOS gesture chain for the session.
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /show answer/i }))
    expect(screen.getByText('daughter')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /right/i }))
    expect(screen.getByText(/1 \/ 1/)).toBeInTheDocument()
    expect(screen.getByText(/\(100%\)/)).toBeInTheDocument()
  })
})

describe('practising a saved list', () => {
  it('lists it on the home screen and drills it', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))

    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /wrong/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))

    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /practise wrong ones only/i })).toBeEnabled()
  })

  it('speaks a word for every card, including after marking', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
    // One for Start, one for the card that marking advanced to.
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(2)
  })
})

describe('editing a saved list', () => {
  it('updates it in place and keeps the same entry', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const daughter = screen.getByDisplayValue('daughter')
    await user.clear(daughter)
    await user.type(daughter, 'granddaughter')
    await user.click(screen.getByRole('button', { name: /start practice/i }))

    // Confirming an edit persists immediately — no separate Save step.
    const stored = listRepo.getAll()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.id).toBe('seed')
    expect(stored[0]!.pairs.map((p) => p.col1)).toContain('granddaughter')
  })
})

describe('pasting a list', () => {
  it('accepts a spreadsheet paste and practises it', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: /new list/i }))
    await user.click(screen.getByRole('button', { name: /paste or import/i }))

    await user.click(screen.getByRole('textbox', { name: /paste/i }))
    await user.paste('daughter\tdochter\nson\tzoon\nuncle\toom')
    await user.click(screen.getByRole('button', { name: /add to list/i }))

    expect(screen.getByText(/3 complete pairs/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /start practice/i }))
    expect(within(screen.getByRole('main')).getByText(/3 words/i)).toBeInTheDocument()
  })
})

describe('recording score history', () => {
  const drillToEnd = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /wrong/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
  }

  it('records a finished drill and shows it on the home screen', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    await drillToEnd(user)
    await user.click(screen.getByRole('button', { name: /done/i }))

    expect(sessionRepo.getAll()).toHaveLength(1)
    expect(sessionRepo.getAll()[0]).toMatchObject({
      listId: 'seed',
      listName: 'Lesson 3',
      right: 1,
      total: 2,
      mode: 'full',
      partial: false,
    })
    expect(screen.getByText(/1 \/ 2 \(50%\)/)).toBeInTheDocument()
  })

  it('records a quit-early drill as partial, over what was answered', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
    await user.click(screen.getByRole('button', { name: /quit/i }))

    expect(sessionRepo.getAll()[0]).toMatchObject({ total: 1, pct: 100, partial: true })
  })

  it('writes NOTHING when the user quits without answering a card', async () => {
    // An empty log entry is noise, and it would drag the average around for a
    // drill that never really happened.
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    await user.click(screen.getByRole('button', { name: /quit/i }))

    expect(sessionRepo.getAll()).toEqual([])
  })

  it('marks a wrong-only re-run so it cannot flatter the average', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    await drillToEnd(user)
    await user.click(screen.getByRole('button', { name: /practise wrong ones only/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))

    const modes = sessionRepo.getAll().map((r) => r.mode)
    expect(modes).toContain('wrong-only')
    expect(modes).toContain('full')
  })

  it('keeps history after the list is deleted', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp()

    await drillToEnd(user)
    await user.click(screen.getByRole('button', { name: /done/i }))
    await user.click(screen.getByRole('button', { name: /delete/i }))

    expect(screen.queryByRole('button', { name: /^practise$/i })).not.toBeInTheDocument()
    // The name was captured at drill time, so the record still reads sensibly.
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})

describe('practising a Dutch/French list', () => {
  const dutchFrench: WordList = {
    id: 'fr1',
    name: 'Frans les 1',
    col1Lang: 'nl',
    col2Lang: 'fr',
    langSource: 'header',
    pairs: [
      { id: 'p1', col1: 'de deur', col2: 'la porte' },
      { id: 'p2', col1: 'het raam', col2: 'la fenêtre' },
    ],
    createdAt: 1,
    updatedAt: 1,
    origin: 'manual',
  }

  /**
   * Asserts the LANGUAGE, not just that speech happened. "Spoke the right words
   * in the wrong accent" is the exact defect this feature fixes, and it passes a
   * call-count assertion perfectly well.
   */
  it('speaks the French column with a French voice', async () => {
    setStubVoices([
      { name: 'Thomas', lang: 'fr-FR' },
      { name: 'Google Nederlands', lang: 'nl-NL' },
      { name: 'Daniel', lang: 'en-GB' },
    ])
    listRepo.save(dutchFrench)
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /practise/i }))
    expect(screen.getByText(/you'll hear/i)).toHaveTextContent(/French/)
    await user.click(screen.getByRole('button', { name: /^start$/i }))

    const spoken = speechCalls.filter((c) => c.type === 'speak')
    expect(spoken).toHaveLength(1)
    // The drill shuffles, so which of the two French words comes first is not
    // fixed. The language and the voice are the point of this test and are.
    expect(spoken[0]).toMatchObject({ lang: 'fr-FR', voice: 'Thomas' })
    expect(['la porte', 'la fenêtre']).toContain(
      spoken[0]!.type === 'speak' ? spoken[0]!.text : '',
    )
  })

  it('falls back to any French voice the device does have', async () => {
    setStubVoices([{ name: 'Amelie', lang: 'fr-CA' }])
    listRepo.save(dutchFrench)
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    expect(speechCalls.filter((c) => c.type === 'speak')[0]).toMatchObject({ voice: 'Amelie' })
  })

  // The warning path is generic, but a language it has never been shown for is
  // worth proving rather than assuming.
  it('warns by name when the device has no French voice', async () => {
    setStubVoices([{ name: 'Google Nederlands', lang: 'nl-NL' }])
    listRepo.save(dutchFrench)
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /practise/i }))
    expect(await screen.findByText(/no french voice on this device/i)).toBeInTheDocument()
  })

  it('still speaks Dutch for an existing English/Dutch list', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    expect(speechCalls.filter((c) => c.type === 'speak')[0]).toMatchObject({ lang: 'nl-NL' })
  })

  it('carries a saved manual language choice back into the editor', async () => {
    listRepo.save({ ...dutchFrench, langSource: 'manual' })
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: /edit/i }))
    expect((screen.getByLabelText(/column 1 language/i) as HTMLSelectElement).value).toBe('nl')
    expect((screen.getByLabelText(/column 2 language/i) as HTMLSelectElement).value).toBe('fr')
    expect(screen.queryByText(/guessed/i)).not.toBeInTheDocument()
  })
})
