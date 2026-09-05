import { memo, useCallback, useMemo, useState } from 'react'
import { LANG_NAMES } from '../lang/languages'
import { detectLanguages } from '../parse/languageDetect'
import { countComplete, isComplete, normalizeRows } from '../parse/normalize'
import type { RawRow } from '../parse/types'
import type { WordList, WordPair } from '../state/types'
import { PastePanel } from './PastePanel'

const LONG_LIST_WARNING = 200

interface Props {
  mode: 'create' | 'update'
  initialRows: RawRow[]
  initialName?: string
  listId?: string
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
        className="min-h-11 flex-1 rounded border border-slate-300 px-2 dark:border-slate-600 dark:bg-slate-800"
      />
      <input
        data-cell="col2"
        aria-label={`Row ${index + 1} column 2`}
        value={row.col2}
        onChange={(e) => onChange(index, { col2: e.target.value })}
        className="min-h-11 flex-1 rounded border border-slate-300 px-2 dark:border-slate-600 dark:bg-slate-800"
      />
      <span className="w-24 shrink-0 text-xs text-amber-700 dark:text-amber-400">
        {incomplete ? 'Incomplete' : ''}
      </span>
      <button
        type="button"
        aria-label={`Delete row ${index + 1}`}
        onClick={() => onDelete(index)}
        className="min-h-11 min-w-11 rounded border border-slate-300 dark:border-slate-600"
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

  // Detection runs on the live rows, so the badge reflects what the user has
  // typed right now — including a header row they just added to correct a guess.
  const detection = useMemo(() => detectLanguages(normalizeRows(rows)), [rows])
  const bodyRows = detection.headerConsumed ? rows.slice(1) : rows
  const completeCount = countComplete(bodyRows)

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
      col1Lang: detected.col1Lang,
      col2Lang: detected.col2Lang,
      langSource: detected.source,
      pairs,
      createdAt: now,
      updatedAt: now,
      origin: 'manual',
    })
  }

  const guessed = detection.source !== 'header'

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
        className="mt-1 min-h-11 w-full rounded border border-slate-300 px-2 dark:border-slate-600 dark:bg-slate-800"
      />

      <p
        className={`mt-3 inline-block rounded px-2 py-1 text-sm ${
          guessed
            ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
            : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
        }`}
      >
        Column 1 {LANG_NAMES[detection.col1Lang]} → Column 2 {LANG_NAMES[detection.col2Lang]} 🔊
        {guessed && ' (guessed)'}
      </p>
      {guessed && (
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Add a first row reading “English” and “Dutch” to set this exactly.
        </p>
      )}

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
          className="min-h-11 rounded border border-slate-300 px-3 dark:border-slate-600"
        >
          Add row
        </button>
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="min-h-11 rounded border border-slate-300 px-3 dark:border-slate-600"
        >
          Paste or import a list
        </button>
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {completeCount} complete {completeCount === 1 ? 'pair' : 'pairs'}
        </span>
      </div>

      {rows.length > LONG_LIST_WARNING && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
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
          className="min-h-11 rounded bg-emerald-700 px-4 text-white disabled:opacity-40"
        >
          Start practice
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="min-h-11 rounded border border-slate-300 px-4 dark:border-slate-600"
        >
          Cancel
        </button>
      </div>
    </section>
  )
}
