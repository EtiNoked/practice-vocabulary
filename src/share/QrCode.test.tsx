import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QrCode } from './QrCode'

function viewBoxSide(svg: Element): number {
  const [x, y, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number)
  expect([x, y]).toEqual([0, 0])
  expect(w).toBe(h)
  return w!
}

describe('QrCode', () => {
  it('is an image with the given name and size', () => {
    render(<QrCode value="https://vocab.example/?join=abc" label="Invitation to French verbs" size={128} />)
    const svg = screen.getByRole('img', { name: 'Invitation to French verbs' })
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(svg).toHaveAttribute('width', '128')
    expect(svg).toHaveAttribute('height', '128')
  })

  it('draws black modules on white whatever the theme', () => {
    // Many cameras cannot read an inverted code, so these two colours are fixed.
    document.documentElement.setAttribute('data-theme', 'dark')
    render(<QrCode value="https://vocab.example/?join=abc" label="QR" size={128} />)
    const svg = screen.getByRole('img', { name: 'QR' })
    const side = viewBoxSide(svg)
    const rect = svg.querySelector('rect')!
    expect(rect).toHaveAttribute('fill', '#ffffff')
    expect(rect).toHaveAttribute('width', String(side))
    expect(rect).toHaveAttribute('height', String(side))
    const path = svg.querySelector('path')!
    expect(path).toHaveAttribute('fill', '#000000')
    expect(path.getAttribute('d')).not.toBe('')
  })

  it('grows with the length of what it encodes', () => {
    render(
      <>
        <QrCode value="abc" label="short" size={128} />
        <QrCode value={`https://vocab.example/?join=${'x'.repeat(200)}`} label="long" size={128} />
      </>,
    )
    const short = viewBoxSide(screen.getByRole('img', { name: 'short' }))
    const long = viewBoxSide(screen.getByRole('img', { name: 'long' }))
    expect(long).toBeGreaterThan(short)
  })
})
