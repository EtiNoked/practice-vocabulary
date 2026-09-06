import { useMemo, useState } from 'react'
import { byDay } from '../state/dayLabel'
import { groupRuns, runLabel, type RunGroup } from '../state/runGroup'
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

  /*
   * FILTER FIRST, then group.
   *
   * A run spanning three lists writes three records (011 D-3). Filtered to one list, the
   * user should see that list's share of it — which falls out of filtering first, with
   * the run then grouping down to the single surviving record. Grouping first and
   * filtering after would have to decide whether a run "belongs to" a list at all.
   */
  const shown = useMemo(
    () => (filter === ALL ? records : records.filter((r) => r.listId === filter)),
    [records, filter],
  )

  const runs = useMemo(() => groupRuns(shown), [shown])

  // `groupRuns` already returns newest-first, which is what `byDay` requires of its caller.
  const days = byDay(runs, (run) => run.finishedAt, now)

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
        days.map((day) => (
          <div key={day.label}>
            <h2 className="mb-2 font-semibold">{day.label}</h2>
            <ul className="flex flex-col gap-2">
              {day.rows.map((run) => (
                <li key={run.id}>
                  <Row run={run} onOpen={onOpen} />
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

/** The score line a row shows, shared by a run and by one list's share of it. */
function Score({
  of,
}: {
  of: Pick<RunGroup, 'right' | 'total' | 'pct' | 'mode' | 'partial'>
}) {
  return (
    <span className="text-sm text-ink-muted">
      {of.right} / {of.total} ({of.pct}%)
      {of.mode === 'wrong-only' && ' · missed words only'}
      {of.partial && ' · stopped early'}
    </span>
  )
}

/**
 * One run.
 *
 * A run of ONE record is a button, exactly as every row here has been since 006 —
 * clicking it opens that drill's detail.
 *
 * A run spanning several lists is a summary with each list's share beneath it, and the
 * shares are the buttons. That is not decoration: `ReviewDetail` shows one record, so a
 * single button on a three-list run would have to pick one of them and silently drop the
 * other two. Naming them is the honest version of the same click.
 */
function Row({ run, onOpen }: { run: RunGroup; onOpen: (recordId: string) => void }) {
  const only = run.records.length === 1 ? run.records[0]! : null

  if (only) {
    return (
      <button
        type="button"
        onClick={() => onOpen(only.id)}
        /*
          `border-2` plus the band overrides `.card`'s own 1px line: Tailwind's
          utilities layer wins over the components layer, so the two do not fight.
        */
        className={`card flex w-full flex-wrap items-baseline justify-between gap-2 border-2 px-3 py-2 text-left ${bandBorder(run)}`}
      >
        <span className="font-medium">{runLabel(run)}</span>
        <Score of={run} />
      </button>
    )
  }

  return (
    <div className={`card border-2 px-3 py-2 ${bandBorder(run)}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{runLabel(run)}</span>
        <Score of={run} />
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {run.records.map((record) => (
          <li key={record.id}>
            <button
              type="button"
              onClick={() => onOpen(record.id)}
              className="flex w-full flex-wrap items-baseline justify-between gap-2 rounded bg-surface-sunken px-3 py-2 text-left text-sm"
            >
              <span>{record.listName}</span>
              <span className="text-ink-muted">
                {record.right} / {record.total}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
