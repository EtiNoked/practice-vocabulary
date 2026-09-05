import { LANG_NAMES } from '../lang/languages'
import type { WordList } from '../state/types'

interface Props {
  list: WordList
  saved: boolean
  onStart: () => void
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
        This button starts the session's first utterance. On iOS that matters:
        it establishes the user-gesture chain that every later auto-speak descends
        from. Speaking from anywhere else would be silently dropped.
      */}
      <button
        type="button"
        onClick={onStart}
        className="btn btn-primary btn-lg"
      >
        Start
      </button>

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
