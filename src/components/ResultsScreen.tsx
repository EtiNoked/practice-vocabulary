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
      <p className="text-4xl font-bold">
        {result.right} / {result.total}{' '}
        <span className="text-2xl font-normal text-slate-600 dark:text-slate-400">
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
                className="flex justify-between rounded bg-slate-100 px-3 py-2 dark:bg-slate-800"
              >
                <span>{pair.col2}</span>
                <span className="text-slate-600 dark:text-slate-400">{pair.col1}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        result.total > 0 && <p className="text-emerald-700 dark:text-emerald-400">Everything right.</p>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onRestartShuffled}
          className="min-h-14 rounded-lg bg-emerald-700 text-lg text-white"
        >
          Shuffle &amp; restart
        </button>
        <button
          type="button"
          onClick={onRestartWrongOnly}
          disabled={result.wrongPairs.length === 0}
          className="min-h-11 rounded border border-slate-300 disabled:opacity-40 dark:border-slate-600"
        >
          Practise wrong ones only
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded border border-slate-300 dark:border-slate-600"
        >
          Done
        </button>
      </div>
    </section>
  )
}
