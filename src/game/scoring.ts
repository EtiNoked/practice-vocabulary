import { MAX_POINTS, type Game, type GameScore } from './types'

/**
 * What a correct answer is worth: whole seconds still on the clock.
 *
 * THE definition. Nothing else in this feature computes points, and nothing else
 * computes the countdown — see `displayedSeconds` immediately below.
 *
 * `ceil`, not `floor` or `round`, and the ask pins it: "if they pick after 3 seconds,
 * they have 7 points". Ceiling also gives each digit exactly one second of screen time
 * (10 from 0.0s to 1.0s elapsed, 9 from 1.0 to 2.0 …) and means the final sliver of the
 * clock is still worth 1 rather than silently worth nothing.
 */
export function pointsFor(remaining: number): number {
  return Math.max(0, Math.min(MAX_POINTS, Math.ceil(remaining / 1000)))
}

/**
 * The number the countdown shows.
 *
 * An ALIAS, deliberately, and not a second function that happens to agree (008 NFR-4).
 * A player who taps while the clock reads 7 and is awarded 6 has been lied to by the
 * interface, and it is the one defect here with no honest explanation. Two
 * implementations drift; one cannot.
 */
export const displayedSeconds = pointsFor

/**
 * Time left, derived from a DEADLINE rather than accumulated by a ticker (008 NFR-3).
 *
 * A tab that is backgrounded mid-question has its interval throttled to near-nothing, so
 * an accumulator would come back believing almost no time had passed and hand out points
 * for ten seconds the player never sat through. Subtracting from a deadline makes that
 * unrepresentable: come back late and the answer is 0, which is the truth.
 */
export function remainingMs(deadline: number, now: number): number {
  return Math.max(0, deadline - now)
}

/**
 * How the game went so far.
 *
 * Counted over ANSWERS GIVEN, not questions dealt — so a twenty-question game quit after
 * three is scored out of 30 and not out of 200. Same reasoning as `score()` for a drill:
 * quitting early should still yield a truthful number rather than a punitive one.
 */
export function scoreGame(game: Game): GameScore {
  const correct = game.answers.filter((a) => a.correct).length
  const points = game.answers.reduce((sum, a) => sum + a.points, 0)
  return {
    correct,
    asked: game.answers.length,
    points,
    available: game.answers.length * MAX_POINTS,
  }
}
