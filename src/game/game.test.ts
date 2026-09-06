import { describe, expect, it } from 'vitest'
import { advance, answer, createGame, currentQuestion, isFinished, replay, timeOut } from './game'
import { QUESTION_MS, type GameSettings } from './types'
import { seededRng } from '../state/session'
import type { PooledWord } from '../state/wordPool'

const POOL: PooledWord[] = [
  'bread/brood',
  'cheese/kaas',
  'apple/appel',
  'money/geld',
  'water/water',
  'milk/melk',
  'sugar/suiker',
  'salt/zout',
].map((s, i) => ({
  id: `w${i}`,
  col1: s.split('/')[0]!,
  col2: s.split('/')[1]!,
  listId: 'l1',
  listName: 'Food',
}))

const settings: GameSettings = {
  spec: { listIds: ['l1'], source: 'all' },
  count: 4,
  col1Lang: 'en',
  col2Lang: 'nl',
}

const start = (seed = 1) => createGame(settings, POOL, seededRng(seed))

/** Answer the current question correctly, with `remaining` on the clock. */
const answerRight = (g: ReturnType<typeof start>, remaining = QUESTION_MS) =>
  answer(g, currentQuestion(g)!.word.id, remaining)

/** Answer the current question with a tile that is definitely not the answer. */
const answerWrong = (g: ReturnType<typeof start>, remaining = QUESTION_MS) => {
  const q = currentQuestion(g)!
  return answer(g, q.options.find((o) => o.id !== q.word.id)!.id, remaining)
}

describe('createGame', () => {
  it('deals `count` questions from the pool', () => {
    expect(start().questions).toHaveLength(4)
  })

  it('starts at the first question with nothing answered', () => {
    const g = start()
    expect(g).toMatchObject({ index: 0, answers: [], verdict: null })
  })

  it('keeps the pool as a snapshot, so replay has something to draw from', () => {
    expect(start().pool).toEqual(POOL)
  })

  it('keeps the settings it was given', () => {
    expect(start().settings).toEqual(settings)
  })

  it('clamps a count above the pool size', () => {
    const g = createGame({ ...settings, count: 999 }, POOL, seededRng(1))
    expect(g.questions).toHaveLength(POOL.length)
  })
})

describe('currentQuestion', () => {
  it('is the question at the index', () => {
    const g = start()
    expect(currentQuestion(g)).toBe(g.questions[0])
  })

  it('is null past the end', () => {
    const g = { ...start(), index: 99 }
    expect(currentQuestion(g)).toBeNull()
  })
})

describe('answer', () => {
  it('banks the clock as points when right', () => {
    const g = answerRight(start(), QUESTION_MS - 3000)
    expect(g.answers[0]).toMatchObject({ correct: true, points: 7, remainingMs: 7000 })
  })

  it('banks nothing when wrong, however fast (008 D-4)', () => {
    const g = answerWrong(start(), QUESTION_MS)
    expect(g.answers[0]).toMatchObject({ correct: false, points: 0 })
  })

  it('records which tile was tapped', () => {
    const g = start()
    const chosen = currentQuestion(g)!.options[0]!.id
    expect(answer(g, chosen, QUESTION_MS).answers[0]?.choiceId).toBe(chosen)
  })

  it('sets a right verdict carrying the points', () => {
    expect(answerRight(start(), 7000).verdict).toEqual({ kind: 'right', points: 7 })
  })

  it('sets a wrong verdict carrying BOTH what was picked and what was right', () => {
    // The screen has to show the user their mistake next to the answer (008 FR-19).
    const g = start()
    const q = currentQuestion(g)!
    const chose = q.options.find((o) => o.id !== q.word.id)!
    expect(answer(g, chose.id, QUESTION_MS).verdict).toEqual({
      kind: 'wrong',
      chose,
      answer: q.word,
    })
  })

  it('does NOT advance — the screen owns the pause that shows the verdict', () => {
    expect(answerRight(start()).index).toBe(0)
  })

  it('ignores a second tap while a verdict is showing (008 R6)', () => {
    /*
     * Two tiles can be hit in the same frame on a touchscreen. Without this guard the
     * second tap appends a second answer to one question, and the game silently scores
     * more answers than it asked questions.
     */
    const once = answerRight(start())
    const twice = answer(once, 'w0', QUESTION_MS)
    expect(twice.answers).toHaveLength(1)
    expect(twice).toBe(once)
  })

  it('ignores an answer past the last question', () => {
    const done = { ...start(), index: 99 }
    expect(answer(done, 'w0', QUESTION_MS)).toBe(done)
  })

  it('never mutates the game it was given', () => {
    const g = start()
    const before = structuredClone(g)
    answerRight(g)
    expect(g).toEqual(before)
  })
})

describe('timeOut', () => {
  it('scores nothing and records an empty clock', () => {
    const g = timeOut(start())
    expect(g.answers[0]).toMatchObject({
      choiceId: null,
      correct: false,
      points: 0,
      remainingMs: 0,
    })
  })

  it('reveals the answer in the verdict', () => {
    const g = start()
    expect(timeOut(g).verdict).toEqual({ kind: 'timeout', answer: currentQuestion(g)!.word })
  })

  it('does not advance — a timeout waits for a tap (008 FR-20)', () => {
    expect(timeOut(start()).index).toBe(0)
  })

  it('cannot fire on top of an answer already given', () => {
    // The clock is stopped the moment a tile is tapped; a late tick must change nothing.
    const answered = answerRight(start())
    expect(timeOut(answered)).toBe(answered)
  })
})

describe('advance', () => {
  it('moves to the next question and clears the verdict', () => {
    expect(advance(answerRight(start()))).toMatchObject({ index: 1, verdict: null })
  })

  it('keeps the answers already banked', () => {
    expect(advance(answerRight(start())).answers).toHaveLength(1)
  })
})

describe('isFinished', () => {
  it('is false at the start', () => {
    expect(isFinished(start())).toBe(false)
  })

  it('is true once every question has been advanced past', () => {
    let g = start()
    for (let i = 0; i < 4; i++) g = advance(answerRight(g))
    expect(isFinished(g)).toBe(true)
  })

  it('is false on the last question, before it is advanced past', () => {
    let g = start()
    for (let i = 0; i < 3; i++) g = advance(answerRight(g))
    expect(isFinished(g)).toBe(false)
  })
})

describe('replay (008 D-9)', () => {
  it('keeps the settings exactly', () => {
    expect(replay(start(), seededRng(99)).settings).toEqual(settings)
  })

  it('keeps the same pool snapshot — it never reaches for live lists', () => {
    const g = start()
    expect(replay(g, seededRng(99)).pool).toBe(g.pool)
  })

  it('deals a different round from that same pool', () => {
    const first = start(1)
    const again = replay(first, seededRng(42))
    expect(again.questions.map((q) => q.word.id)).not.toEqual(
      first.questions.map((q) => q.word.id),
    )
  })

  it('starts clean, discarding the finished round', () => {
    let g = start()
    g = advance(answerRight(g))
    expect(replay(g, seededRng(7))).toMatchObject({ index: 0, answers: [], verdict: null })
  })

  it('asks the same number of questions', () => {
    expect(replay(start(), seededRng(3)).questions).toHaveLength(4)
  })
})
