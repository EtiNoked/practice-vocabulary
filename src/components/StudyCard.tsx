import { useEffect } from 'react'
import { LANG_NAMES } from '../lang/languages'
import { currentPair } from '../state/session'
import type { Session, WordList } from '../state/types'
import { speak } from '../speech/tts'

interface Props {
  list: WordList
  session: Session
  /** True when this card came back from storage rather than from a tap (FR-3). */
  resumed: boolean
  onNext: () => void
  onPrev: () => void
  onQuit: () => void
}

/**
 * One card of a PRACTICE run: hear it, see it spelled, see the answer, move on.
 *
 * Deliberately shares nothing with TestCard but the domain. The two look similar
 * today, but they answer opposite questions — this one hides nothing and counts
 * nothing — and inventing a shared "card" abstraction for two users would couple
 * them where they are most likely to diverge.
 *
 * As in TestCard, note what is NOT here: no effect that speaks on mount. iOS
 * Safari silently drops speech that does not descend from a user gesture, so
 * every utterance originates in a tap — the Practice tap for the first card, and
 * Next/Previous for each one after.
 */
export function StudyCard({ list, session, resumed, onNext, onPrev, onQuit }: Props) {
  const pair = currentPair(session)
  const atStart = session.index === 0

  const replay = () => {
    if (pair) speak(pair.col2, list.col2Lang)
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
          {LANG_NAMES[list.col2Lang]}
        </p>
        <p className="text-word font-bold">{pair.col2}</p>

        <p className="mt-2 text-xs uppercase tracking-wide text-ink-faint">
          {LANG_NAMES[list.col1Lang]}
        </p>
        <p className="text-word font-bold text-correct">{pair.col1}</p>
      </div>

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
        Space replays · → next · ← previous
      </p>
    </section>
  )
}
