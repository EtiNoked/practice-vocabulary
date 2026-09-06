import { useEffect } from 'react'
import { LANG_NAMES } from '../lang/languages'
import { currentPair } from '../state/session'
import type { DrillSubject } from '../state/drillRun'
import type { Session } from '../state/types'
import { speak } from '../speech/tts'

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
  /** True when this card came back from storage rather than from a tap (FR-3). */
  resumed: boolean
  onNext: () => void
  onPrev: () => void
  /** Flip the answer cover for the whole run (009). */
  onToggleAnswer: () => void
  onQuit: () => void
}

/**
 * One card of a PRACTICE run: hear it, see it spelled, try it, uncover the
 * answer when you want it, move on.
 *
 * Deliberately shares nothing with TestCard but the domain. The two look similar
 * today, but they answer opposite questions — this one covers the answer until
 * asked and counts nothing, that one gates it behind a one-way reveal and scores
 * what follows — and inventing a shared "card" abstraction for two users would
 * couple them where they are most likely to diverge.
 *
 * 009 is that divergence arriving. Both cards now hide the answer, which looks
 * like the moment to merge them and is the opposite: here the cover is a
 * reversible property of the RUN that the user sets for their own benefit, and
 * there it is a per-card gate the scoring depends on. Same pixels, unrelated
 * rules.
 *
 * As in TestCard, note what is NOT here: no effect that speaks on mount. iOS
 * Safari silently drops speech that does not descend from a user gesture, so
 * every utterance originates in a tap — the Practice tap for the first card, and
 * Next/Previous for each one after.
 */
export function StudyCard({
  subject,
  session,
  resumed,
  onNext,
  onPrev,
  onToggleAnswer,
  onQuit,
}: Props) {
  const pair = currentPair(session)
  const atStart = session.index === 0
  const open = session.answersOpen

  const replay = () => {
    if (pair) speak(pair.col2, subject.col2Lang)
  }

  /*
   * No dependency array, matching TestCard.
   *
   * NOT an oversight: `session.index` is captured in this closure, so a `[]`
   * array would freeze the handler on card 1 and every arrow press would
   * navigate from the wrong card.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Not while a menu or dialog owns the keyboard — the account menu sits on
      // top of the drill and these bindings are registered on window.
      if (document.querySelector('[role="menu"],[role="dialog"]')) return

      if (event.key === ' ') {
        event.preventDefault()
        replay()
      } else if (event.key === 'a' || event.key === 'A') {
        // `a` for answer. Enter cannot do this job here the way it does in
        // TestCard — it already advances, three branches down.
        event.preventDefault()
        onToggleAnswer()
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        // Or the page scrolls under the card on every advance.
        event.preventDefault()
        onNext()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (!atStart) onPrev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!pair) return null

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between text-sm text-ink-muted">
        <span>
          Card {session.index + 1} of {session.order.length}
        </span>
        <button type="button" onClick={onQuit} className="min-h-11 underline">
          Quit
        </button>
      </header>

      <div aria-live="polite" className="card flex flex-col gap-2 p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-ink-faint">
          {LANG_NAMES[subject.col2Lang]}
        </p>
        <p className="text-word font-bold">{pair.col2}</p>

        <p className="mt-2 text-xs uppercase tracking-wide text-ink-faint">
          {LANG_NAMES[subject.col1Lang]}
        </p>
        {/*
          Rendered either way, covered by a class rather than swapped out for a
          placeholder — the word keeps its exact box, so the card cannot resize
          under a thumb already reaching for Next.

          `aria-hidden` while covered is the other half of the cover, and the
          more important half: the filter is a picture of hiding, and without
          this a screen reader would read the answer out the moment the card
          appeared — leaving the feature doing nothing for precisely the user it
          looks like it helps.
        */}
        <p
          className={`text-word font-bold text-correct${open ? '' : ' answer-masked'}`}
          // `undefined` and not `false`, so the attribute is absent rather than
          // rendered as aria-hidden="false". The two behave alike; only one of
          // them reads as "somebody thought about this element".
          aria-hidden={open ? undefined : true}
        >
          {pair.col1}
        </p>
      </div>

      {/*
        The label carries the state, and there is deliberately no `aria-pressed`
        beside it: together they announce the state twice over.
        "Reveal", not "Show" — "Show answer" is TestCard's control, and the two
        modes are told apart by that string in more than one place.
      */}
      <button type="button" onClick={onToggleAnswer} className="btn btn-quiet">
        {open ? 'Hide answer 👁' : 'Reveal answer 👁'}
      </button>

      {resumed && (
        <p className="rounded-lg bg-accent-soft p-3 text-center text-sm">
          Resumed — tap 🔊 to hear the word again
        </p>
      )}

      <button type="button" onClick={replay} className="btn btn-quiet btn-lg">
        Hear it again 🔊
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={atStart}
          className="btn btn-lg flex-1 border border-line-strong disabled:opacity-40"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          className="btn btn-primary btn-lg flex-1"
        >
          Next →
        </button>
      </div>

      <p className="text-center text-xs text-ink-faint">
        Space replays · A shows the answer · → next · ← previous
      </p>
    </section>
  )
}
