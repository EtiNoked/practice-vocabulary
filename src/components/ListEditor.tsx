import { memo, useCallback, useMemo, useState } from 'react'
import { LANG_CODES, LANG_NAMES, type LangCode } from '../lang/languages'
import { detectLanguages } from '../parse/languageDetect'
import { countComplete, isComplete, normalizeRows } from '../parse/normalize'
import { isGuessed, type LangSource, type RawRow } from '../parse/types'
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
  initialLangSource?: LangSource
  onConfirm: (list: WordList) => void
  onCancel: () => void
}

const emptyRow = (): RawRow => ({ col1: '', col2: '' })

let idCounter = 0
const nextId = () => `p${Date.now().toString(36)}${(idCounter++).toString(36)}`

/**
 * One row of the table. Memoised so a keystroke re-renders a single row rather
 * than a 200-row list.
 */
const Row = memo(function Row({
  row,
  index,
  onChange,
  onDelete,
}: {
  row: RawRow
  index: number
  onChange: (index: number, patch: Partial<RawRow>) => void
  onDelete: (index: number) => void
}) {
  const incomplete = !isComplete(row) && (row.col1 !== '' || row.col2 !== '')
  return (
    <li className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <input
        data-cell="col1"
        aria-label={`Row ${index + 1} column 1`}
        value={row.col1}
        onChange={(e) => onChange(index, { col1: e.target.value })}
        className="min-h-11 flex-1 rounded border border-line-strong px-2"
      />
      <input
        data-cell="col2"
        aria-label={`Row ${index + 1} column 2`}
        value={row.col2}
        onChange={(e) => onChange(index, { col2: e.target.value })}
        className="min-h-11 flex-1 rounded border border-line-strong px-2"
      />
      <span className="w-24 shrink-0 text-xs text-accent">
        {incomplete ? 'Incomplete' : ''}
      </span>
      <button
        type="button"
        aria-label={`Delete row ${index + 1}`}
        onClick={() => onDelete(index)}
        className="min-h-11 min-w-11 rounded border border-line-strong"
      >
        ✕
      </button>
    </li>
  )
})

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
   * A language choice the user made, which outranks detection.
   *
   * Starts populated only when reopening a list that was set manually — a list
   * whose languages were detected should go on being detected, so that editing
   * its rows can still correct a bad guess.
   */
  const [override, setOverride] = useState<{ col1: LangCode; col2: LangCode } | null>(
    initialLangSource === 'manual' && initialLangs ? initialLangs : null,
  )

  // Detection runs on the live rows, so the badge reflects what the user has
  // typed right now — including a header row they just added to correct a guess.
  const detection = useMemo(() => detectLanguages(normalizeRows(rows)), [rows])

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
    : detection

  const bodyRows = effective.headerConsumed ? rows.slice(1) : rows
  const completeCount = countComplete(bodyRows)

  /**
   * Set one column's language, moving the other out of the way if it already
   * held that language. An exchange rather than a rejection: a user setting both
   * columns to the same language is almost always trying to swap them.
   */
  const chooseLang = useCallback(
    (column: 'col1' | 'col2', lang: LangCode) => {
      setDirty(true)
      setOverride((current) => {
        const base = current ?? { col1: effective.col1Lang, col2: effective.col2Lang }
        const other = column === 'col1' ? 'col2' : 'col1'
        return base[other] === lang
          ? { ...base, [column]: lang, [other]: base[column] }
          : { ...base, [column]: lang }
      })
    },
    [effective.col1Lang, effective.col2Lang],
  )

  /**
   * Exchange both the column contents and their languages.
   *
   * Setting the override is not optional: swapping only the contents lets the
   * next detection pass swap the languages straight back, and the two changes
   * cancel out into a button that appears to do nothing.
   */
  const handleSwap = useCallback(() => {
    setDirty(true)
    // Spread the row so RawRow.conf survives — it is reserved for the OCR path.
    setRows((current) => current.map((r) => ({ ...r, col1: r.col2, col2: r.col1 })))
    setOverride({ col1: effective.col2Lang, col2: effective.col1Lang })
  }, [effective.col1Lang, effective.col2Lang])

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

  const handleDelete = useCallback((index: number) => {
    setDirty(true)
    setRows((current) => {
      const next = current.filter((_, i) => i !== index)
      return next.length > 0 ? next : [emptyRow()]
    })
  }, [])

  const handleAddPasted = useCallback((added: RawRow[]) => {
    setDirty(true)
    setRows((current) => {
      // Drop a trailing blank row so pasted rows do not leave a gap.
      const kept = current.filter((r) => r.col1.trim() !== '' || r.col2.trim() !== '')
      return [...kept, ...added, emptyRow()]
    })
  }, [])

  function handleCancel() {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return
    onCancel()
  }

  function handleConfirm() {
    const clean = normalizeRows(rows)
    // Re-detected on the CLEAN rows, which is what makes typing a header row a
    // working correction. The override still wins over its languages.
    const detected = detectLanguages(clean)
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
        Column 1 {LANG_NAMES[effective.col1Lang]} → Column 2 {LANG_NAMES[effective.col2Lang]} 🔊
        {guessed && ' (guessed)'}
      </p>
      {guessed && (
        <p className="mt-1 text-xs text-ink-muted">
          Not right? Pick the languages below — or name them in a first row.
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-end gap-3">
        {(['col1', 'col2'] as const).map((column) => (
          <div key={column} className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor={`lang-${column}`}>
              {column === 'col1' ? 'Column 1 language' : 'Column 2 language'}
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
        <span className="flex-1">Column 1 — the answer</span>
        <span className="flex-1">Column 2 — spoken aloud</span>
        <span className="w-24" />
        <span className="w-11" />
      </div>

      <ul className="mt-1 flex flex-col gap-2">
        {rows.map((row, index) => (
          <Row
            key={index}
            row={row}
            index={index}
            onChange={handleChange}
            onDelete={handleDelete}
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
        <span className="text-sm text-ink-muted">
          {completeCount} complete {completeCount === 1 ? 'pair' : 'pairs'}
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
          Start practice
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
