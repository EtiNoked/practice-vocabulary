import { describe, expect, it } from 'vitest'
import type { RawRow } from './types'
import { detectLanguages, levenshtein } from './languageDetect'
import { parseDelimited } from './textParse'

const rows = (...pairs: Array<[string, string]>): RawRow[] =>
  pairs.map(([col1, col2]) => ({ col1, col2 }))

const ENGLISH_DUTCH = rows(
  ['daughter', 'dochter'],
  ['to die', 'doodgaan'],
  ['to be born', 'geboren worden'],
  ['grandparents', 'grootouders'],
  ['twins', 'tweeling'],
)

describe('levenshtein', () => {
  it('is 0 for identical strings', () => {
    expect(levenshtein('english', 'english')).toBe(0)
  })

  it('counts single-character edits', () => {
    expect(levenshtein('engish', 'english')).toBe(1)
    expect(levenshtein('duch', 'dutch')).toBe(1)
  })
})

describe('detectLanguages — header row', () => {
  it('reads an English/Dutch header and consumes it', () => {
    const result = detectLanguages(rows(['English', 'Dutch'], ...ENGLISH_DUTCH.map(r => [r.col1, r.col2] as [string, string])))
    expect(result.source).toBe('header')
    expect(result.col1Lang).toBe('en')
    expect(result.col2Lang).toBe('nl')
    expect(result.headerConsumed).toBe(true)
  })

  it('handles a Dutch-first header, so detection is not positional', () => {
    const result = detectLanguages(rows(['Nederlands', 'Engels'], ['dochter', 'daughter']))
    expect(result.source).toBe('header')
    expect(result.col1Lang).toBe('nl')
    expect(result.col2Lang).toBe('en')
    expect(result.headerConsumed).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(detectLanguages(rows(['ENGLISH', 'dutch'], ['a', 'b'])).source).toBe('header')
  })

  // Fuzzy so a typo still resolves — and so an OCR'd header will, when v2 arrives.
  it('tolerates a mistyped header', () => {
    const result = detectLanguages(rows(['Engish', 'Duch'], ['daughter', 'dochter']))
    expect(result.source).toBe('header')
    expect(result.col1Lang).toBe('en')
    expect(result.col2Lang).toBe('nl')
  })

  /*
   * The inverse of what this asserted before, and deliberately.
   *
   * "Nederlands / Nederlands" used to be read as a nonsense header and thrown away. It is
   * now the clearest possible statement that this list explains its words in their own
   * language rather than translating them, and the one thing it must not do is send that
   * straight down the guessing path.
   */
  it('reads a header row that names the same language twice', () => {
    const result = detectLanguages(
      rows(['Nederlands', 'Nederlands'], ['de fiets', 'een ding met twee wielen']),
    )
    expect(result.source).toBe('header')
    expect(result.col1Lang).toBe('nl')
    expect(result.col2Lang).toBe('nl')
    expect(result.headerConsumed).toBe(true)
  })

  /*
   * Composed through the REAL parser, not through hand-built rows (017).
   *
   * Every other test here states its rows as `{col1, col2}` directly, which is a statement
   * about fields and says nothing about what a user typed. This one starts from the text a
   * user actually pastes, so it pins the thing they can see: the first cell of a header row
   * names the first column, which is the word they are learning.
   *
   * It is here because a hand-built fixture cannot catch a double flip — get `parseDelimited`
   * and this function both "flipped" and the two cancel, with the whole suite still green and
   * every Dutch word read aloud in an English voice.
   */
  it('reads a pasted header row word-first, through the real parser', () => {
    const result = detectLanguages(parseDelimited('Dutch\tEnglish\ndochter\tdaughter', 'tab'))
    expect(result.source).toBe('header')
    expect(result.col2Lang).toBe('nl')
    expect(result.col1Lang).toBe('en')
    expect(result.headerConsumed).toBe(true)
  })

  it('does not consume a first row that is an ordinary word pair', () => {
    const result = detectLanguages(ENGLISH_DUTCH)
    expect(result.headerConsumed).toBe(false)
  })
})

describe('detectLanguages — heuristic fallback', () => {
  it('identifies the Dutch column by its spelling patterns', () => {
    const result = detectLanguages(ENGLISH_DUTCH)
    expect(result.source).toBe('heuristic')
    expect(result.col1Lang).toBe('en')
    expect(result.col2Lang).toBe('nl')
  })

  it('works when the Dutch column comes first', () => {
    const flipped = ENGLISH_DUTCH.map((r) => ({ col1: r.col2, col2: r.col1 }))
    const result = detectLanguages(flipped)
    expect(result.source).toBe('heuristic')
    expect(result.col1Lang).toBe('nl')
    expect(result.col2Lang).toBe('en')
  })

  it('always returns two different languages', () => {
    const result = detectLanguages(ENGLISH_DUTCH)
    expect(result.col1Lang).not.toBe(result.col2Lang)
  })
})

describe('detectLanguages — three languages', () => {
  const DUTCH_FRENCH = rows(
    ['de deur', 'la porte'],
    ['het raam', 'la fenêtre'],
    ['de zomer', "l'été"],
    ['de jongen', 'le garçon'],
    ['de tafel', 'la table'],
    ['gisteren', 'hier'],
    ['de school', "l'école"],
  )

  /**
   * THE regression test for the defect this feature exists to fix. Before the
   * n-way rewrite no input could make the heuristic return 'fr', so this list was
   * labelled Dutch → English and the French column was spoken with an English
   * voice.
   */
  it('identifies a Dutch/French list with no header row', () => {
    const result = detectLanguages(DUTCH_FRENCH)
    expect(result.source).toBe('heuristic')
    expect(result.col1Lang).toBe('nl')
    expect(result.col2Lang).toBe('fr')
  })

  it('works when the French column comes first', () => {
    const flipped = DUTCH_FRENCH.map((r) => ({ col1: r.col2, col2: r.col1 }))
    const result = detectLanguages(flipped)
    expect(result.source).toBe('heuristic')
    expect(result.col1Lang).toBe('fr')
    expect(result.col2Lang).toBe('nl')
  })

  it('reads a Dutch/French header written in Dutch', () => {
    const result = detectLanguages(rows(['Nederlands', 'Frans'], ['de deur', 'la porte']))
    expect(result.source).toBe('header')
    expect(result.col1Lang).toBe('nl')
    expect(result.col2Lang).toBe('fr')
    expect(result.headerConsumed).toBe(true)
  })

  it('reads a French header written with its accent, which the matcher strips', () => {
    const result = detectLanguages(rows(['Français', 'Engels'], ['la porte', 'the door']))
    expect(result.source).toBe('header')
    expect(result.col1Lang).toBe('fr')
    expect(result.col2Lang).toBe('en')
  })

  it('still separates English from Dutch now that a third candidate exists', () => {
    const result = detectLanguages(ENGLISH_DUTCH)
    expect(result.col1Lang).toBe('en')
    expect(result.col2Lang).toBe('nl')
  })

  /**
   * A short list of bare nouns is the hardest case: no function words at all, so
   * spelling is the only signal. It is also the case that made English needing
   * positive features of its own unavoidable — with none, English scored zero and
   * lost to any language that happened to score anything.
   */
  it('handles a short Dutch/English noun list in either direction', () => {
    const nouns = rows(['dochter', 'daughter'], ['tweeling', 'twins'])
    expect(detectLanguages(nouns)).toMatchObject({ col1Lang: 'nl', col2Lang: 'en' })

    const flipped = nouns.map((r) => ({ col1: r.col2, col2: r.col1 }))
    expect(detectLanguages(flipped)).toMatchObject({ col1Lang: 'en', col2Lang: 'nl' })
  })

  /*
   * This used to read "never returns the same language for both columns, whatever the
   * input", and was enforced by excluding the identical pairs from the candidate set. A
   * word-and-explanation list is one language on both sides, so those pairs have to be
   * candidates — which means the guarantee now has to come from the SCORES rather than
   * from the candidate set. These two check it still holds where it should.
   */
  it('still separates a translation list into two languages', () => {
    for (const input of [DUTCH_FRENCH, ENGLISH_DUTCH, rows(['la porte', 'the door'])]) {
      const result = detectLanguages(input)
      expect(result.col1Lang).not.toBe(result.col2Lang)
    }
  })

  it('reads a word and its explanation as one language', () => {
    const result = detectLanguages(
      rows(
        ['de tweeling', 'twee kinderen die op dezelfde dag geboren zijn'],
        ['de dochter', 'het meisje van je ouders'],
        ['grootouders', 'de ouders van je vader of je moeder'],
      ),
    )
    expect(result.source).toBe('heuristic')
    expect(result.col1Lang).toBe('nl')
    expect(result.col2Lang).toBe('nl')
  })

  it('refuses to guess when no assignment stands out', () => {
    // No tokens the profiles recognize at all, so every assignment ties at zero —
    // including the identical ones, which is the case this has to keep covering.
    const result = detectLanguages(rows(['xyz', 'xyz'], ['qqq', 'zzz']))
    expect(result.source).toBe('default')
  })
})

describe('detectLanguages — default fallback', () => {
  it('defaults to English then Dutch for empty input', () => {
    const result = detectLanguages([])
    expect(result.source).toBe('default')
    expect(result.col1Lang).toBe('en')
    expect(result.col2Lang).toBe('nl')
  })

  it('defaults when the columns are indistinguishable', () => {
    const result = detectLanguages(rows(['xyz', 'xyz'], ['qqq', 'qqq']))
    expect(result.source).toBe('default')
    expect(result.col1Lang).toBe('en')
    expect(result.col2Lang).toBe('nl')
  })
})
