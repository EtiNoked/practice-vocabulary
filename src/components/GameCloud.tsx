import { useEffect, useRef, useState } from 'react'
import { currentQuestion } from '../game/game'
import { displayedSeconds, remainingMs, scoreGame } from '../game/scoring'
import { QUESTION_MS, VERDICT_MS, type Game } from '../game/types'

interface Props {
  game: Game
  /**
   * Speak a word. Supplied by `App`, which holds the voice list.
   *
   * MUST only ever be called from inside a tap handler — see the note on the audio
   * chain below.
   */
  speak: (text: string) => void
  onAnswer: (choiceId: string, remaining: number) => void
  onTimeOut: () => void
  onAdvance: () => void
  onQuit: () => void
}

/** Keeps the latest callback reachable without making it an effect dependency. */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

/**
 * The cloud's colours, cycled by position.
 *
 * Only tokens with verified contrast in BOTH themes, and deliberately NOT `correct`,
 * `incorrect` or `accent`: the first two are reserved for the verdict — a cloud already
 * wearing red and green has nothing left to say "wrong" with — and orange fails the
 * text-contrast threshold against the page in light mode.
 */
const CLOUD_TONES = ['text-ink', 'text-primary', 'text-ink-muted'] as const

/** A small vertical stagger, so the words sit like a cloud rather than a line of type. */
const CLOUD_LIFT = ['-translate-y-1', 'translate-y-1', '', 'translate-y-2', '-translate-y-2', 'translate-y-0.5'] as const

const RING_RADIUS = 28
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/**
 * The round: hear a word, grab it from the cloud before the clock runs out.
 *
 * ── The audio chain, which is the whole reason this component is shaped as it is ──
 *
 * iOS Safari silently drops any `speak()` that does not descend from a user gesture
 * (see speech/tts.ts). The prompt IS the question here, so a dropped utterance does not
 * degrade the game — it ends it, on one platform, with nothing on screen to explain why.
 *
 * Three of the four transitions have a gesture in scope and one does not:
 *
 *   start          App speaks from the "Start game" tap.
 *   right / wrong  the NEXT word is spoken from inside the tile's onClick, before the
 *                  timer that advances the visual. Audio leads the picture by
 *                  VERDICT_MS, which is also good game feel: you hear the next word
 *                  while the verdict is still up, then the cloud arrives.
 *   timeout        NO GESTURE. So nothing is spoken and the game does not auto-advance
 *                  — it shows a "Next word" button, and that tap is the gesture.
 *
 * That last rule is a correctness requirement wearing a UX costume. Auto-advancing a
 * timeout looks tidier and breaks the game on iPhone.
 *
 * ── The clock ──
 *
 * A DEADLINE, never an accumulator. A backgrounded tab has its interval throttled to
 * almost nothing, so an accumulator would come back believing no time had passed and
 * award points for ten seconds nobody sat through.
 */
export function GameCloud({ game, speak, onAnswer, onTimeOut, onAdvance, onQuit }: Props) {
  const question = currentQuestion(game)
  const score = scoreGame(game)

  /*
   * The clock is a DEADLINE in a ref, and `left` is state the interval writes.
   *
   * Reading Date.now() during render would make this component impure — the same value
   * rendering differently on two passes — so the clock is read only in effects and in
   * tap handlers, and render just draws the number it was given.
   *
   * `left` is reset to a full clock DURING render when the question changes (a pure
   * assignment, no time read), so a new question never paints one frame showing the
   * previous question's remaining time.
   */
  const deadlineRef = useRef(0)
  const [clock, setClock] = useState(() => ({ index: game.index, left: QUESTION_MS }))
  if (clock.index !== game.index) {
    setClock({ index: game.index, left: QUESTION_MS })
  }

  const frozen = game.verdict !== null
  const left = clock.left

  // Declared BEFORE the interval below, so the deadline is in place before the first
  // tick can read it. Effects in one commit run in declaration order.
  useEffect(() => {
    deadlineRef.current = Date.now() + QUESTION_MS
  }, [game.index])

  useEffect(() => {
    // Stopped during a verdict, so the clock visibly halts the moment a tile is
    // tapped — which is what "the moment the user picks a word, it stops" looks like.
    if (frozen) return
    const id = setInterval(
      () => setClock((c) => ({ ...c, left: remainingMs(deadlineRef.current, Date.now()) })),
      100,
    )
    return () => clearInterval(id)
  }, [frozen, game.index])

  const latestTimeOut = useLatest(onTimeOut)
  useEffect(() => {
    if (frozen || left > 0) return
    // Fired from the SAME value the display shows, not a second timer — two clocks
    // would drift and the score would stop matching what was on screen.
    latestTimeOut.current()
  }, [frozen, left, latestTimeOut])

  const latestAdvance = useLatest(onAdvance)
  useEffect(() => {
    const verdict = game.verdict
    // A timeout is deliberately excluded: it waits for a tap, because that tap is the
    // only thing that can legally speak the next word.
    if (verdict === null || verdict.kind === 'timeout') return
    const id = setTimeout(() => latestAdvance.current(), VERDICT_MS)
    return () => clearTimeout(id)
  }, [game.verdict, latestAdvance])

  if (!question) return null

  /** Speak the word that comes after this one, if there is one. */
  const speakNext = () => {
    const next = game.questions[game.index + 1]
    if (next) speak(next.word.col2)
  }

  const pick = (choiceId: string) => {
    if (frozen) return
    /*
     * Scored from `left` — the value ON SCREEN — and deliberately NOT from a fresh
     * clock reading.
     *
     * A fresh reading is more precise and slightly wrong for it: the display is
     * repainted every 100ms, so a tap landing just after a whole-second boundary the
     * screen has not caught up with would award one point less than the number the
     * user was looking at when they tapped. That is the one defect this feature cannot
     * ship with (008 NFR-4), and it is worth up to 100ms of generosity to make it
     * unrepresentable rather than merely unlikely.
     */
    // Speech is SYNCHRONOUS, inside the tap, and before the state change. Moving it
    // into the advance timer below is the iOS bug described at the top of this file.
    speakNext()
    onAnswer(choiceId, left)
  }

  const verdict = game.verdict
  const seconds = displayedSeconds(left)

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {game.index + 1} / {game.questions.length}
        </p>
        <p className="badge bg-primary-soft font-semibold">
          {score.points} {score.points === 1 ? 'point' : 'points'}
        </p>
        <button type="button" onClick={onQuit} className="btn btn-quiet text-sm">
          Quit
        </button>
      </header>

      <div className="flex flex-col items-center gap-2">
        {/*
          The ring is driven by an inline stroke-dashoffset, NOT a CSS animation:
          prefers-reduced-motion zeroes every animation-duration in this app, which
          would freeze a CSS-animated ring at full and silently remove the countdown
          for exactly the users most likely to need the time.
        */}
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
          <circle
            cx="32"
            cy="32"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="6"
          />
          <circle
            cx="32"
            cy="32"
            r={RING_RADIUS}
            fill="none"
            stroke={seconds <= 3 ? 'var(--color-incorrect)' : 'var(--color-primary)'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - left / QUESTION_MS)}
          />
        </svg>
        {/*
          aria-hidden, and NOT a live region. A screen reader announcing "9… 8… 7…"
          every second would talk straight over the word the game just spoke.
        */}
        <p aria-hidden="true" className="text-2xl font-semibold tabular-nums">
          {seconds}
        </p>
        <p className="sr-only">
          Ten seconds for each word. The sooner you answer, the more points you score.
        </p>

        <button type="button" onClick={() => speak(question.word.col2)} className="btn btn-quiet text-sm">
          Hear it again
        </button>
      </div>

      {/*
        A CLOUD, not a grid: bare words scattered across the middle of the screen
        rather than six bordered boxes in two columns.

        EVERY WORD THE SAME SIZE, deliberately, and it is the one place this departs
        from what a word cloud normally is. Size in a real word cloud encodes frequency;
        here there is nothing for it to encode, and any variation at all would be read
        as a hint — the biggest word looks like the important one. Uniform size keeps
        all six options equally weighted, which is the whole point of the question.

        Colour and vertical nudge are picked by INDEX, never randomly. This component
        re-renders ten times a second to redraw the countdown, so anything random here
        would make the cloud twitch and re-colour itself under the player's thumb.
      */}
      <div
        role="group"
        aria-label="Choose the meaning"
        className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 py-2"
      >
        {question.options.map((option, i) => {
          const isAnswer = option.id === question.word.id
          const isChoice = verdict?.kind === 'wrong' && verdict.chose.id === option.id
          /*
           * Three independent channels for a wrong answer, never colour alone: the
           * word tapped turns red WITH a cross, the right one turns green with a tick,
           * and the line below says it in words.
           */
          const tone = !frozen
            ? CLOUD_TONES[i % CLOUD_TONES.length]
            : isAnswer
              ? 'text-correct'
              : isChoice
                ? 'text-incorrect'
                : 'text-ink-faint'
          return (
            <button
              key={option.id}
              type="button"
              disabled={frozen}
              onClick={() => pick(option.id)}
              /*
               * `min-h-11` by hand because this is not a `.btn` — the 44px rule is
               * baked into that class and a bare word has to carry it explicitly.
               * `break-words` so one very long entry cannot push the cloud sideways.
               */
              className={`min-h-11 max-w-full break-words rounded-md px-2 text-2xl font-semibold transition-colors ${tone} ${CLOUD_LIFT[i % CLOUD_LIFT.length]}`}
            >
              {frozen && isAnswer && <span aria-hidden="true">✓ </span>}
              {frozen && isChoice && <span aria-hidden="true">✗ </span>}
              {option.col1}
            </button>
          )
        })}
      </div>

      <p role="status" className="min-h-11 text-center font-semibold">
        {verdict?.kind === 'right' && (
          <span className="text-correct">
            Right — {verdict.points} {verdict.points === 1 ? 'point' : 'points'}
          </span>
        )}
        {verdict?.kind === 'wrong' && (
          <span className="text-incorrect">Wrong — it was “{verdict.answer.col1}”</span>
        )}
        {verdict?.kind === 'timeout' && (
          <span className="text-incorrect">Time&apos;s up — it was “{verdict.answer.col1}”</span>
        )}
      </p>

      {/*
        Only for a timeout, and it is the audio chain rather than a preference: this tap
        is the user gesture the next word's speech has to descend from.
      */}
      {verdict?.kind === 'timeout' && (
        <button
          type="button"
          onClick={() => {
            speakNext()
            onAdvance()
          }}
          className="btn btn-primary btn-lg"
        >
          Next word
        </button>
      )}
    </section>
  )
}
