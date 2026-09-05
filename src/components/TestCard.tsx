import { useEffect } from 'react'
import { LANG_NAMES } from '../lang/languages'
import { currentPair, score } from '../state/session'
import type { MarkResult, Session, WordList } from '../state/types'
import { speak } from '../speech/tts'

interface Props {
  list: WordList
  session: Session
  /** True when the device has no voice for the prompt language. */
  voiceMissing: boolean
  /** True when this card came back from storage rather than from a tap (FR-3). */
  resumed: boolean
  onReveal: () => void
  onMark: (result: MarkResult) => void
  onQuit: () => void
}

/**
 * One card of a TEST run: hear it, answer from memory, reveal, mark yourself.
 *
 * Note what is NOT here: any effect that speaks on mount. iOS Safari silently
 * drops speech that does not descend from a user gesture, so every utterance in
 * this app originates in a click handler — the Test tap for the first card, and
 * the Right/Wrong tap for each one after. A restore is precisely the case with
 * no gesture in scope, which is why it renders a hint instead of speaking.
 */
export function TestCard({
  list,
  session,
  voiceMissing,
  resumed,
  onReveal,
  onMark,
  onQuit,
}: Props) {
  const pair = currentPair(session)
  const tally = score(session)

  const replay = () => {
    if (pair) speak(pair.col2, list.col2Lang)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      /*
       * Not while a menu or dialog owns the keyboard.
       *
       * These bindings are registered on `window`, so they are live for the whole
       * drill screen — including while the account menu is open on top of it,
       * where typing `n` would silently mark the current card wrong and end the
       * drill underneath whatever the user was reading.
       *
       * Asking whether such a surface EXISTS, rather than whether the event came
       * from inside one: focus usually rests on the trigger that opened it, which
       * is a sibling of the menu and not within it. This says "the drill does not
       * own the keyboard right now" without the drill needing to know what does.
       */
      if (document.querySelector('[role="menu"],[role="dialog"]')) return

      if (event.key === ' ') {
        event.preventDefault()
        replay()
      } else if (event.key === 'Enter' && !session.revealed) {
        event.preventDefault()
        onReveal()
      } else if (session.revealed && (event.key === 'y' || event.key === 'Y')) {
        onMark('right')
      } else if (session.revealed && (event.key === 'n' || event.key === 'N')) {
        onMark('wrong')
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
        <span>
          ✓ {tally.right} · ✗ {tally.wrong}
        </span>
        <button type="button" onClick={onQuit} className="min-h-11 underline">
          Quit
        </button>
      </header>

      <div
        aria-live="polite"
        className="card p-6 text-center"
      >
        <p className="text-xs uppercase tracking-wide text-ink-faint">
          Listen — {LANG_NAMES[list.col2Lang]}
        </p>

        {voiceMissing && <p className="mt-3 text-word font-bold">{pair.col2}</p>}

        {session.revealed ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-word font-bold">{pair.col2}</p>
            <p className="text-xs uppercase tracking-wide text-ink-faint">
              {LANG_NAMES[list.col1Lang]}
            </p>
            <p className="text-word font-bold text-correct">{pair.col1}</p>
          </div>
        ) : (
          <p className="mt-4 text-4xl" aria-hidden="true">
            🔊
          </p>
        )}
      </div>

      {resumed && (
        <p className="rounded-lg bg-accent-soft p-3 text-center text-sm">
          Resumed — tap 🔊 to hear the word again
        </p>
      )}

      {session.revealed ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onMark('right')}
            className="btn btn-lg flex-1 bg-correct text-correct-ink"
          >
            Right ✓
          </button>
          <button
            type="button"
            onClick={() => onMark('wrong')}
            className="btn btn-lg flex-1 bg-incorrect text-incorrect-ink"
          >
            Wrong ✗
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={replay}
            className="btn btn-quiet btn-lg flex-1"
          >
            Hear it again 🔊
          </button>
          <button
            type="button"
            onClick={onReveal}
            className="btn btn-lg flex-1 bg-ink text-ground"
          >
            Show answer
          </button>
        </div>
      )}

      <p className="text-center text-xs text-ink-faint">
        Space replays · Enter reveals · Y / N marks
      </p>
    </section>
  )
}
