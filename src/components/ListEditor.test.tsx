import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ListEditor } from './ListEditor'

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

describe('typing pairs', () => {
  it('starts with one empty row', () => {
    setup()
    expect(cells()).toHaveLength(2)
  })

  // No "add row" ceremony in the common case.
  it('auto-appends a new row when the last row is filled in', async () => {
    const { user } = setup()
    await user.type(cells()[0]!, 'daughter')
    await user.type(cells()[1]!, 'dochter')
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
    const start = screen.getByRole('button', { name: /start practice/i })
    expect(start).toBeDisabled()
    await user.type(cells()[0]!, 'daughter')
    await user.type(cells()[1]!, 'dochter')
    expect(screen.getByRole('button', { name: /start practice/i })).toBeEnabled()
  })

  it('flags a row with only one side filled', () => {
    setup({ initialRows: [{ col1: 'daughter', col2: '' }] })
    expect(screen.getByText(/incomplete/i)).toBeInTheDocument()
  })

  it('confirms before discarding unsaved changes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user, onCancel } = setup()
    await user.type(cells()[0]!, 'x')
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
    await user.click(screen.getByRole('button', { name: /start practice/i }))
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
    await user.click(screen.getByRole('button', { name: /start practice/i }))
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
    await user.click(screen.getByRole('button', { name: /start practice/i }))
    const list = onConfirm.mock.calls[0]![0]
    expect(list.langSource).toBe('header')
    expect(list.col1Lang).toBe('en')
    expect(list.col2Lang).toBe('nl')
    expect(list.pairs).toHaveLength(1)
  })
})

describe('language selectors', () => {
  const col1Select = () => screen.getByLabelText(/column 1 language/i) as HTMLSelectElement
  const col2Select = () => screen.getByLabelText(/column 2 language/i) as HTMLSelectElement

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
    await user.type(cells()[0]!, 'de deur')
    await user.type(cells()[1]!, 'la fenêtre')
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
    await user.type(cells()[0]!, ' extra')
    expect(col2Select().value).toBe('en')
  })

  it('writes the chosen languages and a manual source on save', async () => {
    const { user, onConfirm } = setup({ initialRows: NL_FR })
    await user.selectOptions(col1Select(), 'fr')
    await user.click(screen.getByRole('button', { name: /start practice/i }))
    const list = onConfirm.mock.calls[0]![0]
    expect(list.langSource).toBe('manual')
    expect(list.col1Lang).toBe('fr')
  })

  // Exchange rather than reject: a user setting both the same is almost always
  // trying to swap them.
  it('never lets both columns hold the same language', async () => {
    const { user } = setup({ initialRows: NL_FR })
    await user.selectOptions(col2Select(), 'nl')
    expect(col1Select().value).toBe('fr')
    expect(col2Select().value).toBe('nl')
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
    await user.click(screen.getByRole('button', { name: /start practice/i }))
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
    expect((screen.getByLabelText(/column 1 language/i) as HTMLSelectElement).value).toBe('nl')
    await user.click(screen.getByRole('button', { name: /start practice/i }))
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
    await user.click(screen.getByRole('button', { name: /start practice/i }))
    const list = onConfirm.mock.calls[0]![0]
    expect(list.pairs[0]).toMatchObject({ col1: 'daughter', col2: 'dochter' })
    expect(list.col1Lang).toBe('en')
    expect(list.col2Lang).toBe('nl')
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
})
