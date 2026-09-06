import { useMemo, useState } from 'react'
import { bandBorder } from '../state/scoreBand'
import type { SessionRecord } from '../state/types'

interface Props {
  records: SessionRecord[]
  /** True while we do not yet know whose history to show. */
  loading?: boolean
  onOpen: (recordId: string) => void
  onHome: () => void
}

const ALL = 'all'

/**
 * 'Today' / 'Yesterday' / an en-GB date, matching `formatDate` elsewhere.
 *
 * Compares LOCAL MIDNIGHTS rather than elapsed milliseconds. 23:30 yesterday and
 * 00:30 today are an hour apart and two different days, and subtracting raw time
 * would file them together.
 *
 * Deliberately a different notion of time from `missedWords.ts`, whose windows
 * roll from `now`. A heading is a calendar idea; a window is a duration. Do not
 * unify them.
 */
function dayLabel(ms: number, now: number): string {
  const startOf = (t: number) => new Date(t).setHours(0, 0, 0, 0)
  const days = Math.round((startOf(now) - startOf(ms)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(ms).toLocaleDateString('en-GB')
}

/**
 * Every list that appears in the history, named as it was most recently drilled.
 *
 * Built from the RECORDS, never from the saved lists. `SessionRecord.listName`
 * is denormalised exactly so history outlives its list, and sourcing the filter
 * from live lists would quietly make a deleted list's drills unreachable.
 */
function listOptions(records: SessionRecord[]): Array<{ id: string; name: string }> {
  const newestFirst = [...records].sort((a, b) => b.finishedAt - a.finishedAt)
  const byId = new Map<string, string>()
  for (const r of newestFirst) if (!byId.has(r.listId)) byId.set(r.listId, r.listName)
  return [...byId].map(([id, name]) => ({ id, name }))
}

export function ReviewScreen({ records, loading = false, onOpen, onHome }: Props) {
  const [filter, setFilter] = useState<string>(ALL)

  /*
   * One clock reading, taken once when the screen mounts.
   *
   * Read during render instead and two rows could straddle midnight and disagree
   * about which day they belong to — and React is free to re-render at any time,
   * so the headings could change under the user without the data changing.
   */
  const [now] = useState(() => Date.now())

  const options = useMemo(() => listOptions(records), [records])

  const shown = useMemo(() => {
    const matching = filter === ALL ? records : records.filter((r) => r.listId === filter)
    return [...matching].sort((a, b) => b.finishedAt - a.finishedAt)
  }, [records, filter])


  const groups: Array<{ label: string; rows: SessionRecord[] }> = []
  for (const record of shown) {
    const label = dayLabel(record.finishedAt, now)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.rows.push(record)
    else groups.push({ label, rows: [record] })
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Review</h1>

      {options.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="review-list-filter" className="text-sm text-ink-muted">
            List
          </label>
          <select
            id="review-list-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="field flex-1"
          >
            <option value={ALL}>All lists</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/*
        Three empty states, not one. "No practice yet" shown to someone whose
        records are still arriving reads as data loss, and shown under an active
        filter it reads as history that has been deleted.
      */}
      {loading ? (
        <p className="text-ink-muted" role="status">
          Loading your practice history…
        </p>
      ) : records.length === 0 ? (
        <p className="text-ink-muted">
          No practice yet. Finish a drill and it will show up here.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-ink-muted">No practice for this list yet.</p>
      ) : (
        groups.map((group) => (
          <div key={group.label}>
            <h2 className="mb-2 font-semibold">{group.label}</h2>
            <ul className="flex flex-col gap-2">
              {group.rows.map((record) => (
                <li key={record.id}>
                  <Row record={record} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <button
        type="button"
        onClick={onHome}
        className="min-h-11 rounded border border-line-strong"
      >
        Back to my lists
      </button>
    </section>
  )
}

/** A button, not a clickable row: this is navigation, and a keyboard needs it. */
function Row({
  record,
  onOpen,
}: {
  record: SessionRecord
  onOpen: (recordId: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(record.id)}
      /*
        `border-2` plus the band overrides `.card`'s own 1px line: Tailwind's
        utilities layer wins over the components layer, so the two do not fight.
      */
      className={`card flex w-full flex-wrap items-baseline justify-between gap-2 border-2 px-3 py-2 text-left ${bandBorder(record)}`}
    >
      <span className="font-medium">{record.listName}</span>
      <span className="text-sm text-ink-muted">
        {record.right} / {record.total} ({record.pct}%)
        {record.mode === 'wrong-only' && ' · missed words only'}
        {record.partial && ' · stopped early'}
      </span>
    </button>
  )
}
