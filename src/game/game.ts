import { buildQuestions } from './questions'
import { pointsFor } from './scoring'
import type { Game, GameSettings, Question } from './types'
import type { Rng } from '../state/session'
import type { PooledWord } from '../state/wordPool'

/**
 * The game's transitions. Pure, total, and never mutating what they are handed — the
 * same contract session.ts keeps for the drill, and for the same reason: the reducer
 * that drives these has to stay free of side effects.
 *
 * Nothing here reads a clock. `remainingMs` arrives from the screen, which owns the
 * countdown, so the whole engine is testable without faking time (008 NFR-1).
 */

/** Deal a fresh round. `count` is clamped to the pool by `buildQuestions`. */
export function createGame(
  settings: GameSettings,
  pool: readonly PooledWord[],
  rng: Rng,
): Game {
  return {
    settings,
    // Held as a snapshot so `replay` can re-draw without the live lists (008 D-9).
    pool,
    questions: buildQuestions(pool, settings.count, rng),
    index: 0,
    answers: [],
    verdict: null,
  }
}

export function currentQuestion(game: Game): Question | null {
  return game.questions[game.index] ?? null
}

export function isFinished(game: Game): boolean {
  return game.index >= game.questions.length
}

/**
 * Record a tap.
 *
 * A NO-OP while a verdict is already showing, and that guard is not theoretical: two
 * tiles can be hit in the same frame on a touchscreen, and without it the second tap
 * appends a second answer to a question that has already been scored — so the game
 * quietly reports more answers than it asked questions.
 *
 * Deliberately does not advance. The screen holds the verdict for a beat so the user can
 * see what happened, and — for a wrong answer — what the right one was.
 */
export function answer(game: Game, choiceId: string, remainingMs: number): Game {
  const question = currentQuestion(game)
  if (!question || game.verdict !== null) return game

  const correct = choiceId === question.word.id
  // Wrong scores nothing however fast it came (008 D-4). Speed rewards knowing, not
  // guessing, and a fast wrong answer is the purest guess there is.
  const points = correct ? pointsFor(remainingMs) : 0

  return {
    ...game,
    answers: [...game.answers, { choiceId, correct, points, remainingMs }],
    verdict: correct
      ? { kind: 'right', points }
      : {
          kind: 'wrong',
          // BOTH sides, because the screen has to show the mistake beside the answer —
          // a verdict that only says "wrong" teaches nothing (008 FR-19).
          chose: question.options.find((o) => o.id === choiceId) ?? question.word,
          answer: question.word,
        },
  }
}

/**
 * The clock ran out.
 *
 * Cannot fire on top of an answer: the countdown is stopped the moment a tile is tapped,
 * but a tick already in flight must not overwrite the verdict the user just earned.
 */
export function timeOut(game: Game): Game {
  const question = currentQuestion(game)
  if (!question || game.verdict !== null) return game

  return {
    ...game,
    answers: [...game.answers, { choiceId: null, correct: false, points: 0, remainingMs: 0 }],
    verdict: { kind: 'timeout', answer: question.word },
  }
}

/** Move to the next question, clearing the verdict. */
export function advance(game: Game): Game {
  return { ...game, index: game.index + 1, verdict: null }
}

/**
 * Play the same settings again, freshly drawn — the ask's "re-do a game and you will get
 * a new set of random words".
 *
 * Re-samples from `game.pool`, NOT from the lists as they stand now (008 D-9). The user
 * chose a length against a pool size they were shown; a replay that quietly grew because
 * another tab edited a list would contradict the number they decided on.
 */
export function replay(game: Game, rng: Rng): Game {
  return createGame(game.settings, game.pool, rng)
}
