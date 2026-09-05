import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as fx from '../test/fixtures/text'
import { PastePanel } from './PastePanel'

const setup = () => {
  const onAdd = vi.fn()
  render(<PastePanel onAdd={onAdd} />)
  return { onAdd, user: userEvent.setup() }
}

const pasteInto = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.click(screen.getByRole('textbox', { name: /paste/i }))
  await user.paste(text)
}

describe('preview', () => {
  it('counts the complete pairs a tab-separated paste will add', async () => {
    const { user } = setup()
    await pasteInto(user, fx.TAB_SIMPLE)
    expect(screen.getByText(/will add 5 complete pairs/i)).toBeInTheDocument()
  })

  it('reports incomplete lines separately rather than hiding them', async () => {
    const { user } = setup()
    await pasteInto(user, fx.SINGLE_FIELD_LINES)
    expect(screen.getByText(/2 complete pairs, 1 incomplete/i)).toBeInTheDocument()
  })

  it('starts with nothing to add', () => {
    setup()
    expect(screen.getByRole('button', { name: /add to list/i })).toBeDisabled()
  })
})

describe('separator handling', () => {
  it('keeps commas inside column 2 intact', async () => {
    const { user, onAdd } = setup()
    await pasteInto(user, fx.COMMA_WITH_COMMAS_IN_COL2)
    await user.click(screen.getByRole('button', { name: /add to list/i }))
    expect(onAdd.mock.calls[0]![0][0]).toEqual({
      col1: 'niece',
      col2: "My sibling's daughter, my niece",
    })
  })

  it('handles quoted CSV', async () => {
    const { user, onAdd } = setup()
    await pasteInto(user, fx.QUOTED_CSV)
    await user.click(screen.getByRole('button', { name: /add to list/i }))
    expect(onAdd.mock.calls[0]![0][0]).toEqual({
      col1: 'cousin (male, female)',
      col2: 'neef, nicht',
    })
  })

  // Refusing to guess is the point: a silently mis-parsed list is worse than a click.
  it('asks the user to pick when it cannot tell', async () => {
    const { user } = setup()
    await pasteInto(user, fx.AMBIGUOUS)
    expect(screen.getByText(/couldn't work out the separator/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to list/i })).toBeDisabled()
  })

  it('parses once the user picks a separator by hand', async () => {
    const { user } = setup()
    await pasteInto(user, fx.AMBIGUOUS)
    await user.selectOptions(screen.getByLabelText(/separator/i), 'comma')
    expect(screen.getByRole('button', { name: /add to list/i })).toBeEnabled()
  })

  it('clears the box after adding, ready for another paste', async () => {
    const { user } = setup()
    await pasteInto(user, fx.TAB_SIMPLE)
    await user.click(screen.getByRole('button', { name: /add to list/i }))
    expect(screen.getByRole('textbox', { name: /paste/i })).toHaveValue('')
  })
})

describe('file upload', () => {
  it('parses an uploaded .csv through the same path as a paste', async () => {
    const { user, onAdd } = setup()
    const file = new File(['daughter,dochter\nson,zoon'], 'words.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/upload a file/i), file)
    await screen.findByText(/will add 2 complete pairs/i)
    await user.click(screen.getByRole('button', { name: /add to list/i }))
    expect(onAdd.mock.calls[0]![0]).toHaveLength(2)
  })

  it('rejects a file over 1 MB', async () => {
    const { user } = setup()
    const big = new File(['x'.repeat(1024 * 1024 + 1)], 'big.txt', { type: 'text/plain' })
    await user.upload(screen.getByLabelText(/upload a file/i), big)
    expect(await screen.findByText(/larger than 1 MB/i)).toBeInTheDocument()
  })
})
