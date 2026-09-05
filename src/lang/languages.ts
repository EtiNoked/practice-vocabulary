/**
 * Single source of truth for everything language-related.
 *
 * Language identity shows up in four places — the BCP-47 tag handed to the speech
 * synthesiser, the display name, the header words we match when detecting columns,
 * and the spelling profile the heuristic scores against. Keeping them in one file
 * is what stops those four drifting apart.
 *
 * ADDING A LANGUAGE is deliberately a data change: one entry in each of the four
 * records below, and nothing anywhere else. `languages.test.ts` fails if an entry
 * is missing from any of them, or present in one and not the others.
 */

export type LangCode = 'en' | 'nl' | 'fr'

/**
 * The enumeration every consumer iterates. Nothing outside this file may write
 * a literal list of language codes — that is precisely how the two-language
 * assumption got baked into the detector in the first place.
 */
export const LANG_CODES: readonly LangCode[] = ['en', 'nl', 'fr'] as const

/** BCP-47 tag used for SpeechSynthesisUtterance.lang. */
export const BCP47: Record<LangCode, string> = {
  en: 'en-GB',
  nl: 'nl-NL',
  fr: 'fr-FR',
}

export const LANG_NAMES: Record<LangCode, string> = {
  en: 'English',
  nl: 'Dutch',
  fr: 'French',
}

/**
 * Words that identify a column header, in any of the languages. Matched fuzzily
 * (Levenshtein, budget scaled to alias length) so a typo like "Engish" resolves.
 *
 * `franais` is NOT a typo. `matchHeaderCell` strips everything outside [a-z]
 * before matching, so a user who types "français" arrives here as "franais" with
 * the cedilla gone. "francais" covers the accent-free spelling people also use.
 */
export const HEADER_ALIASES: Record<LangCode, readonly string[]> = {
  en: ['english', 'engels', 'eng'],
  nl: ['dutch', 'nederlands', 'hollands', 'ned'],
  fr: ['french', 'frans', 'francais', 'franais', 'fr'],
}

/**
 * What a language looks like on the page, for the detection heuristic.
 *
 * Three signals of decreasing strength. A school vocabulary list is mostly content
 * words and may contain no function words at all — "dochter / daughter" has none —
 * which is why spelling carries as much weight as it does.
 */
export interface LangProfile {
  /** High-frequency function words. Strongest signal when present. */
  markers: readonly string[]
  /** Character sequences characteristic of the language's spelling. */
  digraphs: readonly string[]
  /** Word endings common in dictionary and infinitive forms. Weakest signal. */
  suffixes: readonly string[]
}

/**
 * Overlap between profiles is expected and harmless. "de" is as Dutch as it is
 * French; "je" belongs to both. Because each language is scored INDEPENDENTLY and
 * the winning pair is chosen jointly (see languageDetect.ts), a shared marker
 * lifts both candidates equally and cancels out of the comparison between them —
 * while still separating both from a language that lacks it.
 *
 * So: list what is actually frequent in each language. Do not hand-prune overlaps.
 */
export const PROFILES: Record<LangCode, LangProfile> = {
  en: {
    markers: [
      'the', 'to', 'my', 'is', 'are', 'of', 'and', 'a',
      'in', 'with', 'you', 'he', 'she', 'was',
    ],
    /**
     * English needs positive evidence of its own, and did not have any while the
     * detector was binary — "not Dutch" was enough. With three candidates a
     * language that can only score zero loses to whichever rival happens to score
     * anything, so a short English/Dutch noun list resolved at random.
     *
     * Deliberately absent: 'ea', which is a substring of the very common French
     * 'eau' (beau, cadeau, l'eau) and would fire on French throughout.
     */
    digraphs: ['th', 'gh', 'wh', 'ck', 'sh', 'oa', 'ay'],
    /**
     * Deliberately absent: 'ing'. It is the obvious English ending and also the
     * ending of half the Dutch nouns this app is used on — tweeling, wandeling,
     * regering, oplossing.
     */
    suffixes: ['ly', 'ness', 'ful', 'ship'],
  },
  nl: {
    markers: [
      'de', 'het', 'een', 'van', 'niet', 'zijn', 'ik', 'je',
      'en', 'te', 'dat', 'op', 'voor', 'met',
    ],
    // Far more common in Dutch than in English. Carries a short noun list, where
    // "dochter / daughter" offers no function word to go on.
    digraphs: ['ij', 'ui', 'oe', 'aa', 'ee', 'oo', 'eu', 'sch'],
    // Dutch verbs in a vocabulary list are usually infinitives ending in -en.
    suffixes: ['en', 'je', 'tje'],
  },
  fr: {
    markers: [
      'le', 'la', 'les', 'un', 'une', 'de', 'du', 'des',
      'est', 'et', 'dans', 'pour', 'avec', 'je', 'il', 'elle',
      'ne', 'pas', 'que', 'qui', 'ce', 'sur', 'son', 'sa', 'au', 'aux',
    ],
    /**
     * The accents do the heavy lifting. Neither English nor Dutch vocabulary uses
     * é è ê ç à in any quantity, so one accented character is stronger evidence
     * than any function word — and it survives on a list of bare nouns.
     *
     * Deliberately absent: 'ai' (English "said", "rain", "again" are far too
     * common) and 'qu' (English "question", "quick"). Both would fire on English.
     */
    digraphs: ['é', 'è', 'ê', 'ç', 'à', 'â', 'ô', 'û', 'ù', 'ï', 'eau', 'oi', 'gn', 'ill', 'eux'],
    /**
     * Deliberately absent: 'er' and 'ir'. French infinitives end that way, but so
     * do "daughter", "water", "dochter" and "ouders" — the false-positive rate on
     * exactly the lists this app is used for makes them worse than useless.
     */
    suffixes: ['tion', 'ment', 'eux', 'euse', 'ée', 'ais', 'ait', 'ez'],
  },
}
