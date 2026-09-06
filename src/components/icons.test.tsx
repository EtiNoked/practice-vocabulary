import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { GamesIcon, HomeIcon, ListsIcon, MenuIcon, PracticesIcon, TestsIcon } from './icons'

/** The module's own source, the way `invariants.test.ts` reads sources. */
const iconSource = (
  import.meta.glob('./icons.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
)['./icons.tsx']!

/**
 * The icons are decorative, and these tests exist to keep them that way.
 *
 * Nothing here checks what a glyph LOOKS like — that is what the device pass is for
 * (012 T18), and jsdom does not lay out SVG at all. What is checkable, and what actually
 * breaks in review, is the contract: hidden from assistive tech, sized in `em`, coloured
 * by `currentColor` so 007's tokens stay the only palette.
 */

const ICONS = {
  HomeIcon,
  ListsIcon,
  TestsIcon,
  GamesIcon,
  PracticesIcon,
  MenuIcon,
} as const

const svgOf = (Icon: () => ReactElement) => {
  const { container } = render(<Icon />)
  const svg = container.querySelector('svg')
  expect(svg).not.toBeNull()
  return svg!
}

describe('every icon is decorative (012 NFR-5)', () => {
  for (const [name, Icon] of Object.entries(ICONS)) {
    it(`${name} is hidden from assistive tech and unfocusable`, () => {
      const svg = svgOf(Icon)
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('focusable')).toBe('false')
      // No accessible name of its own — the label beside it is the name.
      expect(svg.querySelector('title')).toBeNull()
    })
  }
})

describe('every icon inherits its surroundings (012 D-7)', () => {
  for (const [name, Icon] of Object.entries(ICONS)) {
    it(`${name} strokes in currentColor and never fills`, () => {
      const svg = svgOf(Icon)
      expect(svg.getAttribute('stroke')).toBe('currentColor')
      expect(svg.getAttribute('fill')).toBe('none')
    })

    it(`${name} is 1em square, so it scales with its label`, () => {
      const svg = svgOf(Icon)
      expect(svg.getAttribute('width')).toBe('1em')
      expect(svg.getAttribute('height')).toBe('1em')
      // A fixed px size would decouple the glyph from the type scale, which is the
      // whole reason these are not images.
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    })

    it(`${name} does not squash beside wrapping text`, () => {
      // These live in flex rows next to labels that wrap on a narrow phone.
      expect(svgOf(Icon).getAttribute('class')).toContain('shrink-0')
    })
  }
})

describe('the palette stays in one place', () => {
  it('hard-codes no colour anywhere in the module', () => {
    const source = iconSource
    /*
     * A hex, an rgb() or a Tailwind colour utility in here would be a SECOND palette,
     * maintained by hand, that 007's dark-mode tokens know nothing about. `currentColor`
     * is what makes both themes free.
     */
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(source).not.toMatch(/\brgba?\(/)
    expect(source).not.toMatch(/\b(text|fill|stroke)-(?!current)[a-z]+-\d/)
  })
})
