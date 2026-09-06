import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listRepo } from './storage/listRepo'
import { sessionRepo } from './storage/sessionRepo'
import { testRepo } from './storage/testRepo'
import { renderApp } from './test/renderApp'
import type { SessionRecord, WordList } from './state/types'

/**
 * The test builder, end to end through the real App.
 *
 * The one test that proves 011 D-3 whole: a run over two lists writes one record per
 * list, they share a runId, history shows the run ONCE with the summed score, and the
 * misses reach each list's own missed-words chips. Every unit suite below it can be right
 * while that chain is broken.
 */

const chapter1: WordList = {
  id: 'c1',
  name: 'Chapter 1',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [
    { id: 'a1', col1: 'bread', col2: 'brood' },
    { id: 'a2', col1: 'cheese', col2: 'kaas' },
  ],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

const chapter2: WordList = {
  ...chapter1,
  id: 'c2',
  name: 'Chapter 2',
  pairs: [
    { id: 'b1', col1: 'money', col2: 'geld' },
    { id: 'b2', col1: 'basket', col2: 'mand' },
  ],
}

/** en → fr, so it can never join the other two. */
const paris: WordList = {
  ...chapter1,
  id: 'p1',
  name: 'Paris',
  col2Lang: 'fr',
  pairs: [{ id: 'r1', col1: 'bread', col2: 'pain' }],
}

const records = () => sessionRepo.getAll(null)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const openBuilder = async (user: ReturnType<typeof userEvent.setup>) => {
  renderApp()
  await user.click(await screen.findByRole('button', { name: 'Build a test' }))
}

describe('building a test over several lists', () => {
  it('records one entry per list, sharing a run, and shows the run once', async () => {
    listRepo.save(chapter1)
    listRepo.save(chapter2)
    const user = userEvent.setup()
    await openBuilder(user)

    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: /chapter 2/i }))
    // All four words, so both lists are certain to be reached.
    await user.click(screen.getByRole('button', { name: 'All 4' }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))

    // Answer every card: three right, one wrong.
    for (const result of [/^right/i, /^right/i, /^right/i, /^wrong/i]) {
      await user.click(screen.getByRole('button', { name: /show answer/i }))
      await user.click(screen.getByRole('button', { name: result }))
    }

    await waitFor(() => expect(records()).toHaveLength(2))
    const written = records()
    expect(written.map((r) => r.listId).sort()).toEqual(['c1', 'c2'])
    // One run, so one runId, shared.
    expect(new Set(written.map((r) => r.runId)).size).toBe(1)
    expect(written[0]!.runId).toBeTruthy()
    // Between them they cover the whole run — 3 right of 4.
    expect(written.reduce((n, r) => n + r.right, 0)).toBe(3)
    expect(written.reduce((n, r) => n + r.total, 0)).toBe(4)

    await user.click(screen.getByRole('button', { name: /done/i }))

    // ONE row in Recent practice, with the run's own score, not one list's share.
    const history = within(await screen.findByRole('list', { name: /recent practice/i }))
    expect(history.getAllByRole('listitem')).toHaveLength(1)
    expect(history.getByText(/2 lists/)).toBeInTheDocument()
    expect(history.getByText(/3 \/ 4 \(75%\)/)).toBeInTheDocument()
  })

  it('sends each miss back to the list it came from', async () => {
    listRepo.save(chapter1)
    listRepo.save(chapter2)
    const user = userEvent.setup()
    await openBuilder(user)

    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: /chapter 2/i }))
    await user.click(screen.getByRole('button', { name: 'All 4' }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))

    // Miss everything, so both lists have something to show.
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: /show answer/i }))
      await user.click(screen.getByRole('button', { name: /^wrong/i }))
    }
    await waitFor(() => expect(records()).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: /done/i }))

    // The ready screen for ONE of the lists now offers its own two misses.
    const firstList = (await screen.findByText('Chapter 1')).closest('li')!
    await user.click(within(firstList).getByRole('button', { name: /practise/i }))
    expect(await screen.findByRole('button', { name: /All time · 2/i })).toBeInTheDocument()
  })
})

describe('a test you keep', () => {
  it('saves, lists, and runs again from the home screen', async () => {
    listRepo.save(chapter1)
    listRepo.save(chapter2)
    vi.spyOn(window, 'prompt').mockReturnValue('Weak verbs')
    const user = userEvent.setup()
    await openBuilder(user)

    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: /chapter 2/i }))
    await user.click(screen.getByRole('button', { name: 'All 4' }))
    await user.click(screen.getByRole('button', { name: /save this test/i }))

    await waitFor(() => expect(testRepo.getAll()).toHaveLength(1))
    const saved = testRepo.getAll()[0]!
    expect(saved.name).toBe('Weak verbs')
    // Uncapped, so it keeps meaning "all of them" as the lists grow (011 D-10).
    expect(saved.count).toBeNull()
    expect(saved.spec).toEqual({ listIds: ['c1', 'c2'], source: 'all' })

    // It is on the home screen, described, and counted against today's lists.
    expect(await screen.findByText('Weak verbs')).toBeInTheDocument()
    expect(screen.getByText(/2 lists · all words · all 4/i)).toBeInTheDocument()

    // And it runs.
    const row = screen.getByText('Weak verbs').closest('li')!
    await user.click(within(row).getByRole('button', { name: /^test$/i }))
    expect(await screen.findByRole('button', { name: /show answer/i })).toBeInTheDocument()
  })

  it('keeps a saved test whose list has since been deleted, and says so', async () => {
    listRepo.save(chapter1)
    testRepo.save({
      id: 't1',
      name: 'Gone',
      spec: { listIds: ['deleted'], source: 'all' },
      count: null,
      createdAt: 1,
      updatedAt: 1,
    })
    renderApp()

    expect(await screen.findByText(/no lists left/i)).toBeInTheDocument()
    const row = screen.getByText('Gone').closest('li')!
    expect(within(row).getByRole('button', { name: /^test$/i })).toBeDisabled()
    // Never auto-deleted, so it is still there to clear out deliberately.
    expect(within(row).getByRole('button', { name: /delete/i })).toBeEnabled()
  })
})

describe('a capped test', () => {
  it('draws only as many words as asked, and offers another draw of the same size', async () => {
    listRepo.save(chapter1)
    listRepo.save(chapter2)
    const user = userEvent.setup()
    await openBuilder(user)

    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: /chapter 2/i }))
    const box = screen.getByRole('spinbutton')
    await user.clear(box)
    await user.type(box, '2')
    await user.click(screen.getByRole('button', { name: /^test$/i }))

    // Two of the four.
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('button', { name: /show answer/i }))
      await user.click(screen.getByRole('button', { name: /^right/i }))
    }

    expect(await screen.findByRole('button', { name: /another 2, freshly drawn/i }))
      .toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /another 2, freshly drawn/i }))
    expect(await screen.findByRole('button', { name: /show answer/i })).toBeInTheDocument()
  })

  it('offers no fresh draw when the draw already covers the pool', async () => {
    listRepo.save(chapter1)
    const user = userEvent.setup()
    await openBuilder(user)

    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    await user.click(screen.getByRole('button', { name: 'All 2' }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('button', { name: /show answer/i }))
      await user.click(screen.getByRole('button', { name: /^right/i }))
    }
    expect(screen.queryByRole('button', { name: /freshly drawn/i })).not.toBeInTheDocument()
  })
})

describe('what the builder refuses', () => {
  it('will not mix language pairs', async () => {
    listRepo.save(chapter1)
    listRepo.save(paris)
    const user = userEvent.setup()
    await openBuilder(user)

    await user.click(screen.getByRole('button', { name: /chapter 1/i }))
    const french = screen.getByRole('button', { name: /paris/i })
    expect(french).toBeDisabled()
    expect(french).toHaveTextContent(/one language pair/i)
  })

  it('cannot start with nothing selected', async () => {
    listRepo.save(chapter1)
    const user = userEvent.setup()
    await openBuilder(user)
    expect(screen.getByRole('button', { name: /^test$/i })).toBeDisabled()
  })
})

describe('a plain list drill is unchanged (011 D-9)', () => {
  it('still writes exactly one record, with no runId at all', async () => {
    listRepo.save(chapter1)
    const user = userEvent.setup()
    renderApp()

    const row = (await screen.findByText('Chapter 1')).closest('li')!
    await user.click(within(row).getByRole('button', { name: /practise/i }))
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('button', { name: /show answer/i }))
      await user.click(screen.getByRole('button', { name: /^right/i }))
    }

    await waitFor(() => expect(records()).toHaveLength(1))
    const record: SessionRecord = records()[0]!
    expect(record.listId).toBe('c1')
    // Absent, not undefined: what a drill stores has not changed by one key.
    expect('runId' in record).toBe(false)
  })
})
