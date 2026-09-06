import { LANG_NAMES } from '../lang/languages'
import type { DrillMode, WordList } from '../state/types'

interface Props {
  list: WordList
  saved: boolean
  onStart: (mode: DrillMode) => void
  onSave: () => void
  onBack: () => void
}

export function ReadyScreen({ list, saved, onStart, onSave, onBack }: Props) {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{list.name}</h1>
      <p className="text-ink-muted">
        {list.pairs.length} {list.pairs.length === 1 ? 'word' : 'words'}
      </p>
      <p className="rounded-lg bg-surface-sunken p-3">
        You&apos;ll hear <strong>{LANG_NAMES[list.col2Lang]}</strong>, and answer in{' '}
        <strong>{LANG_NAMES[list.col1Lang]}</strong>.
      </p>

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
        accessible name — "Practice Hear it, try it, reveal when you want" — which is
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
            Hear it, try it, reveal when you want
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

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saved}
          className="btn btn-quiet flex-1"
        >
          {saved ? 'Saved ✓' : 'Save this list'}
        </button>
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
