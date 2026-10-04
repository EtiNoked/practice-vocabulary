import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ListEditor } from './ListEditor'
import { cell } from '../test/cells'

const setup = (props: Partial<Parameters<typeof ListEditor>[0]> = {}) => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ListEditor
      mode="create"
      initialRows={[{ col1: '', col2: '' }]}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onConfirm, onCancel, user: userEvent.setup() }
}

const cells = () => screen.getAllByRole('textbox').filter((el) => el.dataset.cell !== undefined)

/**
 * The word you practise comes first (017).
 *
 * Every assertion here is about ORDER, which is the one thing the rest of this suite
 * deliberately does not look at — `cell(row, field)` exists precisely so that it cannot.
 * So order is pinned once, here, and nowhere else.
 *
 * What is NOT asserted, because none of it moves: `col2` is still the word that is spoken,
 * tested and sorted by, and `col1` is still its meaning. This feature flips where the two
 * are DRAWN and nothing else.
 */
describe('column order', () => {
  const drawn = () => [...document.querySelectorAll<HTMLInputElement>('[data-cell]')]

  it('draws the spoken word first and its meaning second', () => {
    setup()
    expect(drawn().slice(0, 2).map((el) => el.dataset.cell)).toEqual(['col2', 'col1'])
  })

  it('names the two boxes by what they hold rather than by where they sit', () => {
    setup()
    expect(screen.getByLabelText('Row 1 word').dataset.cell).toBe('col2')
    expect(screen.getByLabelText('Row 1 meaning').dataset.cell).toBe('col1')
  })

  it('heads the first column with the word and the second with its meaning', () => {
    setup()
    const word = screen.getByText('Word — spoken aloud')
    const meaning = screen.getByText('Meaning — the answer')
    // Node.DOCUMENT_POSITION_FOLLOWING === 4: `meaning` comes after `word`.
    expect(word.compareDocumentPosition(meaning) & 4).toBeTruthy()
  })

  it('reads the badge word-first', () => {
    setup({ initialLangs: { col1: 'en', col2: 'nl' }, initialLangSource: 'header' })
    expect(screen.getByText(/Dutch → English/)).toBeInTheDocument()
    expect(screen.queryByText(/English → Dutch/)).not.toBeInTheDocument()
  })

  it('offers the word language before the meaning language', () => {
    setup({ initialLangs: { col1: 'en', col2: 'nl' }, initialLangSource: 'header' })
    const word = screen.getByLabelText('Word language') as HTMLSelectElement
    const meaning = screen.getByLabelText('Meaning language') as HTMLSelectElement
    expect(word.value).toBe('nl')
    expect(meaning.value).toBe('en')
    expect(word.compareDocumentPosition(meaning) & 4).toBeTruthy()
  })

  /*
   * The whole point of the feature, stated once end to end: what you type FIRST is what the
   * drill will speak. `col2` is the field the drill speaks (StudyCard, TestCard, GameCloud),
   * so this asserts the first box lands there.
   */
  it('saves what was typed first as the word that gets spoken', async () => {
    const { user, onConfirm } = setup()
    await user.type(drawn()[0]!, 'dochter')
    await user.type(drawn()[1]!, 'daughter')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onConfirm.mock.calls[0]![0].pairs[0]).toMatchObject({ col2: 'dochter', col1: 'daughter' })
  })

  it('opens a list saved before the flip with its spoken word on the left', () => {
    setup({
      mode: 'update',
      listId: 'x',
      initialName: 'Lesson 3',
      initialRows: [{ col1: 'daughter', col2: 'dochter' }],
      initialLangs: { col1: 'en', col2: 'nl' },
      initialLangSource: 'header',
    })
    expect(drawn()[0]!.value).toBe('dochter')
    expect(drawn()[1]!.value).toBe('daughter')
  })

  it('still swaps contents and languages together', async () => {
    const { user } = setup({
      initialRows: [{ col1: 'daughter', col2: 'dochter' }],
      initialLangs: { col1: 'en', col2: 'nl' },
      initialLangSource: 'header',
    })
    await user.click(screen.getByRole('button', { name: 'Swap columns ⇄' }))
    // The left box still holds whatever col2 holds, and col2 now holds the English.
    expect(drawn()[0]!.value).toBe('daughter')
    expect((screen.getByLabelText('Word language') as HTMLSelectElement).value).toBe('en')
    expect((screen.getByLabelText('Meaning language') as HTMLSelectElement).value).toBe('nl')
  })
})

describe('typing pairs', () => {
  it('starts with one empty row', () => {
    setup()
    expect(cells()).toHaveLength(2)
  })

  // No "add row" ceremony in the common case.
  it('auto-appends a new row when the last row is filled in', async () => {
    const { user } = setup()
    await user.type(cell(0, 'col1'), 'daughter')
    await user.type(cell(0, 'col2'), 'dochter')
    expect(cells().length).toBeGreaterThan(2)
  })

  it('deletes a row', async () => {
    const { user } = setup({
      initialRows: [
        { col1: 'daughter', col2: 'dochter' },
        { col1: 'son', col2: 'zoon' },
      ],
    })
    await user.click(screen.getAllByRole('button', { name: /delete row/i })[0]!)
    expect(screen.queryByDisplayValue('daughter')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('zoon')).toBeInTheDocument()
  })

  it('adds a row on demand', async () => {
    const { user } = setup()
    const before = cells().length
    await user.click(screen.getByRole('button', { name: /add row/i }))
    expect(cells()).toHaveLength(before + 2)
  })

  it('shows how many complete pairs there are', async () => {
    setup({
      initialRows: [
        { col1: 'daughter', col2: 'dochter' },
        { col1: 'son', col2: '' },
      ],
    })
    expect(screen.getByText(/1 complete pair/i)).toBeInTheDocument()
  })
})

describe('guards', () => {
  it('disables start until there is at least one complete pair', async () => {
    const { user } = setup()
    const start = screen.getByRole('button', { name: /^save$/i })
    expect(start).toBeDisabled()
    await user.type(cell(0, 'col1'), 'daughter')
    await user.type(cell(0, 'col2'), 'dochter')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled()
  })

  it('flags a row with only one side filled', () => {
    setup({ initialRows: [{ col1: 'daughter', col2: '' }] })
    expect(screen.getByText(/incomplete/i)).toBeInTheDocument()
  })

  it('confirms before discarding unsaved changes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user, onCancel } = setup()
    await user.type(cell(0, 'col1'), 'x')
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('cancels without confirming when nothing was changed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const { user, onCancel } = setup()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

describe('language detection badge', () => {
  it('shows a confident badge when a header row named the languages', async () => {
    const { user } = setup({
      initialRows: [
        { col1: 'English', col2: 'Dutch' },
        { col1: 'daughter', col2: 'dochter' },
      ],
    })
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(screen.queryByText(/guessed/i)).not.toBeInTheDocument()
  })

  it('marks a heuristic result as guessed, so a wrong call is visible', () => {
    setup({
      initialRows: [
        { col1: 'daughter', col2: 'dochter' },
        { col1: 'to die', col2: 'doodgaan' },
      ],
    })
    expect(screen.getByText(/guessed/i)).toBeInTheDocument()
  })
})

describe('confirming', () => {
  it('emits only the complete pairs', async () => {
    const { user, onConfirm } = setup({
      initialRows: [
        { col1: 'daughter', col2: 'dochter' },
        { col1: 'son', col2: '' },
      ],
    })
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    const list = onConfirm.mock.calls[0]![0]
    expect(list.pairs).toHaveLength(1)
    expect(list.pairs[0]).toMatchObject({ col1: 'daughter', col2: 'dochter' })
  })

  // Re-detecting on save is what makes typing a header row a working correction.
  it('re-runs language detection on save, so a typed header fixes a bad guess', async () => {
    const { user, onConfirm } = setup({
      initialRows: [
        { col1: 'English', col2: 'Dutch' },
        { col1: 'aaa', col2: 'bbb' },
      ],
    })
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    const list = onConfirm.mock.calls[0]![0]
    expect(list.langSource).toBe('header')
    expect(list.col1Lang).toBe('en')
    expect(list.col2Lang).toBe('nl')
    expect(list.pairs).toHaveLength(1)
  })
})

describe('language selectors', () => {
  // Named for the FIELD each one writes, not for where it sits — the meaning selector is
  // drawn second since 017, and these names have to survive that.
  const col1Select = () => screen.getByLabelText(/meaning language/i) as HTMLSelectElement
  const col2Select = () => screen.getByLabelText(/word language/i) as HTMLSelectElement

  const NL_FR = [
    { col1: 'de deur', col2: 'la porte' },
    { col1: 'het raam', col2: 'la fenêtre' },
    { col1: 'de zomer', col2: "l'été" },
  ]

  it('offers every language in the table on both selectors', () => {
    setup()
    for (const select of [col1Select(), col2Select()]) {
      const options = [...select.options].map((o) => o.textContent)
      expect(options).toEqual(expect.arrayContaining(['English', 'Dutch', 'French']))
    }
  })

  it('prefills from detection', () => {
    setup({ initialRows: NL_FR })
    expect(col1Select().value).toBe('nl')
    expect(col2Select().value).toBe('fr')
  })

  it('follows detection while the user has not chosen', async () => {
    const { user } = setup()
    await user.type(cell(0, 'col1'), 'de deur')
    await user.type(cell(0, 'col2'), 'la fenêtre')
    expect(col1Select().value).toBe('nl')
  })

  it('turns the badge authoritative once the user chooses', async () => {
    const { user } = setup({ initialRows: NL_FR })
    expect(screen.getByText(/guessed/i)).toBeInTheDocument()
    await user.selectOptions(col2Select(), 'en')
    expect(screen.queryByText(/guessed/i)).not.toBeInTheDocument()
  })

  /**
   * The pinning test. Detection re-runs on every keystroke, so without an override
   * that outranks it the user's choice is undone by their next edit.
   */
  it('does not let a later row edit revert the chosen language', async () => {
    const { user } = setup({ initialRows: NL_FR })
    await user.selectOptions(col2Select(), 'en')
    await user.type(cell(0, 'col1'), ' extra')
    expect(col2Select().value).toBe('en')
  })

  it('writes the chosen languages and a manual source on save', async () => {
    const { user, onConfirm } = setup({ initialRows: NL_FR })
    await user.selectOptions(col1Select(), 'fr')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    const list = onConfirm.mock.calls[0]![0]
    expect(list.langSource).toBe('manual')
    expect(list.col1Lang).toBe('fr')
  })

  /*
   * The reverse of what this asserted before.
   *
   * It used to EXCHANGE the two columns when you picked the language the other already
   * held, reading that as an attempt to swap. A word-and-explanation list is one language
   * on both sides, so that reading now blocks the only way to express it — and swapping
   * is still one tap away on Swap columns, which moves the words with their languages
   * rather than only the labels.
   */
  it('lets both columns hold the same language, for a word and its explanation', async () => {
    const { user } = setup({ initialRows: NL_FR })
    await user.selectOptions(col2Select(), 'nl')
    expect(col1Select().value).toBe('nl')
    expect(col2Select().value).toBe('nl')
  })

  it('still swaps the words along with the languages on Swap columns', async () => {
    const { user } = setup({ initialRows: NL_FR })
    const before = { col1: col1Select().value, col2: col2Select().value }
    await user.click(screen.getByRole('button', { name: /swap columns/i }))
    expect(col1Select().value).toBe(before.col2)
    expect(col2Select().value).toBe(before.col1)
  })

  it('keeps a saved manual choice when the list is reopened', () => {
    render(
      <ListEditor
        mode="update"
        listId="x"
        initialName="Lesson 3"
        initialRows={NL_FR}
        initialLangs={{ col1: 'fr', col2: 'en' }}
        initialLangSource="manual"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(col1Select().value).toBe('fr')
    expect(col2Select().value).toBe('en')
  })

  it('still consumes a header row while the languages are overridden', async () => {
    const { user, onConfirm } = setup({
      initialRows: [
        { col1: 'English', col2: 'Dutch' },
        { col1: 'daughter', col2: 'dochter' },
      ],
    })
    await user.selectOptions(col2Select(), 'fr')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    const list = onConfirm.mock.calls[0]![0]
    // headerConsumed is a question about the ROWS, so overriding the languages
    // must not re-admit the header as a practisable pair.
    expect(list.pairs).toHaveLength(1)
    expect(list.col2Lang).toBe('fr')
  })
})

describe('swapping columns', () => {
  const swap = () => screen.getByRole('button', { name: /swap columns/i })

  it('exchanges the contents and the languages together', async () => {
    const { user, onConfirm } = setup({
      initialRows: [
        { col1: 'daughter', col2: 'dochter' },
        { col1: 'twins', col2: 'tweeling' },
      ],
    })
    await user.click(swap())
    expect((screen.getByLabelText(/meaning language/i) as HTMLSelectElement).value).toBe('nl')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    const list = onConfirm.mock.calls[0]![0]
    expect(list.pairs[0]).toMatchObject({ col1: 'dochter', col2: 'daughter' })
    expect(list.col1Lang).toBe('nl')
    expect(list.col2Lang).toBe('en')
  })

  it('is its own inverse', async () => {
    const { user, onConfirm } = setup({
      initialRows: [{ col1: 'daughter', col2: 'dochter' }],
    })
    await user.click(swap())
    await user.click(swap())
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    const list = onConfirm.mock.calls[0]![0]
    expect(list.pairs[0]).toMatchObject({ col1: 'daughter', col2: 'dochter' })
    expect(list.col1Lang).toBe('en')
    expect(list.col2Lang).toBe('nl')
  })
})

/**
 * A saved list carries languages that its rows can no longer prove. A header row
 * is CONSUMED on save, so reopening that list re-detects from the words alone —
 * and on a list the heuristic cannot call, that is the plain en/nl default.
 *
 * The bug this covers: for a Dutch-first list the default is BACKWARDS, and it
 * arrived silently. Swapping the columns then paired those reversed languages
 * with the swapped rows, update mode saved it on the spot, and the drill went on
 * to label the Dutch word "English" and read it in an English voice.
 */
describe('reopening a saved list', () => {
  // Named for the FIELD each one writes, not for where it sits — the meaning selector is
  // drawn second since 017, and these names have to survive that.
  const col1Select = () => screen.getByLabelText(/meaning language/i) as HTMLSelectElement
  const col2Select = () => screen.getByLabelText(/word language/i) as HTMLSelectElement

  /** Dutch first, English second, and no signal in either — detection defaults. */
  const UNCALLABLE_NL_EN = [
    { col1: 'arm', col2: 'arm' },
    { col1: 'hand', col2: 'hand' },
    { col1: 'vinger', col2: 'finger' },
    { col1: 'knie', col2: 'knee' },
  ]

  const reopen = (props: Partial<Parameters<typeof ListEditor>[0]> = {}) => {
    const onConfirm = vi.fn()
    render(
      <ListEditor
        mode="update"
        listId="x"
        initialName="Lesson 3"
        initialRows={UNCALLABLE_NL_EN}
        initialLangs={{ col1: 'nl', col2: 'en' }}
        initialLangSource="header"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        {...props}
      />,
    )
    return { onConfirm, user: userEvent.setup() }
  }

  it('keeps languages a header row settled, which the rows no longer carry', () => {
    reopen()
    expect(col1Select().value).toBe('nl')
    expect(col2Select().value).toBe('en')
  })

  it('does not save the fallback guess over them', async () => {
    const { user, onConfirm } = reopen()
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    const list = onConfirm.mock.calls[0]![0]
    expect(list.col1Lang).toBe('nl')
    expect(list.col2Lang).toBe('en')
    expect(list.langSource).toBe('header')
  })

  it('swaps a reopened list into languages that match its words', async () => {
    const { user, onConfirm } = reopen()
    await user.click(screen.getByRole('button', { name: /swap columns/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    const list = onConfirm.mock.calls[0]![0]
    // Dutch moved into `col2` — the word column, spoken aloud and drawn first — so the
    // languages have to move with it.
    expect(list.pairs[2]).toMatchObject({ col1: 'finger', col2: 'vinger' })
    expect(list.col1Lang).toBe('en')
    expect(list.col2Lang).toBe('nl')
  })

  // The other half of the rule: editing rows must still be able to correct a
  // guess, so a source at least as strong as the stored one wins.
  it('lets a typed header overrule what a guess was saved as', async () => {
    const { user, onConfirm } = reopen({
      initialLangs: { col1: 'en', col2: 'nl' },
      initialLangSource: 'heuristic',
      initialRows: [{ col1: 'Nederlands', col2: 'Engels' }, ...UNCALLABLE_NL_EN],
    })
    expect(col1Select().value).toBe('nl')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    const list = onConfirm.mock.calls[0]![0]
    expect(list.col1Lang).toBe('nl')
    expect(list.col2Lang).toBe('en')
    expect(list.langSource).toBe('header')
    expect(list.pairs).toHaveLength(4)
  })

  // And the user always outranks both.
  it('still lets the selectors override the stored languages', async () => {
    const { user, onConfirm } = reopen()
    await user.selectOptions(col1Select(), 'fr')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    const list = onConfirm.mock.calls[0]![0]
    expect(list.col1Lang).toBe('fr')
    expect(list.langSource).toBe('manual')
  })
})

describe('modes', () => {
  // Differences between entry points must stay confined to the mode prop.
  it('renders the same controls in create and update mode', () => {
    const { unmount } = render(
      <ListEditor mode="create" initialRows={[{ col1: 'a', col2: 'b' }]} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    const createButtons = screen.getAllByRole('button').map((b) => b.textContent).sort()
    unmount()

    render(
      <ListEditor mode="update" listId="x" initialName="Lesson 3" initialRows={[{ col1: 'a', col2: 'b' }]} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    const updateButtons = screen.getAllByRole('button').map((b) => b.textContent).sort()
    expect(updateButtons).toEqual(createButtons)
  })

  it('shows the existing name in update mode', () => {
    render(
      <ListEditor mode="update" listId="x" initialName="Lesson 3" initialRows={[{ col1: 'a', col2: 'b' }]} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByDisplayValue('Lesson 3')).toBeInTheDocument()
  })
})

describe('paste panel integration', () => {
  it('appends pasted rows rather than replacing typed ones', async () => {
    const { user } = setup({ initialRows: [{ col1: 'daughter', col2: 'dochter' }] })
    await user.click(screen.getByRole('button', { name: /paste|import/i }))
    const box = screen.getByRole('textbox', { name: /paste/i })
    await user.click(box)
    await user.paste('son\tzoon\nuncle\toom')
    await user.click(screen.getByRole('button', { name: /add to list/i }))
    expect(screen.getByDisplayValue('daughter')).toBeInTheDocument()
    expect(screen.getByDisplayValue('zoon')).toBeInTheDocument()
    expect(screen.getByDisplayValue('oom')).toBeInTheDocument()
  })

  /*
   * The whole paste path, end to end, in the order a user sees it (017).
   *
   * This is the test the unit suite could not write: `parseDelimited` decides which field a
   * pasted cell lands in and `detectLanguages` reads a header out of that same row, so the
   * two have to agree about which field is "first". Assert them separately with hand-built
   * rows and they can BOTH be flipped, cancel out, and leave a list labelled backwards with
   * a green suite — which is exactly what happened while 017 was being built, and was caught
   * by opening the app rather than by any test here.
   */
  it('takes the word language from the first cell of a pasted header row', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /paste|import/i }))
    await user.click(screen.getByRole('textbox', { name: /paste/i }))
    await user.paste('Dutch\tEnglish\nzon\tsun\nappel\tapple')
    await user.click(screen.getByRole('button', { name: /add to list/i }))

    expect((screen.getByLabelText('Word language') as HTMLSelectElement).value).toBe('nl')
    expect((screen.getByLabelText('Meaning language') as HTMLSelectElement).value).toBe('en')
    expect(screen.getByText(/Dutch → English/)).toBeInTheDocument()
    // The Dutch is in the first box of its row, not merely labelled Dutch somewhere.
    expect(screen.getByDisplayValue('zon').dataset.cell).toBe('col2')
  })
})

describe('the Save button', () => {
  it('says Save, for a new list and for an edited one', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start practice/i })).not.toBeInTheDocument()
  })
})

describe('duplicate words', () => {
  it('warns when a new word repeats an earlier one in a different case', async () => {
    const { user } = setup({ initialRows: [{ col1: 'bad', col2: 'slecht' }, { col1: '', col2: '' }] })
    await user.type(cell(1, 'col2'), 'Slecht')
    expect(screen.getByText('Duplicate: “Slecht” is already in row 1.')).toBeInTheDocument()
    expect(screen.getByText(/1 duplicate$/)).toBeInTheDocument()
  })

  it('clears the warning once the word is changed', async () => {
    const { user } = setup({ initialRows: [{ col1: 'bad', col2: 'slecht' }, { col1: 'evil', col2: 'SLECHT' }] })
    expect(screen.getByText(/Duplicate:/)).toBeInTheDocument()
    await user.clear(cell(1, 'col2'))
    await user.type(cell(1, 'col2'), 'kwaad')
    expect(screen.queryByText(/Duplicate:/)).not.toBeInTheDocument()
  })

  it('says nothing when only the meaning repeats, which two words may fairly share', () => {
    setup({
      initialRows: [
        { col1: 'bad', col2: 'slecht' },
        { col1: 'Bad', col2: 'kwaad' },
      ],
    })
    expect(screen.queryByText(/Duplicate:/)).not.toBeInTheDocument()
  })

  it('warns but still lets the list be saved, duplicates included', async () => {
    const { user, onConfirm } = setup({
      initialRows: [
        { col1: 'bad', col2: 'slecht' },
        { col1: 'evil', col2: 'Slecht' },
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onConfirm.mock.calls[0]![0].pairs).toHaveLength(2)
  })

  it('does not count a header row naming the languages', () => {
    setup({
      initialRows: [
        { col1: 'English', col2: 'Dutch' },
        { col1: 'hello', col2: 'dutch' },
      ],
    })
    expect(screen.queryByText(/Duplicate:/)).not.toBeInTheDocument()
  })
})

describe('sorting the words A to Z', () => {
  const spoken = () => cells().filter((c) => c.dataset.cell === 'col2').map((c) => (c as HTMLInputElement).value)

  it('sorts by the word column, read aloud and drawn first, on request and only then, keeping pairs together', async () => {
    const { user } = setup({
      initialRows: [
        { col1: 'sun', col2: 'zon' },
        { col1: 'apple', col2: 'Appel' },
        { col1: 'banana', col2: 'banaan' },
      ],
    })
    expect(spoken()).toEqual(['zon', 'Appel', 'banaan'])
    await user.click(screen.getByRole('button', { name: 'Sort A to Z' }))
    expect(spoken()).toEqual(['Appel', 'banaan', 'zon'])
    const answers = cells().filter((c) => c.dataset.cell === 'col1').map((c) => (c as HTMLInputElement).value)
    expect(answers.slice(0, 3)).toEqual(['apple', 'banana', 'sun'])
  })

  it('saves the sorted order', async () => {
    const { user, onConfirm } = setup({
      initialRows: [
        { col1: 'x', col2: 'b' },
        { col1: 'y', col2: 'a' },
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Sort A to Z' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onConfirm.mock.calls[0]![0].pairs.map((p: { col2: string }) => p.col2)).toEqual(['a', 'b'])
  })
})

/**
 * Translating a word.
 *
 * The browser's on-device Translator API stands in for the real thing. It is absent
 * in jsdom, which is also the state every Safari and Firefox user is in — so the
 * first test here is that the editor looks untouched without it.
 */
describe('translation suggestions', () => {
  const installTranslator = (
    translateFn: (text: string) => Promise<string> = async (t) => `<${t}>`,
  ) => {
    const api = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async (opts: { monitor?: (m: unknown) => void }) => {
        opts.monitor?.({ addEventListener: () => {} })
        return { translate: translateFn }
      }),
    }
    Object.assign(globalThis, { Translator: api })
    return api
  }

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'Translator')
  })

  const translateButtons = () => screen.queryAllByRole('button', { name: /^translate row/i })

  it('offers nothing in a browser without the API', async () => {
    setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    // An await so a promise-resolved button would have had its chance to appear.
    await screen.findByRole('button', { name: 'Save' })
    expect(translateButtons()).toHaveLength(0)
  })

  it('offers a translate button per row once the browser confirms the pair', async () => {
    installTranslator()
    setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    await screen.findAllByRole('button', { name: /^translate row/i })
    expect(translateButtons().length).toBeGreaterThan(0)
  })

  it('hides it when the browser cannot do that pair', async () => {
    const api = installTranslator()
    api.availability.mockResolvedValue('unavailable')
    setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    await screen.findByRole('button', { name: 'Save' })
    expect(translateButtons()).toHaveLength(0)
  })

  /*
   * A list that explains its words in their own language has nothing to translate,
   * and "Dutch into Dutch" is not a question worth putting to the browser.
   */
  it('hides it on a list whose two columns are the same language', async () => {
    installTranslator()
    const { user } = setup({ initialRows: [{ col1: 'daughter', col2: 'dochter' }] })
    // Present first, so what follows tests the withdrawal and not just its absence.
    await screen.findAllByRole('button', { name: /^translate row/i })

    // Both columns Dutch: a word against an explanation of it, which this app supports
    // and which has nothing to translate.
    await user.selectOptions(screen.getByLabelText('Meaning language'), 'nl')
    await user.selectOptions(screen.getByLabelText('Word language'), 'nl')
    expect(translateButtons()).toHaveLength(0)
  })

  it('suggests a translation without writing it into the cell', async () => {
    installTranslator(async () => 'daughter')
    const { user } = setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    await user.click((await screen.findAllByRole('button', { name: /^translate row/i }))[0]!)

    expect(await screen.findByText('daughter')).toBeInTheDocument()
    // The cell is untouched until Use is clicked.
    expect(cell(0, 'col1').value).toBe('')
  })

  it('fills the cell when the suggestion is used', async () => {
    installTranslator(async () => 'daughter')
    const { user } = setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    await user.click((await screen.findAllByRole('button', { name: /^translate row/i }))[0]!)
    await user.click(await screen.findByRole('button', { name: /use the suggestion/i }))

    expect(cell(0, 'col1').value).toBe('daughter')
    expect(screen.queryByRole('button', { name: /use the suggestion/i })).not.toBeInTheDocument()
  })

  it('leaves the cell alone when the suggestion is dismissed', async () => {
    installTranslator(async () => 'daughter')
    const { user } = setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    await user.click((await screen.findAllByRole('button', { name: /^translate row/i }))[0]!)
    await user.click(await screen.findByRole('button', { name: /dismiss the suggestion/i }))

    expect(cell(0, 'col1').value).toBe('')
    expect(screen.queryByText('daughter')).not.toBeInTheDocument()
  })

  /*
   * Column 2 is the word being learned and column 1 is what it means, so a filled
   * column 2 translates INTO column 1 — which is what fills the blank when the
   * foreign words were typed first.
   */
  it('translates the word into the meaning column', async () => {
    const seen: string[] = []
    installTranslator(async (text) => {
      seen.push(text)
      return 'daughter'
    })
    const { user } = setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    await user.click((await screen.findAllByRole('button', { name: /^translate row/i }))[0]!)
    await user.click(await screen.findByRole('button', { name: /use the suggestion/i }))

    expect(seen).toEqual(['dochter'])
    expect(cell(0, 'col1').value).toBe('daughter')
  })

  it('runs the other way when only the meaning is filled', async () => {
    const seen: string[] = []
    installTranslator(async (text) => {
      seen.push(text)
      return 'dochter'
    })
    const { user } = setup({ initialRows: [{ col1: 'daughter', col2: '' }] })
    await user.click((await screen.findAllByRole('button', { name: /^translate row/i }))[0]!)
    await user.click(await screen.findByRole('button', { name: /use the suggestion/i }))

    expect(seen).toEqual(['daughter'])
    expect(cell(0, 'col2').value).toBe('dochter')
  })

  // Both sides filled is a check of the answer, not a gap to fill.
  it('says so when the suggestion is what the row already has', async () => {
    installTranslator(async () => 'Daughter')
    const { user } = setup({ initialRows: [{ col1: 'daughter', col2: 'dochter' }] })
    await user.click((await screen.findAllByRole('button', { name: /^translate row/i }))[0]!)

    expect(await screen.findByText(/the same as what you have/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /use the suggestion/i })).not.toBeInTheDocument()
  })

  it('has nothing to translate on an empty row', async () => {
    installTranslator()
    setup({ initialRows: [{ col1: '', col2: '' }] })
    const buttons = await screen.findAllByRole('button', { name: /^translate row/i })
    expect(buttons[0]).toBeDisabled()
  })

  it('tells the user when it could not translate, and leaves the row alone', async () => {
    installTranslator(async () => {
      throw new Error('model gone')
    })
    const { user } = setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    await user.click((await screen.findAllByRole('button', { name: /^translate row/i }))[0]!)

    expect(await screen.findByText(/could not translate/i)).toBeInTheDocument()
    expect(cell(0, 'col1').value).toBe('')
  })

  /*
   * A suggestion names a row by INDEX, and deleting a row above it shifts every
   * index below. Left standing, Use would have written the word into the wrong row.
   */
  it('drops a pending suggestion when a row is deleted', async () => {
    installTranslator(async () => 'daughter')
    const { user } = setup({
      initialRows: [
        { col1: 'son', col2: 'zoon' },
        { col1: '', col2: 'dochter' },
      ],
    })
    const buttons = await screen.findAllByRole('button', { name: /^translate row/i })
    await user.click(buttons[1]!)
    await screen.findByRole('button', { name: /use the suggestion/i })

    await user.click(screen.getAllByRole('button', { name: /delete row/i })[0]!)
    expect(screen.queryByRole('button', { name: /use the suggestion/i })).not.toBeInTheDocument()
  })

  it('drops a pending suggestion when the rows are sorted', async () => {
    installTranslator(async () => 'daughter')
    const { user } = setup({
      initialRows: [
        { col1: 'sun', col2: 'zon' },
        { col1: '', col2: 'dochter' },
      ],
    })
    const buttons = await screen.findAllByRole('button', { name: /^translate row/i })
    await user.click(buttons[1]!)
    await screen.findByRole('button', { name: /use the suggestion/i })

    await user.click(screen.getByRole('button', { name: 'Sort A to Z' }))
    expect(screen.queryByRole('button', { name: /use the suggestion/i })).not.toBeInTheDocument()
  })

  it('drops a pending suggestion when the columns are swapped', async () => {
    installTranslator(async () => 'daughter')
    const { user } = setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    await user.click((await screen.findAllByRole('button', { name: /^translate row/i }))[0]!)
    await screen.findByRole('button', { name: /use the suggestion/i })

    await user.click(screen.getByRole('button', { name: /swap columns/i }))
    expect(screen.queryByRole('button', { name: /use the suggestion/i })).not.toBeInTheDocument()
  })

  // An accepted suggestion is an ordinary edit in every respect.
  it('an accepted suggestion marks the list unsaved', async () => {
    installTranslator(async () => 'daughter')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user } = setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    await user.click((await screen.findAllByRole('button', { name: /^translate row/i }))[0]!)
    await user.click(await screen.findByRole('button', { name: /use the suggestion/i }))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(confirmSpy).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('drops a pending suggestion when a language is changed', async () => {
    installTranslator(async () => 'daughter')
    const { user } = setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    await user.click((await screen.findAllByRole('button', { name: /^translate row/i }))[0]!)
    await screen.findByRole('button', { name: /use the suggestion/i })

    await user.selectOptions(screen.getByLabelText('Meaning language'), 'fr')
    expect(screen.queryByRole('button', { name: /use the suggestion/i })).not.toBeInTheDocument()
  })

  it('saves an accepted suggestion as a pair', async () => {
    installTranslator(async () => 'daughter')
    const { user, onConfirm } = setup({ initialRows: [{ col1: '', col2: 'dochter' }] })
    await user.click((await screen.findAllByRole('button', { name: /^translate row/i }))[0]!)
    await user.click(await screen.findByRole('button', { name: /use the suggestion/i }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onConfirm.mock.calls[0]![0].pairs).toEqual([
      expect.objectContaining({ col1: 'daughter', col2: 'dochter' }),
    ])
  })
})
