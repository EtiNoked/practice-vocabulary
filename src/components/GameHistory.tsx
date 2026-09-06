import { useMemo, useState } from 'react'
import { byDay } from '../state/dayLabel'
import { bandBorder } from '../state/scoreBand'
import { gameLabel } from '../game/gameRecord'
import type { GameRecord } from '../game/types'

interface Props {
  games: readonly GameRecord[]
  /** True while we do not yet know whose games to show. */
  loading?: boolean
}

/**
 * A read-only log of finished games.
 *
 * These records have been written since 008 and shown nowhere: `visibleGames` fed the
 * missed-words pool and nothing else. This is the screen that gives them back.
 *
 * Everything rendered comes from the record itself, never from a lookup — `listNames` is
 * denormalised for exactly the reason `SessionRecord.listName` is, so a round outlives
 * the lists it drew from.
 *
 * NOT grouped by run, and there is no `groupRuns` here: a game IS one record. The drill's
 * folding exists because a multi-list test writes one record per list (011 D-3); a game
 * writes one whatever it spanned, so there is nothing to fold — which is why the invariant
 * that forbids a component folding history its own way covers this file for free.
 */
export function GameHistory({ games, loading = false }: Props) {
  /*
   * One clock reading, taken once when the screen mounts — ReviewScreen's rule and its
   * reason: read during render instead and two rows could straddle midnight and disagree
   * about which day they belong to, with React free to re-render at any time.
   */
  const [now] = useState(() => Date.now())

  /*
   * Sorted HERE. `groupRuns` sorts for the drill log, but nothing sorts games —
   * `subscribeGames` makes no ordering promise this component may rely on — so a log that
   * assumed one would come out shuffled for exactly the users with the most history.
   */
  const days = useMemo(() => {
    const newestFirst = [...games].sort((a, b) => b.finishedAt - a.finishedAt)
    return byDay(newestFirst, (record) => record.finishedAt, now)
  }, [games, now])

  // Three states, not two. "No games yet" shown to a signed-in user whose records are
  // still arriving reads as data loss.
  if (loading) {
    return (
      <p className="text-ink-muted" role="status">
        Loading your games…
      </p>
    )
  }

  if (games.length === 0) {
    return (
      <p className="text-ink-muted">
        No games yet. Play a round and it will show up here.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <div key={day.label}>
          <h2 className="mb-2 font-semibold">{day.label}</h2>
          <ul className="flex flex-col gap-2">
            {day.rows.map((record) => (
              <li key={record.id}>
                <Row record={record} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/**
 * One round.
 *
 * Not a button: there is no game detail screen. `GameRecord.results` would support one
 * and nobody has asked for it, so this stays a log entry rather than a control that
 * looks clickable and is not.
 */
function Row({ record }: { record: GameRecord }) {
  const pct = record.asked === 0 ? 0 : Math.round((record.correct / record.asked) * 100)

  return (
    /*
      `bandBorder` adapted from the game's own numbers, exactly as GameResults already
      does it. The colour a good round wears here is then the same one it wears on the
      results screen and on the drill's history — a second threshold would drift.
      `border-2` on every row, banded or not, so a row cannot sit a pixel narrower than
      its neighbours, and colour is never the only carrier: the numbers are right there.
    */
    <div
      className={`card flex flex-wrap items-baseline justify-between gap-2 border-2 px-3 py-2 ${bandBorder(
        { right: record.correct, total: record.asked, pct },
      )}`}
    >
      <span className="font-medium">{gameLabel(record)}</span>
      <span className="text-sm text-ink-muted">
        {record.correct} / {record.asked} · {record.points} pts
        {record.source === 'missed' && ' · missed words only'}
        {record.partial && ' · stopped early'}
      </span>
    </div>
  )
}
