/**
 * Single source of truth for everything language-related.
 *
 * Language identity shows up in three places — the BCP-47 tag handed to the speech
 * synthesiser, the header words we match when detecting columns, and the marker
 * words the heuristic scores against. Keeping them in one file is what stops those
 * three drifting apart.
 */

export type LangCode = 'en' | 'nl'

export const LANG_CODES: readonly LangCode[] = ['en', 'nl'] as const

/** BCP-47 tag used for SpeechSynthesisUtterance.lang. */
export const BCP47: Record<LangCode, string> = {
  en: 'en-GB',
  nl: 'nl-NL',
}

export const LANG_NAMES: Record<LangCode, string> = {
  en: 'English',
  nl: 'Dutch',
}

/**
 * Words that identify a column header, in either language. Matched fuzzily
 * (Levenshtein <= 2) so a typo like "Engish" still resolves.
 */
export const HEADER_ALIASES: Record<LangCode, readonly string[]> = {
  en: ['english', 'engels', 'eng'],
  nl: ['dutch', 'nederlands', 'hollands', 'ned'],
}

/**
 * Marker words for the heuristic fallback, used when no header row is present.
 * These are high-frequency function words that rarely appear in the other language.
 */
export const MARKER_WORDS: Record<LangCode, readonly string[]> = {
  en: ['the', 'to', 'my', 'is', 'are', 'of', 'and', 'a', 'in', 'with', 'you', 'he', 'she', 'was'],
  nl: ['de', 'het', 'een', 'van', 'niet', 'zijn', 'ik', 'je', 'en', 'te', 'dat', 'op', 'voor', 'met'],
}

/**
 * Character sequences that are far more common in Dutch than English. Scored in
 * addition to marker words, because a short vocabulary list may contain no
 * function words at all — "dochter / daughter" has none.
 */
export const DUTCH_DIGRAPHS: readonly string[] = ['ij', 'ui', 'oe', 'aa', 'ee', 'oo', 'eu', 'sch']

/** Dutch verbs in a vocabulary list are usually infinitives ending in -en. */
export const DUTCH_SUFFIXES: readonly string[] = ['en', 'je', 'tje']
