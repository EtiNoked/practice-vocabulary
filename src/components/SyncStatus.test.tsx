import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SyncStatus } from './SyncStatus'

function setOnline(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

const fireConnectivity = (type: 'online' | 'offline') =>
  act(() => {
    window.dispatchEvent(new Event(type))
  })

afterEach(() => vi.restoreAllMocks())

describe('SyncStatus', () => {
  it('says nothing while online', () => {
    setOnline(true)
    render(<SyncStatus active />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('warns when offline and signed in', () => {
    setOnline(false)
    render(<SyncStatus active />)
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i)
  })

  it('reassures rather than alarms — practice still works', () => {
    setOnline(false)
    render(<SyncStatus active />)
    expect(screen.getByRole('status')).toHaveTextContent(/keep practising/i)
    expect(screen.getByRole('status')).toHaveTextContent(/sync .* when you reconnect/i)
  })

  it('stays silent for a signed-out user, who has nothing to sync', () => {
    setOnline(false)
    render(<SyncStatus active={false} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('appears when the connection drops', () => {
    setOnline(true)
    render(<SyncStatus active />)
    setOnline(false)
    fireConnectivity('offline')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('disappears again when the connection returns', () => {
    setOnline(false)
    render(<SyncStatus active />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    setOnline(true)
    fireConnectivity('online')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('detaches its listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    setOnline(true)
    render(<SyncStatus active />).unmount()
    const removed = remove.mock.calls.map(([type]) => type)
    expect(removed).toContain('online')
    expect(removed).toContain('offline')
  })
})
