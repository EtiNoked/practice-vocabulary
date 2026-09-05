import { useMemo, useState } from 'react'
import { countComplete } from '../parse/normalize'
import {
  CONFIDENCE_FLOOR,
  DELIMITERS,
  DELIMITER_LABELS,
  type Delimiter,
  detectDelimiter,
  parseDelimited,
} from '../parse/textParse'
import type { RawRow } from '../parse/types'

const MAX_FILE_BYTES = 1024 * 1024

interface Props {
  /** Appends to the caller's rows — never replaces them. */
  onAdd: (rows: RawRow[]) => void
}

/**
 * Bulk entry: paste many lines at once, or upload a .csv/.tsv/.txt file.
 *
 * Both routes go through the same two functions in textParse, so a file and a
 * paste of the same content always produce identical rows.
 */
export function PastePanel({ onAdd }: Props) {
  const [text, setText] = useState('')
  const [override, setOverride] = useState<Delimiter | ''>('')
  const [fileError, setFileError] = useState<string | null>(null)

  const detection = useMemo(() => detectDelimiter(text), [text])
  const active: Delimiter | null = override === '' ? detection.delimiter : override
  const rows = useMemo(
    () => (active && text.trim() !== '' ? parseDelimited(text, active) : []),
    [text, active],
  )

  const complete = countComplete(rows)
  const incomplete = rows.length - complete
  const inconclusive = text.trim() !== '' && detection.delimiter === null && override === ''

  function handleFile(file: File) {
    setFileError(null)
    if (file.size > MAX_FILE_BYTES) {
      setFileError('That file is larger than 1 MB. Please use a smaller word list.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setText(String(reader.result ?? ''))
      // A .tsv declares its own separator; trust it over detection.
      if (file.name.toLowerCase().endsWith('.tsv')) setOverride('tab')
    }
    reader.onerror = () => setFileError("That file couldn't be read as text.")
    reader.readAsText(file)
  }

  return (
    <div className="rounded-lg border border-slate-300 p-3 dark:border-slate-600">
      <label className="block text-sm font-medium" htmlFor="paste-box">
        Paste your list, one pair per line
      </label>
      <textarea
        id="paste-box"
        aria-label="Paste your list"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={'daughter\tdochter\nto die\tdoodgaan'}
        className="mt-1 w-full rounded border border-slate-300 p-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-800"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="delimiter">Separator</label>
        <select
          id="delimiter"
          value={override === '' ? (detection.delimiter ?? '') : override}
          onChange={(e) => setOverride(e.target.value as Delimiter | '')}
          className="rounded border border-slate-300 p-1 dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="">{inconclusive ? "Couldn't tell — pick one" : 'Auto'}</option>
          {DELIMITERS.map((d) => (
            <option key={d} value={d}>
              {DELIMITER_LABELS[d]}
            </option>
          ))}
        </select>

        <label className="ml-auto cursor-pointer rounded border border-slate-300 px-2 py-1 dark:border-slate-600">
          Upload a file
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/plain,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </label>
      </div>

      {inconclusive && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          Couldn&apos;t work out the separator from this text — pick one above.
          {detection.confidence > 0 &&
            ` (best guess matched ${Math.round(detection.confidence * 100)}% of lines, below the ${Math.round(
              CONFIDENCE_FLOOR * 100,
            )}% needed)`}
        </p>
      )}
      {fileError && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{fileError}</p>}

      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Will add {complete} complete {complete === 1 ? 'pair' : 'pairs'}
        {incomplete > 0 && `, ${incomplete} incomplete`}
      </p>

      <button
        type="button"
        disabled={rows.length === 0}
        onClick={() => {
          onAdd(rows)
          setText('')
          setOverride('')
        }}
        className="mt-2 rounded bg-slate-800 px-3 py-2 text-white disabled:opacity-40 dark:bg-slate-200 dark:text-slate-900"
      >
        Add to list
      </button>
    </div>
  )
}
