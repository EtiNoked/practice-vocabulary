import { describe, expect, it } from 'vitest'
// `?raw` rather than node:fs, following csp.test.ts and for its reason:
// tsconfig.app.json deliberately omits Node types so app code cannot reach for
// Node APIs, and a test should not be the reason that restriction gets loosened.
//
// The stylesheet comes in via `?inline`, which is the COMPILED output — so these
// assert that the tokens and primitives actually reach the browser, not merely
// that someone typed them into a source file. It needs `test.css: true` in
// vite.config.ts; without it Vitest hands back an empty string.
import inlineCss from '../index.css?inline'

const css = String(inlineCss ?? '')

/**
 * Guards for a sweep, not for a rule.
 *
 * Restyling fourteen components regresses one file at a time, inside a
 * `className` string that nobody reads closely in review. These turn "somebody
 * left a slate-600 in ListEditor" from a thing you notice in six weeks into a
 * failing build.
 */

const sources = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Everything but this file — its own regex sources would fail its own checks. */
const appSources = () =>
  Object.entries(sources).filter(([path]) => !path.endsWith('test/theme.test.ts'))

describe('dark mode is gone, and stays gone', () => {
  it('has no dark: variant anywhere in src', () => {
    const offenders = appSources()
      .filter(([, src]) => /\bdark:[a-z[]/.test(src))
      .map(([path]) => path)

    // Not a style preference: with no `color-scheme` declared, a surviving
    // dark: class paints a dark panel inside an always-light page.
    expect(offenders).toEqual([])
  })

  it('declares no color-scheme, so the browser keeps form controls light', () => {
    expect(css).not.toMatch(/color-scheme\s*:/)
  })
})

describe('colour comes from the token layer', () => {
  // Tailwind's stock palette. Every one of these had a home in this app before
  // the design system existed; none should now.
  const RAW_PALETTE =
    /\b(?:bg|text|border|ring|from|to|via|decoration|outline)-(?:slate|gray|zinc|neutral|stone|emerald|green|amber|yellow|orange|rose|red|pink|blue|indigo|violet|purple|teal|cyan|sky|lime)-\d{2,3}\b/g

  it('uses no raw Tailwind palette class', () => {
    const offenders = appSources().flatMap(([path, src]) => {
      const hits = src.match(RAW_PALETTE) ?? []
      return hits.map((hit) => `${path}: ${hit}`)
    })

    // Reported with the offending class, so a failure is actionable rather than
    // the start of a search.
    expect(offenders).toEqual([])
  })

  it('defines every colour the app names, in one place', () => {
    for (const token of [
      'ground',
      'surface',
      'surface-sunken',
      'ink',
      'ink-muted',
      'ink-faint',
      'primary',
      'primary-bright',
      'primary-soft',
      'primary-ink',
      'accent',
      'accent-soft',
      'correct',
      'incorrect',
      'incorrect-soft',
      'line',
      'line-strong',
    ]) {
      expect(css).toContain(`--color-${token}:`)
    }
  })

  it('avoids token names that collide with a Tailwind utility', () => {
    // `--color-right` would generate `text-right`, which already means
    // text-align. The collision is silent: the class applies, just not the
    // colour you meant. This cost a real bug during the sweep.
    expect(css).not.toMatch(/--color-(?:right|left|center|justify)\s*:/)
  })
})

describe('the primitives exist, and carry the rules', () => {
  it('defines the shared button and surface classes', () => {
    for (const cls of ['.btn', '.btn-primary', '.btn-quiet', '.btn-danger', '.card', '.field']) {
      expect(css).toContain(cls)
    }
  })

  it('bakes the 44px touch target into .btn rather than trusting call sites', () => {
    const btn = css.slice(css.indexOf('.btn {'), css.indexOf('.btn:disabled'))
    expect(btn).toMatch(/min-height:\s*2\.75rem/)
  })

  it('gives keyboard users a focus ring', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:/)
  })

  it('respects a reduced-motion preference', () => {
    expect(css).toContain('prefers-reduced-motion')
  })
})
