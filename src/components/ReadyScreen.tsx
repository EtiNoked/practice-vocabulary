import { LANG_NAMES, isSameLanguage } from '../lang/languages'
import type { MissedSource } from '../state/appMachine'
import {
  REVIEW_WINDOWS,
  WINDOW_LABELS,
  WINDOW_PHRASES,
  type ReviewWindow,
} from '../state/missedWords'
import { PROMPT_MODES, type DrillMode, type DrillOptions, type WordList } from '../state/types'

interface Props {
  list: WordList
  saved: boolean
  /** Non-null when a missed-words subset is selected instead of the whole list. */
  missed: { count: number; source: MissedSource } | null
  /** How many words each window would drill. */
  counts: Record<ReviewWindow, number>
  /** Some history in range predates right-answer recording. */
  degraded: boolean
  /** Order and how a test gives the word, as this list last used them on this device. */
  options: DrillOptions
  onOptionsChange: (options: DrillOptions) => void
  /** True when the device has no voice for this list's prompt language. */
  voiceMissing: boolean
  onStart: (mode: DrillMode) => void
  onPickWindow: (window: ReviewWindow) => void
  onPractiseFull: () => void
  onSave: () => void
  onBack: () => void
}

/**
 * Label and one-liner for each prompt mode, in offering order.
 *
 * Here and not in `state/types.ts` for the reason `MissedSource` keeps its prose in the
 * component: the enum is state and has to stay serializable and comparable, the words are
 * copy and change without anything else changing.
 */
const PROMPT_COPY: Record<(typeof PROMPT_MODES)[number], { label: string; hint: string }> = {
  hear: { label: 'Just listen', hint: 'Nothing on screen' },
  see: { label: 'Show the word', hint: 'No sound' },
  both: { label: 'Both', hint: 'Hear it and read it' },
}

/** What the subset is, in words. */
function missedSummary(count: number, source: MissedSource): string {
  const words = `${count} ${count === 1 ? 'word' : 'words'}`
  return source.kind === 'window'
    ? `Practicing ${words} you missed ${WINDOW_PHRASES[source.window]}.`
    : `Practicing the ${words} you missed on ${new Date(source.finishedAt).toLocaleDateString('en-GB')}.`
}

export function ReadyScreen({
  list,
  saved,
  missed,
  counts,
  degraded,
  options,
  onOptionsChange,
  voiceMissing,
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
      ) : isSameLanguage(list.col1Lang, list.col2Lang) ? (
        /*
          A list that explains its words in their own language, rather than translating.

          "You'll hear Dutch, and answer in Dutch" is true and says nothing — naming the
          same language twice describes neither half of what is about to happen. What the
          reader needs instead is which half they get and which half they owe.
        */
        <p className="rounded-lg bg-surface-sunken p-3">
          Both sides are <strong>{LANG_NAMES[list.col1Lang]}</strong>. You&apos;ll get the clue,
          and answer with the word.
        </p>
      ) : (
        <p className="rounded-lg bg-surface-sunken p-3">
          You&apos;ll hear <strong>{LANG_NAMES[list.col2Lang]}</strong>, and answer in{' '}
          <strong>{LANG_NAMES[list.col1Lang]}</strong>.
        </p>
      )}

      {/*
        The run's setup, ABOVE the two start buttons, so it is chosen before starting rather
        than discovered afterwards: which words, in what order, and whether a test shows the
        word as well as saying it.
      */}
      <section aria-labelledby="words-heading" className="flex flex-col gap-2">
        <h2 id="words-heading" className="font-semibold">
          Words
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={!missed}
            onClick={missed ? onPractiseFull : undefined}
            className={!missed ? 'btn btn-primary text-sm' : 'btn btn-quiet text-sm'}
          >
            All words · {list.pairs.length}
          </button>
        </div>
        {anyMissed && (
          <>
            <p className="text-sm text-ink-muted">Or only the words you missed:</p>
            <div className="flex flex-wrap gap-2">
              {REVIEW_WINDOWS.map((w) => {
                const chosen = missed?.source.kind === 'window' && missed.source.window === w
                return (
                  <button
                    key={w}
                    type="button"
                    // Disabled rather than hidden: a zero tells the user their
                    // recent misses are cleared, which a missing chip would not.
                    disabled={counts[w] === 0}
                    aria-pressed={chosen}
                    onClick={() => onPickWindow(w)}
                    className={chosen ? 'btn btn-primary text-sm' : 'btn btn-quiet text-sm'}
                  >
                    {WINDOW_LABELS[w]} · {counts[w]}
                  </button>
                )
              })}
            </div>
            {degraded && (
              <p className="text-sm text-ink-muted">
                Some of these drills were recorded before right answers were saved, so a word you
                have since got right may still appear.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="order-heading" className="flex flex-col gap-2">
        <h2 id="order-heading" className="font-semibold">
          Order
        </h2>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['random', 'Random'],
              ['list', 'List order'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={options.ordering === value}
              onClick={() => onOptionsChange({ ...options, ordering: value })}
              className={options.ordering === value ? 'btn btn-primary text-sm' : 'btn btn-quiet text-sm'}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/*
        Three buttons where a checkbox used to sit, because the checkbox could only ever
        add text ON TOP of speech. "Show the word" with no sound is the state it had no
        way to express, and the one people in a quiet room or on a shared desk want.

        Still TEST only, exactly as the checkbox was — the heading says so, and practice
        shows the word and says it whatever is picked here.
      */}
      <section aria-labelledby="prompt-heading" className="flex flex-col gap-2">
        <h2 id="prompt-heading" className="font-semibold">
          In Test
        </h2>
        <div className="flex gap-2">
          {PROMPT_MODES.map((value) => {
            const chosen = options.prompt === value
            const { label, hint } = PROMPT_COPY[value]
            return (
              <button
                key={value}
                type="button"
                aria-pressed={chosen}
                onClick={() => onOptionsChange({ ...options, prompt: value })}
                className={`${
                  chosen ? 'btn btn-primary' : 'btn btn-quiet'
                } flex-1 flex-col items-center gap-0 py-2 text-sm`}
              >
                <span>{label}</span>
                <span className="text-xs font-normal opacity-80">{hint}</span>
              </button>
            )
          })}
        </div>
        {/*
          Said here rather than left for the card to discover. The card does fall back to
          showing the word when there is no voice, so "Just listen" never fails silently —
          but a user who picks it and then reads the word has been overruled without being
          told, and the honest place to say so is the control they are about to press.
        */}
        {voiceMissing && options.prompt === 'hear' && (
          <p className="text-sm text-ink-muted">
            This device has no voice for that language, so the word will be shown anyway.
          </p>
        )}
      </section>
      <p className="-mt-2 text-sm text-ink-muted">This list remembers your choices on this device.</p>

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
