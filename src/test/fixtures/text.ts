/**
 * Text fixtures for textParse. Real English/Dutch pairs shaped like a school
 * textbook vocabulary table, so the parser is exercised against realistic input.
 */

/** Pasting from Excel / Google Sheets. The common case. */
export const TAB_SIMPLE = `daughter\tdochter
to die\tdoodgaan
to be born\tgeboren worden
family\tgezin; familie
grandparents\tgrootouders`

/** Header line the parser should consume for language detection, not treat as a pair. */
export const TAB_WITH_HEADER = `English\tDutch
daughter\tdochter
to die\tdoodgaan`

/**
 * The case that breaks a naive `line.split(',')`: the second column contains commas.
 * Splitting on the FIRST comma only is what keeps these intact.
 */
export const COMMA_WITH_COMMAS_IN_COL2 = `niece,My sibling's daughter, my niece
cousin,My aunt's child, my cousin
nephew,My sibling's son, my nephew`

/** Properly quoted CSV, as exported by most spreadsheet tools. */
export const QUOTED_CSV = `"cousin (male, female)","neef, nicht"
"to look alike","op elkaar lijken"
"grandparents","grootouders"`

export const SEMICOLON = `uncle;oom
aunt;tante
son;zoon`

export const DASH_SEPARATED = `older - ouder
oldest - oudste
younger - jonger`

export const EQUALS_SEPARATED = `married = getrouwd
divorced = gescheiden`

/** Two-or-more spaces, as produced by copying from a fixed-width PDF. */
export const MULTI_SPACE = `twins     tweeling
sibling   broer; zus
only      enig`

/**
 * No consistent separator. Detection must fall BELOW the 0.6 confidence floor
 * and refuse to guess rather than silently mangling the list.
 */
export const AMBIGUOUS = `daughter dochter
to die, doodgaan
family\tgezin
grandparents
tante`

/** Lines yielding only one field — kept as incomplete rows, never dropped. */
export const SINGLE_FIELD_LINES = `daughter\tdochter
justonewordhere
to die\tdoodgaan`

/** Windows line endings plus a UTF-8 BOM, as produced by Excel's "Save as CSV". */
export const BOM_AND_CRLF = '﻿daughter,dochter\r\nto die,doodgaan\r\nfamily,gezin\r\n'

/** Trailing blank lines and stray whitespace from a sloppy copy-paste. */
export const TRAILING_BLANKS = `daughter\tdochter
to die\tdoodgaan


   
`

/** A Dutch-first list, to prove language detection is not positional. */
export const DUTCH_FIRST_WITH_HEADER = `Nederlands\tEngels
dochter\tdaughter
doodgaan\tto die`

export const EMPTY = ''
export const WHITESPACE_ONLY = '   \n\t\n  \n'
