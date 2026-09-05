import type { SessionRecord } from '../state/types'

interface Props {
  records: SessionRecord[]
}

const formatDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB')

/** Full runs only — a wrong-only drill is a harder subset and would drag it down. */
function trend(records: SessionRecord[]): { average: number; count: number } | null {
  const comparable = records.filter((r) => r.mode === 'full' && !r.partial)
  if (comparable.length < 2) return null
  const recent = comparable.slice(0, 5)
  const average = Math.round(recent.reduce((sum, r) => sum + r.pct, 0) / recent.length)
  return { average, count: recent.length }
}

/**
 * A read-only log of finished drills.
 *
 * Records outlive their list, so everything shown comes from the record itself —
 * never from a lookup that would come back empty after a delete.
 */
export function ScoreHistory({ records }: Props) {
  if (records.length === 0) {
    return (
      <p className="text-slate-600 dark:text-slate-400">
        No practice yet. Finish a drill and your score will show up here.
      </p>
    )
  }

  const summary = trend(records)

  return (
    <div className="flex flex-col gap-2">
      {summary && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Averaging {summary.average}% over your last {summary.count} full runs.
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {records.slice(0, 10).map((record) => (
          <li
            key={record.id}
            className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
          >
            <span className="font-medium">{record.listName}</span>
            <span className="text-slate-600 dark:text-slate-400">
              {record.right} / {record.total} ({record.pct}%)
              {record.mode === 'wrong-only' && ' · missed words only'}
              {record.partial && ' · stopped early'} · {formatDate(record.finishedAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
