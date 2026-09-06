import { scoreGame } from '../game/scoring'
import type { Game } from '../game/types'
import { bandBorder } from '../state/scoreBand'

interface Props {
  game: Game
  /** True when the user quit rather than finishing. */
  partial: boolean
  onReplay: () => void
  onNewGame: () => void
  onDone: () => void
}

/**
 * How the round went, and two ways to go again.
 *
 * `bandBorder` is reused rather than re-derived: it takes a `Pick<>` of right/total/pct,
 * so a game can hand it its own numbers and the colour a good round wears here is the
 * same one it wears on the drill's history. A second threshold would drift.
 */
export function GameResults({ game, partial, onReplay, onNewGame, onDone }: Props) {
  const score = scoreGame(game)
  const pct = score.asked === 0 ? 0 : Math.round((score.correct / score.asked) * 100)

  /*
   * Paired from `answers` against `questions` by index — the two are filled in step, so
   * a quit game lines up correctly without the answers having to carry their question.
   */
  const missed = game.answers
    .map((a, i) => ({ answer: a, question: game.questions[i]! }))
    .filter(({ answer }) => !answer.correct)

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">
        {partial ? 'Game ended' : score.correct === score.asked ? 'Perfect round' : 'Game over'}
      </h1>

      <div className={`card flex flex-col gap-2 border-2 p-4 ${bandBorder({ right: score.correct, total: score.asked, pct })}`}>
        <p className="text-3xl font-semibold">
          {score.points} <span className="text-lg font-normal text-ink-muted">points</span>
        </p>
        <p className="text-ink-muted">
          {score.correct} of {score.asked} right · {score.points} out of {score.available} possible
        </p>
        {partial && (
          // Said plainly, so a short game is never mistaken for a full one.
          <p className="text-sm text-ink-muted">
            You left early, so this only counts the {score.asked}{' '}
            {score.asked === 1 ? 'word' : 'words'} you answered.
          </p>
        )}
      </div>

      {missed.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">Worth another look</h2>
          <ul className="flex flex-col gap-1">
            {missed.map(({ question, answer }, i) => (
              <li
                key={`${question.word.id}-${i}`}
                className="card flex items-baseline justify-between gap-3 p-3"
              >
                <span className="font-semibold">{question.word.col2}</span>
                <span className="text-ink-muted">{question.word.col1}</span>
                {answer.choiceId === null && (
                  <span className="badge bg-surface-sunken text-sm">ran out of time</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-muted">
            These have gone into “words you got wrong”, so you can drill them from the list.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {/* Same settings, new words — the ask's "re-do a game". */}
        <button type="button" onClick={onReplay} className="btn btn-primary btn-lg">
          Play again
        </button>
        <button type="button" onClick={onNewGame} className="btn btn-quiet">
          New game
        </button>
        <button type="button" onClick={onDone} className="btn btn-quiet">
          Done
        </button>
      </div>
    </section>
  )
}
