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
