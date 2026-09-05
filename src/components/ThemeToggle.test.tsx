import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from './ThemeToggle'
import { THEME_KEY } from '../theme/theme'

const root = () => document.documentElement

beforeEach(() => {
  localStorage.clear()
  // Without this a choice made in one test paints the next one, and the failure
  // reads as though the component ignored its stored value.
  root().removeAttribute('data-theme')
  document.head.innerHTML = ''
})

const radio = (name: RegExp) => screen.getByRole('radio', { name })

describe('what it offers', () => {
  it('is a group of three, not a two-state switch', () => {
    render(<ThemeToggle />)

    // A `role="switch"` or a checkbox models two states. This has three, and
    // "follow the system" is the one a binary control silently throws away.
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(radio(/system/i)).toBeInTheDocument()
    expect(radio(/light/i)).toBeInTheDocument()
    expect(radio(/dark/i)).toBeInTheDocument()
  })

  it('is a labelled group, so a screen reader announces what the three are for', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('group', { name: /theme/i })).toBeInTheDocument()
  })
})

describe('the active option', () => {
  it('starts on System when nothing has been chosen', () => {
    render(<ThemeToggle />)
    expect(radio(/system/i)).toBeChecked()
  })

  it('starts on the stored choice', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    render(<ThemeToggle />)

    expect(radio(/dark/i)).toBeChecked()
    expect(radio(/system/i)).not.toBeChecked()
  })
})

describe('choosing', () => {
  it('stores dark AND paints it', async () => {
    render(<ThemeToggle />)
    await userEvent.click(radio(/dark/i))

    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(root().getAttribute('data-theme')).toBe('dark')
    expect(radio(/dark/i)).toBeChecked()
  })

  it('stores light AND paints it', async () => {
    render(<ThemeToggle />)
    await userEvent.click(radio(/light/i))

    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(root().getAttribute('data-theme')).toBe('light')
  })

  it('going back to System clears BOTH the key and the attribute', async () => {
    localStorage.setItem(THEME_KEY, 'dark')
    render(<ThemeToggle />)

    await userEvent.click(radio(/system/i))

    // Either one left behind would strand the user: a stale key re-applies the
    // override on the next load, a stale attribute keeps the OS locked out now.
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(root().hasAttribute('data-theme')).toBe(false)
    expect(radio(/system/i)).toBeChecked()
  })
})

describe('storage the browser will not give us', () => {
  it('still switches the theme when the choice cannot be stored', async () => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError')
    }

    try {
      render(<ThemeToggle />)
      await userEvent.click(radio(/dark/i))

      // The preference is lost on reload — unavoidable — but refusing to apply
      // it now would make a private-browsing window look broken.
      expect(root().getAttribute('data-theme')).toBe('dark')
    } finally {
      Storage.prototype.setItem = setItem
    }
  })
})
