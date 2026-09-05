import { score } from '../state/session'
import type { Session, WordList } from '../state/types'

interface Props {
  list: WordList
  session: Session
  onRestartShuffled: () => void
  onRestartWrongOnly: () => void
  /** Run the same list again in the other mode (FR-15). */
  onSwitchMode: () => void
  onDone: () => void
}

/**
 * The end of a run, in whichever mode it was.
 *
 * The two branches are separate all the way down rather than one panel with
 * conditional bits: a practice run has no score to soften, and interleaving the
 * two would make it far too easy to reintroduce a "0%" on the study path.
 */
export function ResultsScreen({
  list,
  session,
  onRestartShuffled,
  onRestartWrongOnly,
  onSwitchMode,
  onDone,
}: Props) {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{list.name}</h1>
      {session.mode === 'practice' ? (
        <PracticeDone
          session={session}
          onRestart={onRestartShuffled}
          onSwitchMode={onSwitchMode}
          onDone={onDone}
        />
      ) : (
        <TestDone
          session={session}
          onRestartShuffled={onRestartShuffled}
          onRestartWrongOnly={onRestartWrongOnly}
          onSwitchMode={onSwitchMode}
          onDone={onDone}
        />
      )}
    </section>
  )
}

/**
 * FR-13. `score()` is NEVER called down this branch.
 *
 * Not merely "not displayed": a practice session marks nothing, so score()
 * returns total: 0, and a stray "0 / 0 (0%)" after a completed study run would
 * tell the user they got everything wrong.
 */
function PracticeDone({
  session,
  onRestart,
  onSwitchMode,
  onDone,
}: {
  session: Session
  onRestart: () => void
  onSwitchMode: () => void
  onDone: () => void
}) {
  const total = session.order.length

  return (
    <>
      <p className="text-xl">
        You went through all {total} {total === 1 ? 'word' : 'words'}.
      </p>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onRestart} className="btn btn-primary btn-lg">
          Practice again
        </button>
        <button type="button" onClick={onSwitchMode} className="btn btn-lg bg-ink text-ground">
          Test yourself
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded border border-line-strong"
        >
          Done
        </button>
      </div>
    </>
  )
}

/** 001's panel, unchanged (FR-14), plus the one new way out into practice. */
function TestDone({
  session,
  onRestartShuffled,
  onRestartWrongOnly,
  onSwitchMode,
  onDone,
}: {
  session: Session
  onRestartShuffled: () => void
  onRestartWrongOnly: () => void
  onSwitchMode: () => void
  onDone: () => void
}) {
  const result = score(session)

  return (
    <>
      <p className="text-3xl font-bold">
        {result.right} / {result.total}{' '}
        <span className="text-2xl font-normal text-ink-muted">({result.pct}%)</span>
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
        <button type="button" onClick={onRestartShuffled} className="btn btn-primary btn-lg">
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
        {/*
          "Study these", not "Practise these".

          The button next to it already means "re-test me on the ones I missed",
          and giving the mode switch the same verb would make two adjacent
          buttons read as variations of one action rather than as two different
          things.
        */}
        <button
          type="button"
          onClick={onSwitchMode}
          className="min-h-11 rounded border border-line-strong"
        >
          Study these
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded border border-line-strong"
        >
          Done
        </button>
      </div>
    </>
  )
}
