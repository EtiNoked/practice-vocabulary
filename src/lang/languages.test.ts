import { describe, expect, it } from 'vitest'
import { detectLanguages } from '../parse/languageDetect'
import { BCP47, HEADER_ALIASES, LANG_CODES, LANG_NAMES, PROFILES } from './languages'

/**
 * The suite that makes "adding a language is a data change" true rather than
 * aspirational. Every assertion here exists to fail loudly when a fifth language
 * is half-added — a profile without a voice tag, a name without a profile, or a
 * header alias that collides with one already in the table.
 */

const RECORDS = { BCP47, LANG_NAMES, HEADER_ALIASES, PROFILES }

describe('language table integrity', () => {
  // Checked in BOTH directions on purpose. A one-directional check still passes
  // when a record has a stale extra key, which is exactly the drift this file
  // exists to prevent.
  it.each(Object.entries(RECORDS))('%s has exactly one entry per LANG_CODES member', (_, record) => {
    expect(Object.keys(record).sort()).toEqual([...LANG_CODES].sort())
  })

  it('has no duplicate entries in LANG_CODES', () => {
    expect(new Set(LANG_CODES).size).toBe(LANG_CODES.length)
  })

  it('gives every language a well-formed BCP-47 tag whose prefix is its code', () => {
    for (const code of LANG_CODES) {
      expect(BCP47[code]).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
      expect(BCP47[code].split('-')[0]).toBe(code)
    }
  })

  it('gives every language a non-empty display name and at least one header alias', () => {
    for (const code of LANG_CODES) {
      expect(LANG_NAMES[code].trim()).not.toBe('')
      expect(HEADER_ALIASES[code].length).toBeGreaterThan(0)
    }
  })

  it('keeps header aliases lowercase and free of characters the matcher strips', () => {
    // matchHeaderCell strips everything outside [a-z] before comparing, so an
    // alias containing anything else could never be matched.
    for (const code of LANG_CODES) {
      for (const alias of HEADER_ALIASES[code]) {
        expect(alias).toMatch(/^[a-z]+$/)
      }
    }
  })
})

describe('profile discriminability', () => {
  /**
   * Overlapping markers are fine — "de" is shared by Dutch and French and cancels
   * out of the comparison between them. What is NOT fine is a language whose every
   * marker is shared, because it could then never out-score its neighbour on
   * function words alone.
   */
  it('gives every language at least one marker no other language claims', () => {
    for (const code of LANG_CODES) {
      const others = new Set(
        LANG_CODES.filter((c) => c !== code).flatMap((c) => PROFILES[c].markers),
      )
      const exclusive = PROFILES[code].markers.filter((m) => !others.has(m))
      expect(exclusive.length).toBeGreaterThan(0)
    }
  })

  it('documents the known overlap: "de" belongs to both Dutch and French', () => {
    const owners = LANG_CODES.filter((c) => PROFILES[c].markers.includes('de'))
    expect(owners).toEqual(['nl', 'fr'])
  })

  it('keeps every profile entry lowercase, so it can match the lowercased tokens', () => {
    for (const code of LANG_CODES) {
      const { markers, digraphs, suffixes } = PROFILES[code]
      for (const entry of [...markers, ...digraphs, ...suffixes]) {
        expect(entry).toBe(entry.toLowerCase())
        expect(entry).not.toBe('')
      }
    }
  })

  it('has no duplicate entries within a single profile list', () => {
    for (const code of LANG_CODES) {
      const { markers, digraphs, suffixes } = PROFILES[code]
      expect(new Set(markers).size).toBe(markers.length)
      expect(new Set(digraphs).size).toBe(digraphs.length)
      expect(new Set(suffixes).size).toBe(suffixes.length)
    }
  })
})

describe('header aliases are unambiguous across languages', () => {
  /**
   * Goes through the real detection path rather than the private matcher, so this
   * also proves LANG_CODES ordering cannot silently decide a near-collision.
   *
   * The case waiting to happen is German: "duits"/"deutsch" against "dutch".
   */
  const pairs = LANG_CODES.flatMap((a) => LANG_CODES.filter((b) => b !== a).map((b) => [a, b]))

  it.each(pairs)('resolves a %s / %s header to exactly those languages', (a, b) => {
    for (const aliasA of HEADER_ALIASES[a]) {
      for (const aliasB of HEADER_ALIASES[b]) {
        const result = detectLanguages([
          { col1: aliasA, col2: aliasB },
          { col1: 'word', col2: 'woord' },
        ])
        expect({ ...result, alias: `${aliasA}/${aliasB}` }).toMatchObject({
          source: 'header',
          col1Lang: a,
          col2Lang: b,
          headerConsumed: true,
          alias: `${aliasA}/${aliasB}`,
        })
      }
    }
  })
})
