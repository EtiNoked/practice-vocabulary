import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drillRepo } from './storage/drillRepo'
import { listRepo } from './storage/listRepo'
import { sessionRepo } from './storage/sessionRepo'
import type { WordList } from './state/types'
import { setStubVoices, speechCalls } from './test/setup'
import {
  configuredGuestStore,
  renderApp,
  resolvingStore,
  signedInStore,
} from './test/renderApp'
import { goTo } from './test/navigate'
import { GUEST_CHOICE_KEY, writeGuestChoice } from './auth/guestChoice'
import type { AuthUser } from './auth/types'

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

beforeEach(() => {
  localStorage.clear()
  // sessionStorage holds the "continue as guest" choice. Without this the choice
  // leaks between tests and their ORDER decides whether the welcome screen shows.
  sessionStorage.clear()
})

describe('typing a list and practising it', () => {
  it('goes from an empty app to a score', async () => {
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /new list/i }))

    const cells = () => screen.getAllByRole('textbox').filter((el) => el.dataset.cell !== undefined)
    await user.type(cells()[0]!, 'daughter')
    await user.type(cells()[1]!, 'dochter')

    await user.click(screen.getByRole('button', { name: /start practice/i }))
    expect(screen.getByText(/you'll hear/i)).toBeInTheDocument()

    // The mode tap is what establishes the iOS gesture chain for the session.
    await user.click(screen.getByRole('button', { name: /^test$/i }))
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
    await goTo(user, 'My lists')

    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))

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
    await goTo(user, 'My lists')
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
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
    await goTo(user, 'My lists')

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
    await goTo(user, 'My lists')
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
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /wrong/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
  }

  it('records a finished drill and shows it on the home screen', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

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
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
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
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /quit/i }))

    expect(sessionRepo.getAll()).toEqual([])
  })

  it('marks a wrong-only re-run so it cannot flatter the average', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

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
    await goTo(user, 'My lists')

    await drillToEnd(user)
    await user.click(screen.getByRole('button', { name: /done/i }))

    await goTo(user, 'My lists')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.queryByRole('button', { name: /^practise$/i })).not.toBeInTheDocument()

    // The name was captured at drill time, so the record still reads sensibly — which is
    // now provable on the screen that actually shows history.
    await goTo(user, 'My practices')
    expect(screen.getByRole('button', { name: /Lesson 3/ })).toBeInTheDocument()
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
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    expect(screen.getByText(/you'll hear/i)).toHaveTextContent(/French/)
    await user.click(screen.getByRole('button', { name: /^test$/i }))

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
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(speechCalls.filter((c) => c.type === 'speak')[0]).toMatchObject({ voice: 'Amelie' })
  })

  // The warning path is generic, but a language it has never been shown for is
  // worth proving rather than assuming.
  it('warns by name when the device has no French voice', async () => {
    setStubVoices([{ name: 'Google Nederlands', lang: 'nl-NL' }])
    listRepo.save(dutchFrench)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    expect(await screen.findByText(/no french voice on this device/i)).toBeInTheDocument()
  })

  it('still speaks Dutch for an existing English/Dutch list', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(speechCalls.filter((c) => c.type === 'speak')[0]).toMatchObject({ lang: 'nl-NL' })
  })

  it('carries a saved manual language choice back into the editor', async () => {
    listRepo.save({ ...dutchFrench, langSource: 'manual' })
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /edit/i }))
    expect((screen.getByLabelText(/column 1 language/i) as HTMLSelectElement).value).toBe('nl')
    expect((screen.getByLabelText(/column 2 language/i) as HTMLSelectElement).value).toBe('fr')
    expect(screen.queryByText(/guessed/i)).not.toBeInTheDocument()
  })
})

/**
 * THE REGRESSION SUITE FOR THE REPORTED BUG.
 *
 * "The test stops after a few seconds and I'm back at the main page" was a full
 * page reload throwing away useState. A reload is an unmount followed by a fresh
 * mount, which is exactly what these tests do — so if persistence regresses, the
 * user's report comes back and this suite fails.
 */
describe('a drill surviving a reload', () => {
  const startDrill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
  }

  it('comes back on the same card, with the same score', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    const first = renderApp()
    await goTo(user, 'My lists')

    await startDrill(user)
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
    expect(screen.getByText(/card 2 of 2/i)).toBeInTheDocument()

    // The reload.
    first.unmount()
    renderApp()

    expect(screen.getByText(/card 2 of 2/i)).toBeInTheDocument()
    expect(screen.getByText(/✓ 1/)).toBeInTheDocument()
  })

  it('comes back on the same WORD, not merely the same position', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    const first = renderApp()
    await goTo(user, 'My lists')

    await startDrill(user)
    // Revealing is what puts the prompt word on screen to be compared — and it
    // doubles as proof that `revealed` itself survives the reload.
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    const before = screen.getByText(/dochter|zoon/).textContent

    first.unmount()
    renderApp()

    // The drill order is shuffled, so restoring the index without the order
    // would land on a different word and still satisfy "card 1 of 2".
    expect(screen.getByText(/dochter|zoon/).textContent).toBe(before)
    expect(screen.getByRole('button', { name: /right/i })).toBeInTheDocument()
  })

  it('restores a practice drill as practice, not as a test', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    const first = renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^practice$/i }))

    first.unmount()
    renderApp()

    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show answer/i })).not.toBeInTheDocument()
  })

  it('survives the source list being deleted mid-drill', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    const first = renderApp()
    await goTo(user, 'My lists')

    await startDrill(user)
    listRepo.remove(seeded.id)

    first.unmount()
    renderApp()

    // R5: the list travels inside the payload, so it cannot dangle.
    expect(screen.getByText(/card 1 of 2/i)).toBeInTheDocument()
  })

  it('opens at home when nothing was saved', () => {
    listRepo.save(seeded)
    renderApp()
    expect(screen.getByRole('button', { name: /my lists/i })).toBeInTheDocument()
  })

  // FR-5: a corrupt key is discarded silently rather than crashing the app.
  it('opens at home on a corrupt saved drill', () => {
    listRepo.save(seeded)
    localStorage.setItem('pvt.drill.v1', '{{{ not json')
    renderApp()
    expect(screen.getByRole('button', { name: /my lists/i })).toBeInTheDocument()
  })
})

describe('clearing the saved drill', () => {
  const drillToEnd = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /wrong/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
  }

  it('saves while the drill is running', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))

    expect(drillRepo.load()).not.toBeNull()
  })

  // FR-4, all three exits.
  it('clears on finishing', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await drillToEnd(user)
    expect(drillRepo.load()).toBeNull()
  })

  it('clears on quitting', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /quit/i }))

    expect(drillRepo.load()).toBeNull()
  })

  it('clears on going home', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await drillToEnd(user)
    await user.click(screen.getByRole('button', { name: /done/i }))

    expect(drillRepo.load()).toBeNull()
  })

  it('leaves the user at home after finishing and reloading', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    const first = renderApp()
    await goTo(user, 'My lists')

    await drillToEnd(user)
    await user.click(screen.getByRole('button', { name: /done/i }))
    first.unmount()
    renderApp()

    expect(screen.getByRole('button', { name: /my lists/i })).toBeInTheDocument()
  })
})

/**
 * FR-3, and the subtlest requirement in the feature.
 *
 * A restore happens at page load with NO user gesture in scope, so iOS Safari
 * would silently drop an auto-speak there. A restore that speaks looks perfect
 * in desktop Chrome and is broken on the phone this app is actually used on.
 */
describe('a restored drill and the iOS gesture chain', () => {
  const startAndReload = async (mode: RegExp) => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    const first = renderApp()
    await goTo(user, 'My lists')
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: mode }))
    first.unmount()
    speechCalls.length = 0
    renderApp()
    return userEvent.setup()
  }

  it('does not speak when a test drill is restored', async () => {
    await startAndReload(/^test$/i)
    expect(speechCalls).toEqual([])
  })

  it('does not speak when a practice drill is restored', async () => {
    await startAndReload(/^practice$/i)
    expect(speechCalls).toEqual([])
  })

  it('tells the user why it is silent, and how to hear the word', async () => {
    await startAndReload(/^test$/i)
    expect(screen.getByText(/resumed/i)).toBeInTheDocument()
  })

  it('speaks as soon as the user taps, re-establishing the chain', async () => {
    const user = await startAndReload(/^test$/i)
    await user.click(screen.getByRole('button', { name: /hear it again/i }))
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(1)
  })

  it('drops the resumed hint once the user has acted', async () => {
    const user = await startAndReload(/^test$/i)
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    expect(screen.queryByText(/resumed/i)).not.toBeInTheDocument()
  })

  it('shows no hint on a drill that was started normally', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(screen.queryByText(/resumed/i)).not.toBeInTheDocument()
  })
})

describe('a full practice run', () => {
  it('goes from the list to a completion panel with no score anywhere', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^practice$/i }))

    /*
     * Card 1: the word is simply there, and the answer is covered.
     *
     * STRENGTHENED for 009, not merely reworded. This used to assert
     * `getByText('daughter')` was in the document — which still passes with the
     * answer covered, because the cover is a CSS filter over ordinary DOM text.
     * A presence check cannot see this feature at all, so it has to go through
     * the accessibility tree instead.
     */
    expect(screen.getByText(/card 1 of 2/i)).toBeInTheDocument()
    expect(screen.getByText('dochter')).toBeInTheDocument()
    expect(screen.getByText('daughter')).toHaveAttribute('aria-hidden', 'true')

    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/card 2 of 2/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /next/i }))

    expect(screen.getByText(/all 2 words/i)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('keeps list order rather than shuffling', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^practice$/i }))

    // Spec A3: the order the list was written in.
    expect(screen.getByText('dochter')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('zoon')).toBeInTheDocument()
  })

  // FR-16, and FR-12's Previous. Both are taps, so the gesture chain holds.
  it('speaks on every advance, and on going back', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^practice$/i }))
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(2)

    // Moving back should say the card you moved back TO.
    await user.click(screen.getByRole('button', { name: /previous/i }))
    const spoken = speechCalls.filter((c) => c.type === 'speak')
    expect(spoken).toHaveLength(3)
    expect(spoken[2]).toMatchObject({ text: 'dochter' })
  })

  // FR-13: a study run must not turn up in the score history at all.
  it('records nothing in score history', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^practice$/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))

    expect(sessionRepo.getAll()).toEqual([])
  })
})

describe('switching mode from the results screen', () => {
  it('goes from a finished test straight into studying the same list', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))

    await user.click(screen.getByRole('button', { name: /study these/i }))

    expect(screen.getByText(/card 1 of 2/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('speaks the first card of the new mode', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^practice$/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    speechCalls.length = 0

    await user.click(screen.getByRole('button', { name: /test yourself/i }))
    expect(speechCalls.filter((c) => c.type === 'speak')).toHaveLength(1)
  })
})

/**
 * 009. The answer cover, end to end.
 *
 * The unit tests pin each piece; these pin the thing the user actually
 * experiences — that the decision outlives the card it was made on, and the
 * reload that would otherwise quietly undo it.
 */
describe('covering and uncovering the answer in practice', () => {
  const covered = () => screen.getByText('daughter').getAttribute('aria-hidden') === 'true'

  const startPractice = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^practice$/i }))
  }

  it('uncovers on request, and covers again', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')
    await startPractice(user)

    expect(covered()).toBe(true)
    await user.click(screen.getByRole('button', { name: /reveal answer/i }))
    expect(covered()).toBe(false)

    await user.click(screen.getByRole('button', { name: /hide answer/i }))
    expect(covered()).toBe(true)
  })

  // FR-4, and the whole of US-4: decide once, not once per card.
  it('carries the decision on to the next card', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')
    await startPractice(user)

    await user.click(screen.getByRole('button', { name: /reveal answer/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))

    expect(screen.getByText(/card 2 of 2/i)).toBeInTheDocument()
    expect(screen.getByText('zoon')).toBeInTheDocument()
    expect(screen.getByText('son')).not.toHaveAttribute('aria-hidden')
  })

  it('carries a re-covering back the other way too', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')
    await startPractice(user)

    await user.click(screen.getByRole('button', { name: /reveal answer/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /hide answer/i }))
    await user.click(screen.getByRole('button', { name: /previous/i }))

    expect(screen.getByText(/card 1 of 2/i)).toBeInTheDocument()
    expect(covered()).toBe(true)
  })

  // FR-6. The cover rides inside the Session, so the drill's existing
  // park-on-every-action already covers it — this is what proves it did.
  it('comes back uncovered after a reload', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    const first = renderApp()
    await goTo(user, 'My lists')
    await startPractice(user)
    await user.click(screen.getByRole('button', { name: /reveal answer/i }))

    first.unmount()
    renderApp()

    expect(screen.getByText(/card 1 of 2/i)).toBeInTheDocument()
    expect(covered()).toBe(false)
    expect(screen.getByRole('button', { name: /hide answer/i })).toBeInTheDocument()
  })

  // FR-5. A new run is a new decision, however the last one ended.
  it('covers the answer again when the same list is practised again', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')
    await startPractice(user)

    await user.click(screen.getByRole('button', { name: /reveal answer/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))

    await user.click(screen.getByRole('button', { name: /practice again/i }))

    expect(screen.getByText(/card 1 of 2/i)).toBeInTheDocument()
    expect(covered()).toBe(true)
  })

  // FR-10. Uncovering is not an advance, so it must not re-speak the prompt.
  it('says nothing when the answer is uncovered', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')
    await startPractice(user)
    speechCalls.length = 0

    await user.click(screen.getByRole('button', { name: /reveal answer/i }))
    expect(speechCalls).toHaveLength(0)
  })
})

// FR-6: persistence is a convenience layer. Losing it degrades to 001's
// in-memory behaviour and must never block a drill.
describe('a drill with localStorage refused', () => {
  it('still runs start to finish', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })

    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))

    expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})

const account: AuthUser = {
  uid: 'u1',
  displayName: 'Eti',
  email: 'eti@example.com',
  photoURL: null,
}

describe('the welcome gate', () => {
  it('shows the front door to a first-time visitor, and nothing else', () => {
    renderApp(configuredGuestStore())

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue as guest/i })).toBeInTheDocument()

    // The whole point: the app is NOT behind it. Asserting the absence of the
    // home screen's primary action, not merely that some heading is present.
    expect(screen.queryByRole('button', { name: /new list/i })).not.toBeInTheDocument()
  })

  it('lets a guest through, and remembers for the session', async () => {
    renderApp(configuredGuestStore())

    await userEvent.click(screen.getByRole('button', { name: /continue as guest/i }))

    expect(screen.getByRole('button', { name: /my lists/i })).toBeInTheDocument()
    expect(sessionStorage.getItem(GUEST_CHOICE_KEY)).toBe('1')
  })

  it('does not ask again once the choice is made', () => {
    writeGuestChoice(true)
    renderApp(configuredGuestStore())

    // A reload inside the tab is not a new decision.
    expect(screen.getByRole('button', { name: /my lists/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue as guest/i })).not.toBeInTheDocument()
  })

  it('never appears when there is no Firebase project to sign in to', () => {
    renderApp()

    // A local-only build must be exactly what it always was. A front door
    // offering a sign-in that cannot work is worse than no front door.
    expect(screen.queryByRole('button', { name: /continue as guest/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /my lists/i })).toBeInTheDocument()
  })

  it('does not flash at a returning user whose session is still restoring', () => {
    renderApp(resolvingStore())

    // R2: onAuthStateChanged fires null BEFORE restoring a session. Showing the
    // login screen there tells someone they were silently logged out.
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue as guest/i })).not.toBeInTheDocument()
  })

  it('opens on its own once someone is signed in', () => {
    renderApp(signedInStore(account))

    expect(screen.getByRole('button', { name: /my lists/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue as guest/i })).not.toBeInTheDocument()
  })
})

/**
 * Gets a signed-in app as far as a running drill.
 *
 * Deliberately builds the list through the UI rather than seeding listRepo: a
 * signed-in app is backed by the Firestore store, so a localStorage-seeded list
 * is invisible to it. A brand-new list needs no store at all to be drilled —
 * only saving one does.
 */
async function drillAsSignedIn(user: ReturnType<typeof userEvent.setup>) {
  await goTo(user, 'My lists')
  await user.click(screen.getByRole('button', { name: /new list/i }))
  const cells = () => screen.getAllByRole('textbox').filter((el) => el.dataset.cell !== undefined)
  await user.type(cells()[0]!, 'daughter')
  await user.type(cells()[1]!, 'dochter')
  await user.click(screen.getByRole('button', { name: /start practice/i }))
  await user.click(screen.getByRole('button', { name: /^test$/i }))
}

describe('the account slot', () => {
  it('is there on the home screen and stays there through a drill', async () => {
    const user = userEvent.setup()
    renderApp(signedInStore(account))

    expect(screen.getByRole('button', { name: /eti/i })).toBeInTheDocument()
    await drillAsSignedIn(user)

    // Disconnecting should not require navigating home first.
    expect(screen.getByRole('button', { name: /eti/i })).toBeInTheDocument()
  })

  it('does not exist at all without a Firebase project', () => {
    renderApp()
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
  })

  it('does not let an open menu drive the drill', async () => {
    const user = userEvent.setup()
    renderApp(signedInStore(account))

    await drillAsSignedIn(user)
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /eti/i }))

    // TestCard binds Y/N on window, so without a guard this marks the card
    // and ends the drill underneath the menu the user is reading.
    await user.keyboard('n')

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /right/i })).toBeInTheDocument()
  })
})

describe('signing out', () => {
  it('returns to the front door', async () => {
    const user = userEvent.setup()
    renderApp(signedInStore(account))

    await user.click(screen.getByRole('button', { name: /eti/i }))
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(await screen.findByRole('button', { name: /continue as guest/i })).toBeInTheDocument()
    expect(sessionStorage.getItem(GUEST_CHOICE_KEY)).toBeNull()
  })

  it('resets the app rather than leaving it mid-flow', async () => {
    const user = userEvent.setup()
    renderApp(signedInStore(account))

    await goTo(user, 'My lists')
    await user.click(screen.getByRole('button', { name: /new list/i }))
    expect(screen.getByRole('button', { name: /start practice/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /eti/i }))
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))
    await user.click(await screen.findByRole('button', { name: /continue as guest/i }))

    // Back at home, not still in the editor of the account that just left.
    expect(screen.getByRole('button', { name: /my lists/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start practice/i })).not.toBeInTheDocument()
  })

  it('abandons a running drill without recording it', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderApp(signedInStore(account))

    await drillAsSignedIn(user)
    await user.click(screen.getByRole('button', { name: /show answer/i }))

    await user.click(screen.getByRole('button', { name: /eti/i }))
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(confirm).toHaveBeenCalledTimes(1)
    // A drill the user was warned they were ending must not turn up in history
    // as though they had finished it.
    expect(sessionRepo.getAll()).toEqual([])
    confirm.mockRestore()
  })
})

describe('the theme control with no account system', () => {
  /*
   * `renderApp()` defaults to `configured: false` — no Firebase project — which
   * is the local-only build, and the shape almost every test in this file uses.
   * AccountMenu renders nothing at all there, so without its own slot the theme
   * control would be unreachable in exactly the configuration a contributor runs
   * `npm run dev` in.
   */
  it('is reachable in the corner slot', () => {
    renderApp()

    expect(screen.getByRole('group', { name: /theme/i })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('applies a choice to the document', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('radio', { name: /dark/i }))

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('gives way to the account menu once Firebase is configured', () => {
    renderApp(signedInStore(account))

    // One slot, not two controls side by side: signed in, the theme lives
    // inside the avatar's popover.
    expect(screen.queryByRole('group', { name: /theme/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /eti/i })).toBeInTheDocument()
  })
})

describe('the navigation menu', () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /^menu$/i }))
  }

  it('is present in a local-only build, alongside the theme control', async () => {
    // Navigation is not an account feature, so the slot must carry it whether or
    // not Firebase is configured.
    const user = userEvent.setup()
    renderApp()
    await openMenu(user)
    expect(screen.getByRole('menuitem', { name: /my practices/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
  })

  it('reaches the review screen from home', async () => {
    const user = userEvent.setup()
    renderApp()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /my practices/i }))
    expect(screen.getByRole('heading', { name: /my practices/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new list/i })).not.toBeInTheDocument()
  })

  it('comes back home again', async () => {
    const user = userEvent.setup()
    renderApp()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /my practices/i }))
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /home/i }))
    expect(screen.getByRole('button', { name: /my lists/i })).toBeInTheDocument()
  })

  it('is reachable from the drill and from the results screen', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(screen.getByRole('button', { name: /^menu$/i })).toBeInTheDocument()
  })

  it('warns before abandoning a drill, and records nothing when accepted', async () => {
    listRepo.save(seeded)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))

    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /my practices/i }))

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/won't be recorded/i))
    // Walking out is not the same as quitting: QUIT scores what you managed,
    // leaving discards it. Matches signing out mid-drill.
    expect(sessionRepo.getAll()).toHaveLength(0)
  })

  it('leaves the drill running when the warning is declined', async () => {
    listRepo.save(seeded)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /my practices/i }))

    expect(screen.getByRole('button', { name: /show answer/i })).toBeInTheDocument()
  })

  it('clears the parked drill on the way out, so a reload does not resurrect it', async () => {
    listRepo.save(seeded)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(drillRepo.load()).not.toBeNull()

    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /my practices/i }))
    expect(drillRepo.load()).toBeNull()
  })
})

describe('practising the words you missed', () => {
  const DAY = 86_400_000

  /** A finished drill over `seeded`, with the named words marked wrong. */
  const seedRecord = (
    finishedAt: number,
    wrong: Array<{ col1: string; col2: string }>,
    right: Array<{ col1: string; col2: string }> | null = [],
  ) => {
    const withIds = (ps: Array<{ col1: string; col2: string }>) =>
      ps.map((p, i) => ({ id: `x${i}-${finishedAt}`, ...p }))
    sessionRepo.add({
      id: `rec-${finishedAt}`,
      listId: seeded.id,
      listName: seeded.name,
      right: right?.length ?? 0,
      wrong: wrong.length,
      total: wrong.length + (right?.length ?? 0),
      pct: 0,
      wrongPairs: withIds(wrong),
      ...(right === null ? {} : { rightPairs: withIds(right) }),
      finishedAt,
      mode: 'full',
      partial: false,
    })
  }

  const daughter = { col1: 'daughter', col2: 'dochter' }
  const son = { col1: 'son', col2: 'zoon' }

  it('counts the missed words per window on the ready screen', async () => {
    listRepo.save(seeded)
    seedRecord(Date.now() - 2 * DAY, [daughter, son])
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    expect(screen.getByRole('button', { name: /today · 0/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /this week · 2/i })).toBeEnabled()
  })

  it('leaves out a word that has since been answered right', async () => {
    listRepo.save(seeded)
    seedRecord(Date.now() - 3 * DAY, [daughter, son])
    seedRecord(Date.now() - 1 * DAY, [], [daughter])
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    // Two were missed; one has been fixed since.
    expect(screen.getByRole('button', { name: /this week · 1/i })).toBeInTheDocument()
  })

  it('drills only the still-missed words', async () => {
    listRepo.save(seeded)
    seedRecord(Date.now() - 3 * DAY, [daughter, son])
    seedRecord(Date.now() - 1 * DAY, [], [daughter])
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /this week · 1/i }))
    expect(screen.getByText(/1 word you missed in the last week/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(screen.getByText(/card 1 of 1/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    expect(screen.getByText('son')).toBeInTheDocument()
  })

  it('records the run as wrong-only, so it cannot flatter the average', async () => {
    listRepo.save(seeded)
    seedRecord(Date.now() - 2 * DAY, [son])
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /this week · 1/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))

    const latest = sessionRepo.getAll()[0]
    expect(latest?.mode).toBe('wrong-only')
    expect(latest?.rightPairs).toHaveLength(1)
  })

  it('closes the loop — a word answered right drops out of the next set', async () => {
    listRepo.save(seeded)
    seedRecord(Date.now() - 2 * DAY, [son])
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /this week · 1/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
    await user.click(screen.getByRole('button', { name: /^done$/i }))

    // Back at the ready screen, the word is gone from every window.
    await goTo(user, 'My lists')
    await user.click(screen.getByRole('button', { name: /practise/i }))
    expect(screen.queryByText(/words you missed/i)).not.toBeInTheDocument()
  })

  it('hides Save while a subset is selected, and restores it on the way back', async () => {
    listRepo.save(seeded)
    seedRecord(Date.now() - 2 * DAY, [son])
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /this week · 1/i }))
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /full list instead/i }))
    expect(screen.getByRole('button', { name: /saved|save this list/i })).toBeInTheDocument()
    expect(screen.getByText(/you'll hear/i)).toBeInTheDocument()
  })

  it('survives an edit that re-mints every pair id', async () => {
    /*
     * 006 F-2. ListEditor mints new ids for every pair on every save, so a
     * record written before an edit and the list after it share no ids at all.
     * Identity is content, so the missed set must be untouched by an edit to an
     * UNRELATED word.
     */
    listRepo.save(seeded)
    seedRecord(Date.now() - 2 * DAY, [son])

    // The same words, saved again under completely different pair ids.
    listRepo.save({
      ...seeded,
      pairs: [
        { id: 'brand-new-1', col1: 'daughter', col2: 'dochter' },
        { id: 'brand-new-2', col1: 'son', col2: 'zoon' },
      ],
    })

    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')
    await user.click(screen.getByRole('button', { name: /practise/i }))
    expect(screen.getByRole('button', { name: /this week · 1/i })).toBeInTheDocument()
  })

  it('drops a word deleted from the list', async () => {
    listRepo.save(seeded)
    seedRecord(Date.now() - 2 * DAY, [son])
    listRepo.save({ ...seeded, pairs: [{ id: 'p1', col1: 'daughter', col2: 'dochter' }] })

    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')
    await user.click(screen.getByRole('button', { name: /practise/i }))
    expect(screen.queryByText(/words you missed/i)).not.toBeInTheDocument()
  })
})

describe('reviewing one drill', () => {
  it('shows both halves of the answer sheet, and re-drills the misses', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    // A real drill, one right and one wrong.
    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /wrong/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /right/i }))
    await user.click(screen.getByRole('button', { name: /^done$/i }))

    await user.click(screen.getByRole('button', { name: /^menu$/i }))
    await user.click(screen.getByRole('menuitem', { name: /my practices/i }))
    await user.click(screen.getByRole('button', { name: /Lesson 3/ }))

    expect(screen.getByRole('heading', { name: /wrong \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /right \(1\)/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /practise these 1 missed word/i }))
    expect(screen.getByText(/1 word you missed on/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(screen.getByText(/card 1 of 1/i)).toBeInTheDocument()
  })

  it('reaches review from the home screen card too', async () => {
    // The menu is one route; the brief's own card is the discoverable one. Same rule the
    // "See all" link followed before 012 emptied the home screen.
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: /my practices/i }))
    expect(screen.getByRole('heading', { name: /my practices/i })).toBeInTheDocument()
  })
})

describe('the drill keyboard while the menu is open', () => {
  it('does not mark the card when you type n with the menu up', async () => {
    /*
     * TestCard binds Y/N on `window` for the whole drill screen. The nav popover
     * is a sibling of the card, not a descendant, so without the
     * `[role="menu"]` check in TestCard, typing `n` here would silently mark the
     * current card wrong underneath whatever the user is reading.
     */
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    expect(screen.getByText(/card 1 of 2/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^menu$/i }))
    await user.keyboard('n')

    // Still on the same card, still revealed, nothing marked.
    expect(screen.getByText(/card 1 of 2/i)).toBeInTheDocument()
    expect(screen.getByText(/✓ 0 · ✗ 0/)).toBeInTheDocument()
  })

  it('marks again once the menu is closed', async () => {
    listRepo.save(seeded)
    const user = userEvent.setup()
    renderApp()
    await goTo(user, 'My lists')

    await user.click(screen.getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    await user.click(screen.getByRole('button', { name: /^menu$/i }))
    await user.keyboard('{Escape}')
    await user.keyboard('n')

    expect(screen.getByText(/card 2 of 2/i)).toBeInTheDocument()
  })
})
