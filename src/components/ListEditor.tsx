import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LANG_CODES, LANG_NAMES, type LangCode } from '../lang/languages'
import { translate } from '../translate/translator'
import { useTranslationMode, webTranslateUrl, type TranslationMode } from '../translate/useTranslation'
import { detectLanguages, type LanguageDetection } from '../parse/languageDetect'
import { findDuplicates } from '../parse/duplicates'
import { sortRows } from '../parse/sortRows'
import { countComplete, isComplete, normalizeRows } from '../parse/normalize'
import { isGuessed, SOURCE_RANK, type LangSource, type RawRow } from '../parse/types'
import type { WordList, WordPair } from '../state/types'
import { PastePanel } from './PastePanel'

const LONG_LIST_WARNING = 200

interface Props {
  mode: 'create' | 'update'
  initialRows: RawRow[]
  initialName?: string
  listId?: string
  /**
   * The languages a saved list was stored with. Without these, reopening a list
   * re-detects from its rows and throws away a choice the user already made.
   */
  initialLangs?: { col1: LangCode; col2: LangCode }
  /** How those languages were arrived at. Decides whether re-detection may win. */
  initialLangSource?: LangSource
  onConfirm: (list: WordList) => void
  onCancel: () => void
}

const emptyRow = (): RawRow => ({ col1: '', col2: '' })

let idCounter = 0
const nextId = () => `p${Date.now().toString(36)}${(idCounter++).toString(36)}`

/**
 * What the one row currently being translated has to say for itself.
 *
 * At most one row holds this at a time, and every other row is passed `undefined`,
 * which is what lets an object prop live alongside `memo`: the identity changes for
 * the active row and stays `undefined` — and so compares equal — for the rest.
 */
interface RowTranslation {
  /** Which cell the suggestion is for. */
  column: 'col1' | 'col2'
  /** What the row is doing right now, shown while it does it. */
  busy?: string
  /** The translation on offer, awaiting Use or Dismiss. */
  suggestion?: string
  /** The language the suggestion is in, named so the offer says what it is. */
  label?: string
  /** The suggestion is what the cell already says, so there is nothing to apply. */
  matches?: boolean
  error?: string
}

/**
 * One row of the table. Memoised so a keystroke re-renders a single row rather
 * than a 200-row list.
 */
const Row = memo(function Row({
  row,
  index,
  duplicate,
  translateMode,
  col1Lang,
  col2Lang,
  translation,
  onChange,
  onDelete,
  onTranslate,
  onUseSuggestion,
  onDismissSuggestion,
}: {
  row: RawRow
  index: number
  /** Why this row repeats an earlier one, if it does. A string so memo can compare it. */
  duplicate: string | undefined
  /** Whether, and how, this browser can translate this list's pair of languages. */
  translateMode: TranslationMode
  col1Lang: LangCode
  col2Lang: LangCode
  /** Set only on the row being translated; `undefined` everywhere else. */
  translation: RowTranslation | undefined
  onChange: (index: number, patch: Partial<RawRow>) => void
  onDelete: (index: number) => void
  onTranslate: (index: number) => void
  onUseSuggestion: () => void
  onDismissSuggestion: () => void
}) {
  const incomplete = !isComplete(row) && (row.col1 !== '' || row.col2 !== '')
  const empty = row.col1.trim() === '' && row.col2.trim() === ''
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        {/*
          `col2` FIRST: it is the word being learnt — spoken, tested, sorted by — and the
          word you are learning is the one you reach for first (017). The field names are
          historical and no longer track position; `data-cell` names the field, which is
          what every test addresses a cell by.
        */}
        <input
          data-cell="col2"
          aria-label={`Row ${index + 1} word`}
          value={row.col2}
          onChange={(e) => onChange(index, { col2: e.target.value })}
          className="min-h-11 flex-1 rounded border border-line-strong px-2"
        />
        <input
          data-cell="col1"
          aria-label={`Row ${index + 1} meaning`}
          value={row.col1}
          onChange={(e) => onChange(index, { col1: e.target.value })}
          className="min-h-11 flex-1 rounded border border-line-strong px-2"
        />
        <span className="w-24 shrink-0 text-xs text-accent">
          {incomplete ? 'Incomplete' : ''}
        </span>
        {translateMode === 'web' && (
          /*
            No on-device translator here (phones, Safari, Firefox), so the same button opens
            Google Translate on this row's word instead. The direction follows the same rule
            as the built-in one: the word into its meaning, or the meaning into the word while
            the word is still empty. Nothing is sent anywhere until the user taps it.
          */
          <a
            aria-label={`Translate row ${index + 1} in Google Translate`}
            title="Look this up in Google Translate"
            aria-disabled={empty}
            href={
              empty
                ? undefined
                : row.col2.trim() !== ''
                  ? webTranslateUrl(row.col2, col2Lang, col1Lang)
                  : webTranslateUrl(row.col1, col1Lang, col2Lang)
            }
            target="_blank"
            rel="noopener noreferrer"
            className={`grid min-h-11 min-w-11 place-items-center rounded border border-line-strong ${empty ? 'pointer-events-none opacity-40' : ''}`}
          >
            🌐
          </a>
        )}
        {translateMode === 'built-in' && (
          <button
            type="button"
            aria-label={`Translate row ${index + 1}`}
            title="Suggest a translation for this row"
            disabled={empty || translation?.busy !== undefined}
            onClick={() => onTranslate(index)}
            className="min-h-11 min-w-11 rounded border border-line-strong disabled:opacity-40"
          >
            🌐
          </button>
        )}
        <button
          type="button"
          aria-label={`Delete row ${index + 1}`}
          onClick={() => onDelete(index)}
          className="min-h-11 min-w-11 rounded border border-line-strong"
        >
          ✕
        </button>
      </div>
      {duplicate && (
        <p role="status" className="text-xs text-accent">
          Duplicate: {duplicate}
        </p>
      )}
      {translation?.busy !== undefined && (
        <p role="status" className="text-xs text-ink-muted">
          {translation.busy}
        </p>
      )}
      {translation?.error !== undefined && (
        <p role="status" className="text-xs text-accent">
          {translation.error}
        </p>
      )}
      {/*
        The suggestion never writes itself into the cell. A machine translation of a
        single word is a guess between senses the word has — "de bank" is a bench and
        a bank, and only the person holding the textbook knows which one this list
        means — so it is offered next to the row and applied by a deliberate click.
      */}
      {translation?.suggestion !== undefined &&
        (translation.matches ? (
          <p role="status" className="text-xs text-ink-muted">
            Suggested {translation.label}: “{translation.suggestion}” — the same as what you
            have.
          </p>
        ) : (
          <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
            <span>
              Suggested {translation.label}: <strong>{translation.suggestion}</strong>
            </span>
            <button
              type="button"
              aria-label={`Use the suggestion for row ${index + 1}`}
              onClick={onUseSuggestion}
              className="min-h-11 rounded bg-primary px-3 text-primary-ink"
            >
              Use
            </button>
            <button
              type="button"
              aria-label={`Dismiss the suggestion for row ${index + 1}`}
              onClick={onDismissSuggestion}
              className="min-h-11 rounded border border-line-strong px-3"
            >
              Dismiss
            </button>
          </div>
        ))}
    </li>
  )
})

/** The languages a reopened list was saved with, if it was ever saved. */
interface StoredLangs {
  col1: LangCode
  col2: LangCode
  source: LangSource
}

/**
 * Decide between what the rows look like now and what the list was saved with.
 *
 * Re-detection wins only when it is at least as authoritative as the stored
 * source, which is what lets editing rows correct a bad guess while stopping a
 * weaker guess from undoing a settled one.
 *
 * The case this exists for: a list saved from a header row keeps no header — it
 * was consumed into the languages — so reopening it re-detects from the words
 * alone. On a list the heuristic cannot call, that lands on the plain en/nl
 * default, which is BACKWARDS for a Dutch-first list. Swapping the columns then
 * paired the reversed languages with the swapped rows, and update mode saved it
 * on the spot: the drill went on to label the Dutch word "English", read it in an
 * English voice, and there was no way to see why.
 *
 * `headerConsumed` always comes from detection: it answers "is row 0 a header?",
 * which is a question about the rows in front of us and not about the languages.
 */
function resolveLangs(detection: LanguageDetection, stored: StoredLangs | null) {
  if (!stored || SOURCE_RANK[detection.source] >= SOURCE_RANK[stored.source]) return detection
  return {
    col1Lang: stored.col1,
    col2Lang: stored.col2,
    source: stored.source,
    headerConsumed: detection.headerConsumed,
  }
}

/**
 * The single editor, shared by "new list" and "edit a saved list".
 *
 * The only difference between entry points is the `mode` prop, which decides
 * whether confirming mints a new id or updates an existing one. There is no
 * branching on entry point anywhere else, which is what keeps the two paths
 * behaving identically.
 */
export function ListEditor({
  mode,
  initialRows,
  initialName,
  listId,
  initialLangs,
  initialLangSource,
  onConfirm,
  onCancel,
}: Props) {
  const [rows, setRows] = useState<RawRow[]>(
    initialRows.length > 0 ? initialRows : [emptyRow()],
  )
  const [name, setName] = useState(
    initialName ?? `List ${new Date().toLocaleDateString('en-GB')}`,
  )
  const [dirty, setDirty] = useState(false)
  const [showPaste, setShowPaste] = useState(false)

  /**
   * A language choice the user made IN THIS EDITING SESSION, which outranks
   * everything else.
   *
   * Starts empty even when reopening a manually-set list: a stored 'manual'
   * source already outranks anything detection can produce (see `resolveLangs`),
   * so seeding it here would only duplicate that rule in a second place.
   */
  const [override, setOverride] = useState<{ col1: LangCode; col2: LangCode } | null>(null)

  const stored: StoredLangs | null =
    initialLangs && initialLangSource
      ? { col1: initialLangs.col1, col2: initialLangs.col2, source: initialLangSource }
      : null

  // Detection runs on the live rows, so the badge reflects what the user has
  // typed right now — including a header row they just added to correct a guess.
  const detection = useMemo(() => detectLanguages(normalizeRows(rows)), [rows])
  const resolved = resolveLangs(detection, stored)

  /**
   * What the UI shows and what gets saved.
   *
   * `headerConsumed` deliberately still comes from DETECTION even when the
   * languages are overridden. It answers "is row 0 a header?", which is a question
   * about the rows and not about the languages — taking it from the override
   * would re-admit the header row as a practisable pair.
   */
  const effective = override
    ? {
        col1Lang: override.col1,
        col2Lang: override.col2,
        source: 'manual' as LangSource,
        headerConsumed: detection.headerConsumed,
      }
    : resolved

  const bodyRows = effective.headerConsumed ? rows.slice(1) : rows
  const completeCount = countComplete(bodyRows)

  /**
   * The one suggestion in flight, or on offer, at any moment.
   *
   * Singular on purpose. Translating is a click, not a background sweep, and a
   * single pending offer is both what the user has in their head and what keeps
   * `index` meaningful — see the operations below that clear it when the rows move
   * underneath it.
   */
  const [translation, setTranslation] = useState<({ index: number } & RowTranslation) | null>(null)

  /**
   * Rows and the pending suggestion, readable from a click handler without becoming
   * a dependency of one.
   *
   * `handleTranslate` needs the row it was clicked on. Taking `rows` as a dependency
   * would mint a new callback on every keystroke and hand all 200 memoised rows a new
   * prop — undoing the very thing `Row`'s `memo` is there for. The same goes for
   * reading the pending suggestion back when Use is clicked.
   */
  const rowsRef = useRef(rows)
  const translationRef = useRef(translation)
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])
  useEffect(() => {
    translationRef.current = translation
  }, [translation])

  /** Distinguishes the reply to the latest click from a slower earlier one. */
  const requestRef = useRef(0)

  const translateMode = useTranslationMode(effective.col2Lang, effective.col1Lang)

  /**
   * Offer a translation for one row.
   *
   * Direction follows the ROLES the fields have, never where they are drawn: `col2` is
   * the word being learned and `col1` is what it means. So a filled word is translated
   * into its meaning — which fills the blank in the common case of typing the foreign
   * words first, and second-guesses the answer when both are filled. Only a row whose
   * word is still empty runs the other way.
   *
   * Stating it in roles is what let 017 reverse the drawn order without touching a line
   * of this: since the word is now drawn FIRST, the same rule reads as "fill the box to
   * the right", which is also the direction someone typing a list expects.
   */
  const handleTranslate = useCallback(
    (index: number) => {
      const row = rowsRef.current[index]
      if (!row) return

      const toCol1 = row.col2.trim() !== ''
      const source = toCol1 ? row.col2 : row.col1
      if (source.trim() === '') return

      const column = toCol1 ? 'col1' : 'col2'
      const from = toCol1 ? effective.col2Lang : effective.col1Lang
      const to = toCol1 ? effective.col1Lang : effective.col2Lang

      const request = ++requestRef.current
      const current = () => requestRef.current === request
      setTranslation({ index, column, busy: 'Translating…' })

      void translate(source, from, to, (loaded) => {
        // First use of a language pair downloads a model, which can be tens of
        // megabytes. Silence for that long reads as a button that did nothing.
        if (current()) {
          setTranslation({
            index,
            column,
            busy: `Downloading the translator… ${Math.round(loaded * 100)}%`,
          })
        }
      })
        .then((text) => {
          if (!current()) return
          const existing = (rowsRef.current[index]?.[column] ?? '').trim()
          setTranslation({
            index,
            column,
            suggestion: text,
            label: LANG_NAMES[to],
            matches: existing !== '' && existing.toLowerCase() === text.toLowerCase(),
          })
        })
        .catch(() => {
          if (!current()) return
          setTranslation({
            index,
            column,
            error: 'Could not translate that just now. Type it yourself, or try again.',
          })
        })
    },
    [effective.col1Lang, effective.col2Lang],
  )

  const handleDismissSuggestion = useCallback(() => {
    // Bumped so a reply still in flight cannot resurrect what was just dismissed.
    requestRef.current++
    setTranslation(null)
  }, [])

  // A header row names the languages, so it is not a word that can be repeated.
  const duplicates = useMemo(
    () => findDuplicates(rows, { skipFirst: effective.headerConsumed }),
    [rows, effective.headerConsumed],
  )

  /**
   * Set one column's language. Just that.
   *
   * It used to EXCHANGE the two when you picked the language the other column already
   * held, on the reasoning that a user setting both the same must be trying to swap them.
   * That reasoning has expired: a list may now explain its words in their own language —
   * `de tweeling` against `twee kinderen van dezelfde geboorte` — and the exchange made
   * that the one list the dropdowns refused to express.
   *
   * Swapping is still available, and was always the better route to it: **Swap columns ⇄**
   * moves the words along with their languages, which is what someone reaching for a swap
   * actually wants.
   */
  const chooseLang = useCallback((column: 'col1' | 'col2', lang: LangCode) => {
    setDirty(true)
    // A suggestion is a translation BETWEEN two named languages, and it announces
    // which. Renaming one of them leaves it describing itself wrongly — and on a list
    // just set to the same language on both sides, offering a translation at all.
    handleDismissSuggestion()
    setOverride((current) => {
      const base = current ?? { col1: effective.col1Lang, col2: effective.col2Lang }
      return { ...base, [column]: lang }
    })
  }, [effective.col1Lang, effective.col2Lang, handleDismissSuggestion])

  /**
   * Exchange both the column contents and their languages.
   *
   * Still means "I have put these the wrong way round" after 017, and now looks like it:
   * what is in the first box moves to the second, taking its language with it.
   *
   * Setting the override is not optional: swapping only the contents lets the
   * next detection pass swap the languages straight back, and the two changes
   * cancel out into a button that appears to do nothing.
   */
  const handleSwap = useCallback(() => {
    setDirty(true)
    // A suggestion names a row and a column, and swapping moves what is in both.
    handleDismissSuggestion()
    // Spread the row so RawRow.conf survives — it is reserved for the OCR path.
    setRows((current) => current.map((r) => ({ ...r, col1: r.col2, col2: r.col1 })))
    // Functional, like the rows above: two swaps that land in one batch must
    // exchange the languages twice as well, or the rows and the languages come
    // apart — which is the same reversal this whole path exists to prevent.
    setOverride((current) => {
      const base = current ?? { col1: effective.col1Lang, col2: effective.col2Lang }
      return { col1: base.col2, col2: base.col1 }
    })
  }, [effective.col1Lang, effective.col2Lang, handleDismissSuggestion])

  const handleChange = useCallback((index: number, patch: Partial<RawRow>) => {
    setDirty(true)
    setRows((current) => {
      const next = current.map((row, i) => (i === index ? { ...row, ...patch } : row))
      // Typing in the last row grows the table, so there is no "add row"
      // ceremony in the common case.
      const last = next[next.length - 1]
      if (last && (last.col1.trim() !== '' || last.col2.trim() !== '')) next.push(emptyRow())
      return next
    })
  }, [])

  /**
   * Accept the pending suggestion into its cell.
   *
   * Routed through `handleChange` rather than writing the row itself, so an accepted
   * suggestion is in every way an ordinary edit: it marks the list dirty and grows
   * the table if it landed in the last row, exactly as typing the word would have.
   */
  const handleUseSuggestion = useCallback(() => {
    const pending = translationRef.current
    if (!pending || pending.suggestion === undefined) return
    handleChange(pending.index, { [pending.column]: pending.suggestion })
    setTranslation(null)
  }, [handleChange])

  const handleDelete = useCallback(
    (index: number) => {
      setDirty(true)
      // The suggestion holds a row INDEX, and deleting shifts every index after it.
      handleDismissSuggestion()
      setRows((current) => {
        const next = current.filter((_, i) => i !== index)
        return next.length > 0 ? next : [emptyRow()]
      })
    },
    [handleDismissSuggestion],
  )

  /**
   * A to Z by the word column — the first one, the one read aloud — and only when asked: a
   * list kept in a textbook's order is kept that way until the user chooses otherwise. The
   * header row (if the first row names the languages) stays on top.
   */
  const handleSort = useCallback(() => {
    setDirty(true)
    // Sorting moves rows past each other, so a suggestion's index no longer points
    // at the row it was offered for.
    handleDismissSuggestion()
    setRows((current) => sortRows(current, 'col2', { keepFirst: effective.headerConsumed }))
  }, [effective.headerConsumed, handleDismissSuggestion])

  const handleAddPasted = useCallback(
    (added: RawRow[]) => {
      setDirty(true)
      // Pasting drops blank rows before appending, which shifts the rows below.
      handleDismissSuggestion()
      setRows((current) => {
        // Drop a trailing blank row so pasted rows do not leave a gap.
        const kept = current.filter((r) => r.col1.trim() !== '' || r.col2.trim() !== '')
        return [...kept, ...added, emptyRow()]
      })
    },
    [handleDismissSuggestion],
  )

  function handleCancel() {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return
    onCancel()
  }

  function handleConfirm() {
    const clean = normalizeRows(rows)
    // Re-detected on the CLEAN rows, which is what makes typing a header row a
    // working correction. The override still wins over its languages, and so do
    // the stored languages when re-detection is the weaker of the two.
    const detected = resolveLangs(detectLanguages(clean), stored)
    const body = detected.headerConsumed ? clean.slice(1) : clean
    const pairs: WordPair[] = body
      .filter(isComplete)
      .map((row) => ({ id: nextId(), col1: row.col1, col2: row.col2 }))

    const now = Date.now()
    onConfirm({
      // Update mode keeps the existing identity so listRepo.update matches it;
      // create mode mints a fresh one.
      id: mode === 'update' && listId ? listId : nextId(),
      name: name.trim() === '' ? 'Untitled list' : name.trim(),
      col1Lang: override ? override.col1 : detected.col1Lang,
      col2Lang: override ? override.col2 : detected.col2Lang,
      langSource: override ? 'manual' : detected.source,
      pairs,
      createdAt: now,
      updatedAt: now,
      origin: 'manual',
    })
  }

  const guessed = isGuessed(effective.source)

  return (
    <section className="mx-auto max-w-3xl p-4">
      <label className="block text-sm font-medium" htmlFor="list-name">
        List name
      </label>
      <input
        id="list-name"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setDirty(true)
        }}
        className="field mt-1"
      />

      <p
        className={`mt-3 inline-block rounded px-2 py-1 text-sm ${
          guessed
            ? 'bg-accent-soft text-ink'
            : 'bg-primary-soft text-ink'
        }`}
      >
        {LANG_NAMES[effective.col2Lang]} → {LANG_NAMES[effective.col1Lang]} 🔊
        {guessed && ' (guessed)'}
      </p>
      {guessed && (
        <p className="mt-1 text-xs text-ink-muted">
          Not right? Pick the languages below — or name them in a first row.
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-end gap-3">
        {/* Word language first, to match the order the boxes below are drawn in (017). */}
        {(['col2', 'col1'] as const).map((column) => (
          <div key={column} className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor={`lang-${column}`}>
              {column === 'col2' ? 'Word language' : 'Meaning language'}
            </label>
            <select
              id={`lang-${column}`}
              value={column === 'col1' ? effective.col1Lang : effective.col2Lang}
              onChange={(e) => chooseLang(column, e.target.value as LangCode)}
              className="min-h-11 rounded border border-line-strong px-2"
            >
              {LANG_CODES.map((code) => (
                <option key={code} value={code}>
                  {LANG_NAMES[code]}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          type="button"
          onClick={handleSwap}
          className="btn btn-quiet"
        >
          Swap columns ⇄
        </button>
      </div>

      <div className="mt-3 hidden gap-2 text-sm font-medium sm:flex">
        <span className="flex-1">Word — spoken aloud</span>
        <span className="flex-1">Meaning — the answer</span>
        <span className="w-24" />
        {(translateMode === 'built-in' || translateMode === 'web') && <span className="w-11" />}
        <span className="w-11" />
      </div>

      <ul className="mt-1 flex flex-col gap-2">
        {rows.map((row, index) => (
          <Row
            key={index}
            row={row}
            index={index}
            duplicate={duplicates.get(index)}
            translateMode={translateMode}
            col1Lang={effective.col1Lang}
            col2Lang={effective.col2Lang}
            translation={translation?.index === index ? translation : undefined}
            onChange={handleChange}
            onDelete={handleDelete}
            onTranslate={handleTranslate}
            onUseSuggestion={handleUseSuggestion}
            onDismissSuggestion={handleDismissSuggestion}
          />
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRows((c) => [...c, emptyRow()])
            setDirty(true)
          }}
          className="btn btn-quiet"
        >
          Add row
        </button>
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="btn btn-quiet"
        >
          Paste or import a list
        </button>
        {/*
          Sorts by the first column, the word read aloud: the one being learned, and the one to
          look words up by. A one-off action, not a setting: the rows then stay where they are.
        */}
        <button type="button" onClick={handleSort} className="btn btn-quiet">
          Sort A to Z
        </button>
        <span className="text-sm text-ink-muted">
          {completeCount} complete {completeCount === 1 ? 'pair' : 'pairs'}
          {duplicates.size > 0 && (
            <span className="text-accent">
              {' '}
              · {duplicates.size} {duplicates.size === 1 ? 'duplicate' : 'duplicates'}
            </span>
          )}
        </span>
      </div>

      {rows.length > LONG_LIST_WARNING && (
        <p className="mt-2 text-sm text-accent">
          That&apos;s a long list — it may feel slow to edit on a phone.
        </p>
      )}

      {showPaste && (
        <div className="mt-3">
          <PastePanel onAdd={handleAddPasted} />
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          disabled={completeCount === 0}
          onClick={handleConfirm}
          className="min-h-11 rounded bg-primary px-4 text-primary-ink disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="min-h-11 rounded border border-line-strong px-4"
        >
          Cancel
        </button>
      </div>
    </section>
  )
}
