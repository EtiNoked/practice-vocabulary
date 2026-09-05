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

/**
 * The two dark blocks in index.css, by the selector that opens each.
 *
 * Quotes are optional in the pattern because this reads the COMPILED stylesheet:
 * Vitest serves it untransformed (`[data-theme='dark']`) while a production build
 * minifies the quotes away (`[data-theme=dark]`), and a guard that only matched
 * one of those would pass for the wrong reason.
 */
const block = (selector: string): string => {
  const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
  return match?.[1] ?? ''
}

const OS_DEFAULT = ':root:not\\(\\[data-theme=[\'"]?light[\'"]?\\]\\)'
const EXPLICIT = ':root\\[data-theme=[\'"]?dark[\'"]?\\]'

/**
 * The light palette — the `@theme` block, located by its CONTENT rather than by
 * its selector. Tailwind emits it as `:root, :host`, and how that is spaced is a
 * detail of the build (Vitest keeps it, a production build minifies it), which is
 * not something a guard about colour should be able to fail over. The first
 * `--color-ground` in the file is the light one; the dark blocks come after it.
 */
const lightBlock = (): string => {
  const at = css.indexOf('--color-ground')
  if (at === -1) return ''
  return css.slice(css.lastIndexOf('{', at) + 1, css.indexOf('}', at))
}

const colourNames = (source: string): string[] =>
  [...source.matchAll(/--color-([a-z-]+)\s*:/g)].map((m) => m[1]!).sort()

describe('dark mode is expressed in tokens, not in classes', () => {
  it('has no dark: variant anywhere in src', () => {
    const offenders = appSources()
      .filter(([, src]) => /\bdark:[a-z[]/.test(src))
      .map(([path]) => path)

    /*
     * This test did NOT change when dark mode came back, and that is the point
     * of it. 005 removed 83 `dark:` occurrences and said a dark palette should
     * return as a second block of the same token names rather than as hand-picked
     * class pairs. This is what holds that line: dark mode is now a real feature
     * and there is still not one `dark:` variant in a component.
     */
    expect(offenders).toEqual([])
  })

  it('declares color-scheme, so form controls follow the palette', () => {
    /*
     * The inverse of what this asserted through 005, deliberately.
     *
     * With one theme, declaring `color-scheme` was actively wrong — it invited
     * the browser to paint controls dark against permanently light surfaces. With
     * two, omitting it is what breaks: scrollbars, date pickers and autofill stay
     * light on a near-black page.
     */
    expect(css).toMatch(/color-scheme\s*:/)
  })

  it('states a color-scheme for every theme, and never hands the choice back', () => {
    expect(block(':root')).toMatch(/color-scheme:\s*light/)
    expect(block(OS_DEFAULT)).toMatch(/color-scheme:\s*dark/)
    expect(block(EXPLICIT)).toMatch(/color-scheme:\s*dark/)

    // `light dark` would defer to the OS, which is exactly what an explicit
    // choice exists to overrule — a user who picked Light on a dark-OS device
    // would get light surfaces and dark form controls.
    expect(css).not.toMatch(/color-scheme:\s*light\s+dark/)
  })

  it('scopes the OS default so an explicit Light choice can still win', () => {
    // A bare `:root` inside the media query would tie with the attribute block
    // and, coming first, would beat it — so choosing Light on a dark-OS device
    // would silently do nothing. This `:not()` is the whole override mechanism.
    expect(css).toMatch(new RegExp(OS_DEFAULT))
  })
})

describe('the two dark blocks stay in step', () => {
  /*
   * They are duplicated by necessity: `@media` cannot be combined with a plain
   * selector in one rule, and a CSS-only theme has no preprocessor to share them.
   * That makes drift the obvious failure mode — someone tunes one value and the
   * app looks different depending on whether you chose dark or merely have a dark
   * OS, which is close to impossible to spot by eye. This is the guard that makes
   * the duplication safe, and it is why the duplication is allowed at all.
   */
  it('define exactly the same colour tokens', () => {
    expect(colourNames(block(OS_DEFAULT))).toEqual(colourNames(block(EXPLICIT)))
  })

  it('redefine every colour the light palette defines', () => {
    const light = colourNames(lightBlock())

    // Guards the guard: if the block were ever located wrongly this would pass
    // vacuously, comparing two empty lists.
    expect(light.length).toBeGreaterThan(0)

    // A colour defined only in light silently keeps its light value in dark —
    // one stubbornly pale panel on an otherwise dark page, and no failure
    // anywhere to explain it.
    expect(colourNames(block(EXPLICIT))).toEqual(light)
  })

  it('override the shadows too, since an ink-tinted shadow vanishes on a dark ground', () => {
    for (const selector of [OS_DEFAULT, EXPLICIT]) {
      expect(block(selector)).toMatch(/--shadow-card:/)
      expect(block(selector)).toMatch(/--shadow-lift:/)
    }
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

  it('names no colour white or black either', () => {
    /*
     * RAW_PALETTE above requires a numeric suffix, so a foreground named for the
     * colour itself walked straight past it — and three call sites were doing
     * exactly that when dark mode arrived: the drill's two answer buttons and the
     * editor's Save button, each a token fill under a hard-coded foreground.
     *
     * In light that is invisible, because all three fills genuinely do take a
     * white foreground. In dark it is the whole problem: `--color-correct` has to
     * become a light green so the revealed answer stays readable on a dark
     * ground, and white on light green is 1.6:1. A fill has to NAME its
     * foreground — the `--color-*-ink` tokens — so the pair moves together.
     *
     * The pattern is assembled from parts rather than written out, and that is
     * not fussiness: Tailwind scans src/ for class names, so spelling a real
     * utility here would compile it into the production stylesheet and this very
     * test would then fail on its own source. 005 hit the same thing when class
     * names quoted in .claude/specs/*.md started appearing in the build.
     */
    const UTILITY = '(?:bg|text|border|ring|outline|fill|stroke)'
    const LITERAL = '(?:wh' + 'ite|bl' + 'ack)'
    const WHITE_OR_BLACK = new RegExp(`\\b${UTILITY}-${LITERAL}\\b`, 'g')

    const offenders = appSources().flatMap(([path, src]) => {
      const hits = src.match(WHITE_OR_BLACK) ?? []
      return hits.map((hit) => `${path}: ${hit}`)
    })

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
      // The foreground ON a fill, so the pair can move together between themes.
      'correct-ink',
      'incorrect',
      'incorrect-ink',
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
