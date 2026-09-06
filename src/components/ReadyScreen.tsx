import { LANG_NAMES } from '../lang/languages'
import type { MissedSource } from '../state/appMachine'
import {
  REVIEW_WINDOWS,
  WINDOW_LABELS,
  WINDOW_PHRASES,
  type ReviewWindow,
} from '../state/missedWords'
import type { DrillMode, WordList } from '../state/types'

interface Props {
  list: WordList
  saved: boolean
  /** Non-null when a missed-words subset is selected instead of the whole list. */
  missed: { count: number; source: MissedSource } | null
  /** How many words each window would drill. */
  counts: Record<ReviewWindow, number>
  /** Some history in range predates right-answer recording. */
  degraded: boolean
  onStart: (mode: DrillMode) => void
  onPickWindow: (window: ReviewWindow) => void
  onPractiseFull: () => void
  onSave: () => void
  onBack: () => void
}

/** What the subset is, in words. */
function missedSummary(count: number, source: MissedSource): string {
  const words = `${count} ${count === 1 ? 'word' : 'words'}`
  return source.kind === 'window'
    ? `Practising ${words} you missed ${WINDOW_PHRASES[source.window]}.`
    : `Practising the ${words} you missed on ${new Date(source.finishedAt).toLocaleDateString('en-GB')}.`
}

export function ReadyScreen({
  list,
  saved,
  missed,
  counts,
  degraded,
  onStart,
  onPickWindow,
  onPractiseFull,
  onSave,
  onBack,
}: Props) {
  const anyMissed = REVIEW_WINDOWS.some((w) => counts[w] > 0)
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{list.name}</h1>
      <p className="text-ink-muted">
        {list.pairs.length} {list.pairs.length === 1 ? 'word' : 'words'}
      </p>
      {missed ? (
        <p className="rounded-lg bg-primary-soft p-3 text-ink">
          {missedSummary(missed.count, missed.source)}
        </p>
      ) : (
        <p className="rounded-lg bg-surface-sunken p-3">
          You&apos;ll hear <strong>{LANG_NAMES[list.col2Lang]}</strong>, and answer in{' '}
          <strong>{LANG_NAMES[list.col1Lang]}</strong>.
        </p>
      )}

      {/*
        EITHER button starts its mode's first utterance. On iOS that matters:
        the tap establishes the user-gesture chain that every later auto-speak
        descends from, and speaking from anywhere else is silently dropped. That
        is true of both, so neither may be demoted to something that navigates
        first and speaks later.

        Mode is a property of the RUN, not of the list: nothing here is written
        to the stored list, so the choice is made fresh every time (FR-10).
      */}
      {/*
        The one-liner sits OUTSIDE each button, referenced by aria-describedby
        rather than nested inside it. Nested, it becomes part of the button's
        accessible name — "Practice Hear it, see it, see the answer" — which is
        what a screen reader would then announce on every focus.
      */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onStart('practice')}
            aria-describedby="mode-practice-hint"
            className="btn btn-primary btn-lg"
          >
            Practice
          </button>
          <p id="mode-practice-hint" className="text-center text-sm text-ink-muted">
            Hear it, see it, see the answer
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onStart('test')}
            aria-describedby="mode-test-hint"
            className="btn btn-lg bg-ink text-ground"
          >
            Test
          </button>
          <p id="mode-test-hint" className="text-center text-sm text-ink-muted">
            Hear it and answer from memory
          </p>
        </div>
      </div>

      {missed ? (
        <button type="button" onClick={onPractiseFull} className="btn btn-quiet">
          Practise the full list instead
        </button>
      ) : (
        anyMissed && (
          <div className="flex flex-col gap-2">
            <h2 className="font-semibold">Practise words you missed</h2>
            <div className="flex flex-wrap gap-2">
              {REVIEW_WINDOWS.map((w) => (
                <button
                  key={w}
                  type="button"
                  // Disabled rather than hidden: a zero tells the user their
                  // recent misses are cleared, which a missing chip would not.
                  disabled={counts[w] === 0}
                  aria-pressed={false}
                  onClick={() => onPickWindow(w)}
                  className="btn btn-quiet text-sm"
                >
                  {WINDOW_LABELS[w]} · {counts[w]}
                </button>
              ))}
            </div>
            {degraded && (
              <p className="text-sm text-ink-muted">
                Some of these drills were recorded before right answers were saved, so a word you
                have since got right may still appear.
              </p>
            )}
          </div>
        )
      )}

      <div className="flex gap-2">
        {/*
          Hidden, not disabled, while a subset is selected. The subset shares the
          real list's id, so saving here would overwrite the whole list with a
          handful of words — and a disabled button invites the question where an
          absent one closes it.
        */}
        {!missed && (
          <button
            type="button"
            onClick={onSave}
            disabled={saved}
            className="btn btn-quiet flex-1"
          >
            {saved ? 'Saved ✓' : 'Save this list'}
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 flex-1 rounded border border-line-strong"
        >
          Back
        </button>
      </div>
    </section>
  )
}
