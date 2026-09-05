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
  onReveal: () => void
  onMark: (result: MarkResult) => void
  onQuit: () => void
}

/**
 * One card of the drill.
 *
 * Note what is NOT here: any effect that speaks on mount. iOS Safari silently
 * drops speech that does not descend from a user gesture, so every utterance in
 * this app originates in a click handler — the Start tap for the first card, and
 * the Right/Wrong tap for each one after.
 */
export function PracticeCard({ list, session, voiceMissing, onReveal, onMark, onQuit }: Props) {
  const pair = currentPair(session)
  const tally = score(session)

  const replay = () => {
    if (pair) speak(pair.col2, list.col2Lang)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
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
      <header className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
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
        className="rounded-xl border border-slate-300 p-6 text-center dark:border-slate-600"
      >
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Listen — {LANG_NAMES[list.col2Lang]}
        </p>

        {voiceMissing && <p className="mt-3 text-2xl font-semibold">{pair.col2}</p>}

        {session.revealed ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-2xl font-semibold">{pair.col2}</p>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {LANG_NAMES[list.col1Lang]}
            </p>
            <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
              {pair.col1}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-4xl" aria-hidden="true">
            🔊
          </p>
        )}
      </div>

      {session.revealed ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onMark('right')}
            className="min-h-14 flex-1 rounded-lg bg-emerald-700 text-lg text-white"
          >
            Right ✓
          </button>
          <button
            type="button"
            onClick={() => onMark('wrong')}
            className="min-h-14 flex-1 rounded-lg bg-rose-700 text-lg text-white"
          >
            Wrong ✗
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={replay}
            className="min-h-14 flex-1 rounded-lg border border-slate-300 text-lg dark:border-slate-600"
          >
            Hear it again 🔊
          </button>
          <button
            type="button"
            onClick={onReveal}
            className="min-h-14 flex-1 rounded-lg bg-slate-800 text-lg text-white dark:bg-slate-200 dark:text-slate-900"
          >
            Show answer
          </button>
        </div>
      )}

      <p className="text-center text-xs text-slate-500">
        Space replays · Enter reveals · Y / N marks
      </p>
    </section>
  )
}
