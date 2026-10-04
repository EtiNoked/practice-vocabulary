import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listRepo } from './storage/listRepo'
import { testRepo } from './storage/testRepo'
import { renderApp } from './test/renderApp'
import { goTo } from './test/navigate'
import type { SavedTest } from './state/testPlan'
import type { WordList } from './state/types'

/**
 * Renaming and deleting, through the real App.
 *
 * `SavedLists` and `SavedTests` already prove that the buttons call back; what had never
 * been exercised is what `App` does WITH those callbacks — the prompt, the confirmation
 * question, the guard on a blank name, and the toast when the write does not land. Those
 * handlers are four of the five places `writeFailureMessage` is reached from, and before
 * this file no test had ever put a toast on screen at all.
 *
 * Guest, local-storage build throughout: these are the plainest possible lists, and the
 * owner-of-a-shared-list question lives in `App.sharing.test.tsx` where the share store
 * is already stood up.
 */

const lesson3: WordList = {
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
  updatedAt: 2,
  origin: 'manual',
}

/** A second list, so every test can also say what was LEFT ALONE. */
const chapter4: WordList = {
  ...lesson3,
  id: 'other',
  name: 'Chapter 4',
  pairs: [{ id: 'q1', col1: 'bread', col2: 'brood' }],
  updatedAt: 1,
}

const weakVerbs: SavedTest = {
  id: 't1',
  name: 'Weak verbs',
  spec: { listIds: ['seed'], source: 'all' },
  count: null,
  createdAt: 1,
  updatedAt: 1,
}

const row = (name: string) => within(screen.getByText(name).closest('li')!)

const openLists = async (user: ReturnType<typeof userEvent.setup>) => {
  renderApp()
  await goTo(user, 'My lists')
}

const openTests = async (user: ReturnType<typeof userEvent.setup>) => {
  renderApp()
  await goTo(user, 'My tests')
}

/**
 * A device that will not accept a write. Private-mode Safari throws here, as does a full
 * quota; `listRepo` and `testRepo` both turn it into a `WriteResult`, which is what `App`
 * renders a toast from.
 *
 * Installed AFTER the app has rendered, so the seeded lists are read back normally and
 * only the write under test fails.
 */
const refuseWrites = () =>
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError')
  })

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('renaming a list', () => {
  it('offers the name it has now, and renames it in place', async () => {
    listRepo.save(lesson3)
    listRepo.save(chapter4)
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Lesson 3 - verbs')
    const user = userEvent.setup()
    await openLists(user)

    await user.click(row('Lesson 3').getByRole('button', { name: 'Rename' }))

    // Seeded with the current name: correcting a typo is an edit, not a retype.
    expect(prompt).toHaveBeenCalledWith('New name', 'Lesson 3')
    expect(await screen.findByText('Lesson 3 - verbs')).toBeInTheDocument()
    expect(listRepo.getById('seed')!.name).toBe('Lesson 3 - verbs')

    // The other list is untouched, and nothing went wrong, so nothing is announced.
    expect(screen.getByText('Chapter 4')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the words, and only changes what the list is called', async () => {
    listRepo.save(lesson3)
    vi.spyOn(window, 'prompt').mockReturnValue('Lesson 3 - verbs')
    const user = userEvent.setup()
    await openLists(user)

    await user.click(row('Lesson 3').getByRole('button', { name: 'Rename' }))

    await waitFor(() => expect(listRepo.getById('seed')!.name).toBe('Lesson 3 - verbs'))
    expect(listRepo.getById('seed')!.pairs).toEqual(lesson3.pairs)
  })

  it('does nothing at all when the prompt is dismissed', async () => {
    listRepo.save(lesson3)
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    // Asserted on the repo rather than on the screen: "the name did not change" is also
    // what a rename that simply has not re-rendered yet looks like.
    const rename = vi.spyOn(listRepo, 'rename')
    const user = userEvent.setup()
    await openLists(user)

    await user.click(row('Lesson 3').getByRole('button', { name: 'Rename' }))

    expect(rename).not.toHaveBeenCalled()
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
  })

  /*
   * A list called "" is unfindable and unnameable — there is nothing on the row to tap
   * Rename next to. Refusing is better than accepting and then having to explain it.
   */
  it.each([
    ['empty', ''],
    ['nothing but spaces', '   '],
  ])('refuses a name that is %s', async (_label, value) => {
    listRepo.save(lesson3)
    vi.spyOn(window, 'prompt').mockReturnValue(value)
    const rename = vi.spyOn(listRepo, 'rename')
    const user = userEvent.setup()
    await openLists(user)

    await user.click(row('Lesson 3').getByRole('button', { name: 'Rename' }))

    expect(rename).not.toHaveBeenCalled()
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
  })

  it('trims the name it is given', async () => {
    listRepo.save(lesson3)
    vi.spyOn(window, 'prompt').mockReturnValue('  Lesson 4  ')
    const user = userEvent.setup()
    await openLists(user)

    await user.click(row('Lesson 3').getByRole('button', { name: 'Rename' }))

    await waitFor(() => expect(listRepo.getById('seed')!.name).toBe('Lesson 4'))
  })
})

describe('deleting a list', () => {
  it('asks by name, then removes it and leaves the rest alone', async () => {
    listRepo.save(lesson3)
    listRepo.save(chapter4)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    await openLists(user)

    await user.click(row('Lesson 3').getByRole('button', { name: 'Delete' }))

    expect(confirm).toHaveBeenCalledWith('Delete “Lesson 3”?')
    await waitFor(() => expect(screen.queryByText('Lesson 3')).not.toBeInTheDocument())
    expect(listRepo.getById('seed')).toBeNull()

    expect(screen.getByText('Chapter 4')).toBeInTheDocument()
    expect(listRepo.getById('other')).not.toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the list when the question is declined', async () => {
    listRepo.save(lesson3)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const remove = vi.spyOn(listRepo, 'remove')
    const user = userEvent.setup()
    await openLists(user)

    await user.click(row('Lesson 3').getByRole('button', { name: 'Delete' }))

    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
  })

  // The empty state is the screen's, not this handler's — but deleting the last list is
  // the one path that reaches it from a populated screen.
  it('lands on the empty state after the last list goes', async () => {
    listRepo.save(lesson3)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    await openLists(user)

    await user.click(row('Lesson 3').getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/no saved lists yet/i)).toBeInTheDocument()
  })
})

describe('renaming and deleting a saved test', () => {
  it('offers the name it has now, and renames it in place', async () => {
    listRepo.save(lesson3)
    testRepo.save(weakVerbs)
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Verbs I keep missing')
    const user = userEvent.setup()
    await openTests(user)

    await user.click(row('Weak verbs').getByRole('button', { name: 'Rename' }))

    expect(prompt).toHaveBeenCalledWith('New name', 'Weak verbs')
    expect(await screen.findByText('Verbs I keep missing')).toBeInTheDocument()
    expect(testRepo.getAll()[0]!.name).toBe('Verbs I keep missing')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /*
   * A saved test is a definition, not a snapshot (011 D-5). Renaming must not quietly
   * re-draw what it selects, or "my weak verbs" would stop meaning what it meant.
   */
  it('changes the name and nothing else about what the test does', async () => {
    listRepo.save(lesson3)
    testRepo.save(weakVerbs)
    vi.spyOn(window, 'prompt').mockReturnValue('Verbs I keep missing')
    const user = userEvent.setup()
    await openTests(user)

    await user.click(row('Weak verbs').getByRole('button', { name: 'Rename' }))

    await waitFor(() => expect(testRepo.getAll()[0]!.name).toBe('Verbs I keep missing'))
    const saved = testRepo.getAll()[0]!
    expect(saved.spec).toEqual(weakVerbs.spec)
    expect(saved.count).toBe(weakVerbs.count)
    expect(saved.createdAt).toBe(weakVerbs.createdAt)
  })

  it.each([
    ['dismissed', null],
    ['left empty', ''],
    ['nothing but spaces', '   '],
  ])('does nothing when the prompt is %s', async (_label, value) => {
    listRepo.save(lesson3)
    testRepo.save(weakVerbs)
    vi.spyOn(window, 'prompt').mockReturnValue(value)
    const save = vi.spyOn(testRepo, 'save')
    const user = userEvent.setup()
    await openTests(user)

    await user.click(row('Weak verbs').getByRole('button', { name: 'Rename' }))

    expect(save).not.toHaveBeenCalled()
    expect(screen.getByText('Weak verbs')).toBeInTheDocument()
  })

  it('asks by name, then deletes it', async () => {
    listRepo.save(lesson3)
    testRepo.save(weakVerbs)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    await openTests(user)

    await user.click(row('Weak verbs').getByRole('button', { name: 'Delete' }))

    expect(confirm).toHaveBeenCalledWith('Delete “Weak verbs”?')
    await waitFor(() => expect(testRepo.getAll()).toHaveLength(0))
    expect(screen.queryByText('Weak verbs')).not.toBeInTheDocument()
  })

  it('keeps it when the question is declined', async () => {
    listRepo.save(lesson3)
    testRepo.save(weakVerbs)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const remove = vi.spyOn(testRepo, 'remove')
    const user = userEvent.setup()
    await openTests(user)

    await user.click(row('Weak verbs').getByRole('button', { name: 'Delete' }))

    expect(remove).not.toHaveBeenCalled()
    expect(testRepo.getAll()).toHaveLength(1)
  })

  /*
   * A test whose lists are all gone is never repaired and never auto-removed (011 FR-17),
   * so Delete is the only way out of it. `App.test-builder.test.tsx` proves the button is
   * enabled; this proves it works, which is the part that matters to someone stuck with
   * a row they cannot run.
   */
  it('deletes a test that can no longer run', async () => {
    testRepo.save({ ...weakVerbs, name: 'Gone', spec: { listIds: ['deleted'], source: 'all' } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    await openTests(user)

    await user.click(row('Gone').getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(testRepo.getAll()).toHaveLength(0))
    expect(await screen.findByText(/no saved tests yet/i)).toBeInTheDocument()
  })
})

/**
 * The toast.
 *
 * Its rule, inherited from v1 and written down in `storage/messages.ts`, is that a failed
 * write must never read as "your list is gone" — so each of these asserts both halves:
 * the app says the change did not land, AND the thing it was about is still there and
 * still usable. `storage/messages.test.ts` pins the wording; these pin that the right
 * failure reaches the alert at all.
 */
describe('when the device will not accept the write', () => {
  it('says a rename did not land, and keeps the list practisable', async () => {
    listRepo.save(lesson3)
    vi.spyOn(window, 'prompt').mockReturnValue('Lesson 4')
    const user = userEvent.setup()
    await openLists(user)
    refuseWrites()

    await user.click(row('Lesson 3').getByRole('button', { name: 'Rename' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/storage is full/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/still practice/i)
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
    expect(row('Lesson 3').getByRole('button', { name: 'Practice' })).toBeEnabled()
  })

  it('says a delete did not land, and leaves the list where it was', async () => {
    listRepo.save(lesson3)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    await openLists(user)
    refuseWrites()

    await user.click(row('Lesson 3').getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/storage is full/i)
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
  })

  it('says a saved test could not be deleted', async () => {
    listRepo.save(lesson3)
    testRepo.save(weakVerbs)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    await openTests(user)
    refuseWrites()

    await user.click(row('Weak verbs').getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/storage is full/i)
    expect(screen.getByText('Weak verbs')).toBeInTheDocument()
  })

  /*
   * The one reason that is not about storage at all. `removeTest` answers `missing` for a
   * test that is already gone — a second tap on a stale row, or a delete that raced
   * another device — and the message has to stop promising a practice that cannot happen.
   */
  it('says a vanished test is gone rather than offering to practise it', async () => {
    listRepo.save(lesson3)
    testRepo.save(weakVerbs)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(testRepo, 'remove').mockReturnValue({ ok: false, reason: 'missing' })
    const user = userEvent.setup()
    await openTests(user)

    await user.click(row('Weak verbs').getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer exists/i)
    expect(screen.getByRole('alert')).not.toHaveTextContent(/still practice/i)
  })
})
