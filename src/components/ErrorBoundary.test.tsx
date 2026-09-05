import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message)
}

/**
 * React logs every caught render error to console.error on its own, on top of
 * the boundary's own logging. Silencing it for THIS file only keeps the suite
 * output readable without hiding real errors elsewhere — the assertions below
 * still prove the boundary logged.
 */
let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('a child that throws', () => {
  it('renders the fallback rather than a blank tree', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument()
  })

  it('shows the error message, so a report is actionable', () => {
    render(
      <ErrorBoundary>
        <Boom message="voices exploded" />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/voices exploded/)).toBeInTheDocument()
  })

  it('logs the failure', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(consoleError).toHaveBeenCalled()
  })

  it('offers recovery through the reset handler', async () => {
    const onReset = vi.fn()
    render(
      <ErrorBoundary onReset={onReset}>
        <Boom />
      </ErrorBoundary>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /start over/i }))
    expect(onReset).toHaveBeenCalled()
  })
})

describe('a child that does not throw', () => {
  it('renders it untouched', () => {
    render(
      <ErrorBoundary>
        <p>all is well</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('all is well')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
