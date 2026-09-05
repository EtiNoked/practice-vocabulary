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
      <p className="text-slate-600 dark:text-slate-400">
        {list.pairs.length} {list.pairs.length === 1 ? 'word' : 'words'}
      </p>
      <p className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
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
        className="min-h-14 rounded-lg bg-emerald-700 text-lg text-white"
      >
        Start
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saved}
          className="min-h-11 flex-1 rounded border border-slate-300 disabled:opacity-40 dark:border-slate-600"
        >
          {saved ? 'Saved ✓' : 'Save this list'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 flex-1 rounded border border-slate-300 dark:border-slate-600"
        >
          Back
        </button>
      </div>
    </section>
  )
}
