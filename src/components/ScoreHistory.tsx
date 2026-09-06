import { bandBorder } from '../state/scoreBand'
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
      <p className="text-ink-muted">
        No practice yet. Finish a drill and your score will show up here.
      </p>
    )
  }

  const summary = trend(records)

  return (
    <div className="flex flex-col gap-2">
      {summary && (
        <p className="text-sm text-ink-muted">
          Averaging {summary.average}% over your last {summary.count} full runs.
        </p>
      )}

      {/*
        Named, so the log is addressable as a region rather than an anonymous
        list. A list's name appears both here and in Saved lists above, so
        "which Lesson 3" is a question a screen-reader user has to answer too.
      */}
      <ul aria-label="Recent practice" className="flex flex-col gap-1">
        {records.slice(0, 10).map((record) => (
          <li
            key={record.id}
            /*
              The score's colour, on the run itself.

              `border-2` on every row, banded or not, so a run with no score
              cannot sit a pixel narrower than its neighbours. Colour is never
              the only carrier — the numbers are right there beside it.
            */
            className={`flex flex-wrap items-baseline justify-between gap-2 rounded border-2 px-3 py-2 text-sm ${bandBorder(record)}`}
          >
            <span className="font-medium">{record.listName}</span>
            <span className="text-ink-muted">
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
