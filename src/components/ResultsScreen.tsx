import { score } from '../state/session'
import type { Session, WordList } from '../state/types'

interface Props {
  list: WordList
  session: Session
  onRestartShuffled: () => void
  onRestartWrongOnly: () => void
  onDone: () => void
}

export function ResultsScreen({
  list,
  session,
  onRestartShuffled,
  onRestartWrongOnly,
  onDone,
}: Props) {
  const result = score(session)

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{list.name}</h1>
      <p className="text-3xl font-bold">
        {result.right} / {result.total}{' '}
        <span className="text-2xl font-normal text-ink-muted">
          ({result.pct}%)
        </span>
      </p>

      {result.wrongPairs.length > 0 ? (
        <div>
          <h2 className="font-semibold">Worth another look</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {result.wrongPairs.map((pair) => (
              <li
                key={pair.id}
                className="flex justify-between rounded bg-surface-sunken px-3 py-2"
              >
                <span>{pair.col2}</span>
                <span className="text-ink-muted">{pair.col1}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        result.total > 0 && <p className="text-correct">Everything right.</p>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onRestartShuffled}
          className="btn btn-primary btn-lg"
        >
          Shuffle &amp; restart
        </button>
        <button
          type="button"
          onClick={onRestartWrongOnly}
          disabled={result.wrongPairs.length === 0}
          className="min-h-11 rounded border border-line-strong disabled:opacity-40"
        >
          Practise wrong ones only
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded border border-line-strong"
        >
          Done
        </button>
      </div>
    </section>
  )
}
