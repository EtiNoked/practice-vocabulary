import { useEffect } from 'react'
import { sideNames } from '../lang/languages'
import { currentPair, score } from '../state/session'
import type { DrillSubject } from '../state/drillRun'
import { promptShows, promptSpeaks, type MarkResult, type Session } from '../state/types'
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
  subject,
  session,
  voiceMissing,
  resumed,
  onReveal,
  onMark,
  onQuit,
}: Props) {
  const pair = currentPair(session)
  const tally = score(session)
  const sides = sideNames(subject.col1Lang, subject.col2Lang)
  const speaks = promptSpeaks(session.prompt)
  /*
   * `voiceMissing` OVERRIDES "just listen", and deliberately only that one.
   *
   * A silent card with nothing on it is not a harder test, it is an unanswerable one. It
   * does NOT turn speech back on for 'see': that choice was the user asking for quiet,
   * and a missing voice is no reason to overrule a run that was never going to speak.
   */
  const shows = promptShows(session.prompt) || voiceMissing

  const replay = () => {
    if (pair && speaks) speak(pair.col2, subject.col2Lang)
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

      if (event.key === ' ' && speaks) {
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
          {speaks ? `Listen — ${sides.prompt}` : sides.prompt}
        </p>

        {/*
          Shown as text when the run asked to see it, or when the device cannot say it.
          Either way it steps aside once revealed, because the answer block below repeats
          it right next to the translation.
        */}
        {shows && !session.revealed && <p className="mt-3 text-word font-bold">{pair.col2}</p>}

        {session.revealed ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-word font-bold">{pair.col2}</p>
            <p className="text-xs uppercase tracking-wide text-ink-faint">{sides.answer}</p>
            <p className="text-word font-bold text-correct">{pair.col1}</p>
          </div>
        ) : (
          // The speaker glyph stands in for the word. A silent run already HAS the word
          // on the card, so it would be a picture of sound over a run that makes none.
          !shows && (
            <p className="mt-4 text-4xl" aria-hidden="true">
              🔊
            </p>
          )
        )}
      </div>

      {resumed && speaks && (
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
          {/*
            Absent, not disabled, on a silent run. A dead speaker button on a card the
            user deliberately asked to be silent invites the question an absent one never
            raises — the rule the zero-count window chips already follow, inverted.
          */}
          {speaks && (
            <button
              type="button"
              onClick={replay}
              className="btn btn-quiet btn-lg flex-1"
            >
              Hear it again 🔊
            </button>
          )}
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
        {speaks && 'Space replays · '}Enter reveals · Y / N marks
      </p>
    </section>
  )
}
