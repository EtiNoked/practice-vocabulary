import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MigratePrompt } from './MigratePrompt'
import type { MigrationResult } from '../storage/migrate'
import type { WordList } from '../state/types'

const ok = (copied: number): MigrationResult => ({ copied, failed: [] })

const stubList: WordList = {
  id: 'b',
  name: 'List b',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

describe('the offer', () => {
  it('states exactly how many lists will be copied', () => {
    render(<MigratePrompt count={3} onCopy={async () => ok(3)} onDismiss={vi.fn()} />)
    expect(screen.getByText(/3 lists saved on this device/i)).toBeInTheDocument()
  })

  it('uses the singular for one list', () => {
    render(<MigratePrompt count={1} onCopy={async () => ok(1)} onDismiss={vi.fn()} />)
    expect(screen.getByText(/1 list saved on this device/i)).toBeInTheDocument()
  })

  it('promises the device keeps its copy', () => {
    render(<MigratePrompt count={2} onCopy={async () => ok(2)} onDismiss={vi.fn()} />)
    expect(screen.getByText(/stay on this device either way/i)).toBeInTheDocument()
  })

  it('renders nothing when there is nothing to copy', () => {
    // Not an empty prompt — no prompt.
    const { container } = render(
      <MigratePrompt count={0} onCopy={async () => ok(0)} onDismiss={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('never copies without being asked', () => {
    const onCopy = vi.fn(async () => ok(1))
    render(<MigratePrompt count={1} onCopy={onCopy} onDismiss={vi.fn()} />)
    expect(onCopy).not.toHaveBeenCalled()
  })
})

describe('accepting', () => {
  it('copies and then gets out of the way', async () => {
    const onCopy = vi.fn(async () => ok(2))
    const { container } = render(
      <MigratePrompt count={2} onCopy={onCopy} onDismiss={vi.fn()} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /copy to my account/i }))
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
  })

  it('disables the button while copying', async () => {
    let release: (r: MigrationResult) => void = () => {}
    render(
      <MigratePrompt
        count={2}
        onCopy={() => new Promise<MigrationResult>((r) => (release = r))}
        onDismiss={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: /copy to my account/i })
    await userEvent.click(button)
    expect(button).toBeDisabled()
    release(ok(2))
  })
})

describe('declining', () => {
  it('dismisses without copying', async () => {
    const onCopy = vi.fn(async () => ok(1))
    const onDismiss = vi.fn()
    render(<MigratePrompt count={1} onCopy={onCopy} onDismiss={onDismiss} />)

    await userEvent.click(screen.getByRole('button', { name: /not now/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onCopy).not.toHaveBeenCalled()
  })
})

describe('partial failure', () => {
  const partial: MigrationResult = {
    copied: 2,
    failed: [{ list: stubList, reason: 'offline' }],
  }

  it('says what made it and what did not', async () => {
    render(<MigratePrompt count={3} onCopy={async () => partial} onDismiss={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /copy to my account/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/copied 2 of 3 lists/i)
  })

  it('offers a retry that finishes the job', async () => {
    const onCopy = vi
      .fn<() => Promise<MigrationResult>>()
      .mockResolvedValueOnce(partial)
      .mockResolvedValueOnce(ok(3))

    const { container } = render(
      <MigratePrompt count={3} onCopy={onCopy} onDismiss={vi.fn()} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /copy to my account/i }))
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(onCopy).toHaveBeenCalledTimes(2)
    expect(container).toBeEmptyDOMElement()
  })
})
