import { describe, expect, it } from 'vitest'
import { displayedSeconds, pointsFor, remainingMs, scoreGame } from './scoring'
import { MAX_POINTS, QUESTION_MS, type Answer, type Game } from './types'

const answer = (over: Partial<Answer> = {}): Answer => ({
  choiceId: 'w1',
  correct: true,
  points: 7,
  remainingMs: 7000,
  ...over,
})

const game = (answers: Answer[], questionCount = answers.length): Game =>
  ({
    settings: { spec: { listIds: ['l1'], source: 'all' }, count: questionCount, col1Lang: 'en', col2Lang: 'nl' },
    pool: [],
    questions: Array.from({ length: questionCount }, () => ({ kind: 'hear-pick-meaning' })),
    index: answers.length,
    answers,
    verdict: null,
  }) as unknown as Game

describe('pointsFor — the clock IS the score', () => {
  it('is the ask, worked example and all: pick after 3 seconds and score 7', () => {
    expect(pointsFor(QUESTION_MS - 3000)).toBe(7)
  })

  it('is MAX_POINTS at the instant the question appears', () => {
    expect(pointsFor(QUESTION_MS)).toBe(MAX_POINTS)
  })

  it('is 1 for the last sliver of the clock, never a free 0', () => {
    expect(pointsFor(500)).toBe(1)
    expect(pointsFor(1)).toBe(1)
  })

  it('is 0 at the moment the clock runs out', () => {
    expect(pointsFor(0)).toBe(0)
  })

  it('clamps rather than trusting its caller', () => {
    expect(pointsFor(-5000)).toBe(0)
    expect(pointsFor(999_999)).toBe(MAX_POINTS)
  })

  it('gives every digit exactly one second of screen time', () => {
    // 10 shows from 0.0s to 1.0s elapsed, 9 from 1.0 to 2.0, and so on.
    const shown = Array.from({ length: 10 }, (_, sec) => pointsFor(QUESTION_MS - sec * 1000))
    expect(shown).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
  })
})

describe('the number on screen and the points banked cannot drift (008 NFR-4)', () => {
  /*
   * The one bug this feature cannot ship with: a user taps while the countdown reads 7
   * and is awarded 6. Two functions that merely agree today will drift, so there is only
   * one function and the other name is an alias of it. This test fails the moment
   * someone gives `displayedSeconds` a body of its own.
   */
  it('is literally the same function', () => {
    expect(displayedSeconds).toBe(pointsFor)
  })

  it('MAX_POINTS is QUESTION_MS in seconds, or the countdown starts on the wrong number', () => {
    expect(MAX_POINTS).toBe(QUESTION_MS / 1000)
  })
})

describe('remainingMs', () => {
  it('is the distance to the deadline', () => {
    expect(remainingMs(5000, 1500)).toBe(3500)
  })

  it('floors at zero — a passed deadline is not negative time', () => {
    expect(remainingMs(1000, 9000)).toBe(0)
  })

  it('is derived, so a backgrounded tab cannot bank time it did not play', () => {
    // Deadline set at t=0 for 10s; the tab comes back at t=30s.
    expect(remainingMs(QUESTION_MS, 30_000)).toBe(0)
  })
})

describe('scoreGame', () => {
  it('counts correct answers and sums points', () => {
    const score = scoreGame(
      game([
        answer({ points: 8 }),
        answer({ correct: false, points: 0 }),
        answer({ points: 5 }),
      ]),
    )
    expect(score).toEqual({ correct: 2, asked: 3, points: 13, available: 30 })
  })

  it('scores a game nobody answered as zero, not NaN', () => {
    expect(scoreGame(game([], 10))).toEqual({ correct: 0, asked: 0, points: 0, available: 0 })
  })

  it('measures `asked` by answers given, so quitting early still scores honestly', () => {
    // A 20-question game abandoned after 3 is out of 30, not out of 200.
    expect(scoreGame(game([answer(), answer(), answer()], 20))).toMatchObject({
      asked: 3,
      available: 30,
    })
  })

  it('gives a perfect instant round the full available score', () => {
    const perfect = [answer({ points: 10 }), answer({ points: 10 })]
    const score = scoreGame(game(perfect))
    expect(score.points).toBe(score.available)
  })
})
