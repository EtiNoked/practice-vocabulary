import { score } from '../state/session'
import type { DrillSubject } from '../state/drillRun'
import type { Session } from '../state/types'

interface Props {
  /**
   * What this run is OF: its name and its language pair.
   *
   * `DrillSubject`, not `WordList`, so a run spanning several lists can be drilled by
   * this same card (011 D-8). A `WordList` still satisfies it, which is why widening
   * this prop moved no call site.
   */
  subject: DrillSubject
  session: Session
  onRestartShuffled: () => void
  onRestartWrongOnly: () => void
  /**
   * A fresh draw of the same size from the same pool, or absent when there is none.
   *
   * Passed as `null` rather than disabled: a list drill has no other sample to draw, and
   * a permanently dead button on every drill in the app would invite the question an
   * absent one never raises. `freshDraw` is how many words it would deal, so the label
   * can say it.
   */
  freshDraw?: { count: number; onDraw: () => void } | null
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
  subject,
  session,
  onRestartShuffled,
  onRestartWrongOnly,
  freshDraw = null,
  onSwitchMode,
  onDone,
}: Props) {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{subject.name}</h1>
      {session.mode === 'practice' ? (
        <PracticeDone
          session={session}
          onRestart={onRestartShuffled}
          freshDraw={freshDraw}
          onSwitchMode={onSwitchMode}
          onDone={onDone}
        />
      ) : (
        <TestDone
          session={session}
          onRestartShuffled={onRestartShuffled}
          onRestartWrongOnly={onRestartWrongOnly}
          freshDraw={freshDraw}
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
  freshDraw,
  onSwitchMode,
  onDone,
}: {
  session: Session
  onRestart: () => void
  freshDraw: { count: number; onDraw: () => void } | null
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
        {freshDraw && <FreshDraw {...freshDraw} />}
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

/**
 * "Another 15" — a different sample of the same size from the same pool.
 *
 * NOT the same thing as the button above it, and the labels have to keep them apart:
 * "Shuffle & restart" re-runs the very same words in a new order, this one draws words the
 * user may not have seen. That distinction is the whole of the ask's "re-do the practice,
 * or regenerate this test".
 *
 * Re-samples the pool SNAPSHOT, so the number chosen at setup still holds even if another
 * tab has since edited a list (011 D-6, following 008 D-9).
 */
function FreshDraw({ count, onDraw }: { count: number; onDraw: () => void }) {
  return (
    <button
      type="button"
      onClick={onDraw}
      className="min-h-11 rounded border border-line-strong"
    >
      Another {count}, freshly drawn
    </button>
  )
}

/** 001's panel, unchanged (FR-14), plus the one new way out into practice. */
function TestDone({
  session,
  onRestartShuffled,
  onRestartWrongOnly,
  freshDraw,
  onSwitchMode,
  onDone,
}: {
  session: Session
  onRestartShuffled: () => void
  onRestartWrongOnly: () => void
  freshDraw: { count: number; onDraw: () => void } | null
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
        {freshDraw && <FreshDraw {...freshDraw} />}
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
