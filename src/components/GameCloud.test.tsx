import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameCloud } from './GameCloud'
import { createGame, currentQuestion, answer as answerGame, timeOut as timeOutGame } from '../game/game'
import { QUESTION_MS, VERDICT_MS, type Game, type GameSettings } from '../game/types'
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

const freshGame = () => createGame(settings, POOL, seededRng(1))

/*
 * `fireEvent`, not `userEvent`, and it is the one place in this codebase that departs
 * from the house style.
 *
 * userEvent is asynchronous and drives its own timers between events. Against a
 * component with a 100ms interval and fake timers installed, the two wind each other
 * and a single click either hangs or burns the whole question before it lands. Every
 * interaction here is a plain click on a plain button, so the realism userEvent buys
 * is worth nothing against a whole class of test deadlock it costs.
 */
const setup = (game: Game = freshGame()) => {
  const speak = vi.fn()
  const onAnswer = vi.fn()
  const onTimeOut = vi.fn()
  const onAdvance = vi.fn()
  const onQuit = vi.fn()
  const view = render(
    <GameCloud
      game={game}
      speak={speak}
      onAnswer={onAnswer}
      onTimeOut={onTimeOut}
      onAdvance={onAdvance}
      onQuit={onQuit}
    />,
  )
  return {
    ...view,
    speak,
    onAnswer,
    onTimeOut,
    onAdvance,
    onQuit,
    game,
  }
}

/** Push the clock forward inside act(), so React flushes what the tick caused. */
const wait = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

/** A click, flushed. */
const click = (el: HTMLElement) => act(() => void fireEvent.click(el))

const rightTile = (game: Game) => screen.getByRole('button', { name: currentQuestion(game)!.word.col1 })
const wrongTileWord = (game: Game) => {
  const q = currentQuestion(game)!
  return q.options.find((o) => o.id !== q.word.id)!
}

beforeEach(() =>
  // Explicit list: faking queueMicrotask (which the default set includes) makes every
  // `await` in userEvent hang forever, and the symptom is a 5s test timeout with no
  // clue what is waiting on what.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }),
)
afterEach(async () => {
  // Unmount inside act(), before restoring real timers — see the note in
  // App.game.test.tsx for why this is not just tidiness.
  /*
   * The flush is the load-bearing part, and what it is waiting for is the store write.
   *
   * Recording a finished game is fire-and-forget (`void store.recordGame(...)`), so its
   * subscription re-emit — and the setState on App that follows — lands a microtask
   * after the click that caused it. A test that ends on that click leaves the update in
   * flight, and it arrives outside act(). It showed up intermittently, on whichever run
   * happened to be slow enough, which is worse than always: a warning that appears one
   * run in three is one people learn to scroll past.
   */
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the board', () => {
  it('shows position and running score', () => {
    setup()
    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.getByText(/0 points/)).toBeInTheDocument()
  })

  it('shows a full cloud of options', () => {
    const { game } = setup()
    for (const option of currentQuestion(game)!.options) {
      expect(screen.getByRole('button', { name: option.col1 })).toBeInTheDocument()
    }
  })

  it('shows the meanings, never the word being spoken', () => {
    const { game } = setup()
    // You hear col2 and pick col1 — the prompt must not be written on the screen.
    expect(screen.queryByText(currentQuestion(game)!.word.col2)).not.toBeInTheDocument()
  })

  it('starts the countdown at the full ten', () => {
    setup()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('quits', async () => {
    const { onQuit } = setup()
    click(screen.getByRole('button', { name: 'Quit' }))
    expect(onQuit).toHaveBeenCalled()
  })
})

describe('the countdown', () => {
  it('counts down one digit per second', async () => {
    setup()
    await wait(1000)
    expect(screen.getByText('9')).toBeInTheDocument()
    await wait(3000)
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('is hidden from screen readers, and is not a live region', () => {
    setup()
    // "9… 8… 7…" every second would talk straight over the spoken word.
    const digit = screen.getByText('10')
    expect(digit).toHaveAttribute('aria-hidden', 'true')
  })

  it('describes itself once, statically, for screen readers', () => {
    setup()
    expect(screen.getByText(/ten seconds for each word/i)).toBeInTheDocument()
  })

  it('calls onTimeOut when it reaches zero', async () => {
    const { onTimeOut } = setup()
    await wait(QUESTION_MS)
    expect(onTimeOut).toHaveBeenCalled()
  })

  it('stops dead once a verdict is showing', async () => {
    // Through the real flow: the clock has to have ticked down before the tap, or the
    // component is simply mounted into a state it would never reach that way.
    const game = freshGame()
    const { rerender } = setup(game)
    await wait(3000)
    expect(screen.getByText('7')).toBeInTheDocument()

    rerender(
      <GameCloud
        game={answerGame(game, currentQuestion(game)!.word.id, 7000)}
        speak={vi.fn()}
        onAnswer={vi.fn()}
        onTimeOut={vi.fn()}
        onAdvance={vi.fn()}
        onQuit={vi.fn()}
      />,
    )
    await wait(3000)
    // Still 7 — the interval is torn down while a verdict is up.
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('does not call onTimeOut on top of an answer already given', async () => {
    const game = freshGame()
    const answered = answerGame(game, currentQuestion(game)!.word.id, 7000)
    const { onTimeOut } = setup(answered)
    await wait(QUESTION_MS * 2)
    expect(onTimeOut).not.toHaveBeenCalled()
  })
})

describe('answering', () => {
  it('scores the number that is on the screen (008 NFR-4)', async () => {
    const { onAnswer, game } = setup()
    await wait(3000)
    expect(screen.getByText('7')).toBeInTheDocument()
    click(rightTile(game))
    // Whatever remaining time is reported must round to the 7 the user tapped under.
    const [, remaining] = onAnswer.mock.calls[0]!
    expect(Math.ceil(remaining / 1000)).toBe(7)
  })

  it('reports which tile was tapped', async () => {
    const { onAnswer, game } = setup()
    const q = currentQuestion(game)!
    click(screen.getByRole('button', { name: q.word.col1 }))
    expect(onAnswer.mock.calls[0]?.[0]).toBe(q.word.id)
  })

  it('ignores further taps once a verdict is showing (008 R6)', async () => {
    const game = freshGame()
    const answered = answerGame(game, currentQuestion(game)!.word.id, 7000)
    const { onAnswer } = setup(answered)
    const tile = screen.getByRole('button', { name: currentQuestion(answered)!.options[0]!.col1 })
    expect(tile).toBeDisabled()
    click(tile)
    expect(onAnswer).not.toHaveBeenCalled()
  })
})

describe('the verdict', () => {
  it('says so, and how many points, when right', () => {
    const game = freshGame()
    setup(answerGame(game, currentQuestion(game)!.word.id, 7000))
    expect(screen.getByRole('status')).toHaveTextContent(/right — 7 points/i)
  })

  it('names the answer when wrong, in words as well as colour (008 FR-19)', () => {
    const game = freshGame()
    const q = currentQuestion(game)!
    setup(answerGame(game, wrongTileWord(game).id, 7000))
    expect(screen.getByRole('status')).toHaveTextContent(
      new RegExp(`wrong — it was “${q.word.col1}”`, 'i'),
    )
  })

  it('marks BOTH the tile tapped and the right one, with a glyph not just a colour', () => {
    const game = freshGame()
    const q = currentQuestion(game)!
    const chose = wrongTileWord(game)
    setup(answerGame(game, chose.id, 7000))
    /*
     * The glyphs are aria-hidden, so they are deliberately NOT part of the accessible
     * name — a screen reader gets the verdict line instead of "cross bread". They are
     * the channel for a sighted user who cannot rely on the red, so they are asserted
     * on the rendered text.
     */
    expect(screen.getByRole('button', { name: chose.col1 })).toHaveTextContent('✗')
    expect(screen.getByRole('button', { name: q.word.col1 })).toHaveTextContent('✓')
  })

  it('advances on its own after a tapped answer', async () => {
    const game = freshGame()
    const { onAdvance } = setup(answerGame(game, currentQuestion(game)!.word.id, 7000))
    expect(onAdvance).not.toHaveBeenCalled()
    await wait(VERDICT_MS)
    expect(onAdvance).toHaveBeenCalled()
  })
})

describe('the audio chain (008 NFR-2 — the iOS rule)', () => {
  it('speaks the NEXT word from inside the answer tap', async () => {
    const { speak, game } = setup()
    const next = game.questions[1]!.word.col2
    click(rightTile(game))
    expect(speak).toHaveBeenCalledWith(next)
  })

  it('speaks nothing extra on the last question', async () => {
    const game = createGame({ ...settings, count: 1 }, POOL, seededRng(1))
    const { speak } = setup(game)
    click(rightTile(game))
    expect(speak).not.toHaveBeenCalled()
  })

  it('speaks NOTHING on a timeout — there is no gesture to descend from', async () => {
    /*
     * The defect this guards is invisible here and fatal on an iPhone: speech from a
     * timer callback is dropped silently, so the game would go quiet for good and the
     * prompt IS the question.
     */
    const game = freshGame()
    const { speak } = setup(timeOutGame(game))
    await wait(VERDICT_MS * 3)
    expect(speak).not.toHaveBeenCalled()
  })

  it('does NOT auto-advance a timeout', async () => {
    const game = freshGame()
    const { onAdvance } = setup(timeOutGame(game))
    await wait(VERDICT_MS * 3)
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('waits for a tap, and speaks the next word from THAT tap', async () => {
    const game = freshGame()
    const { speak, onAdvance } = setup(timeOutGame(game))
    expect(screen.getByRole('status')).toHaveTextContent(/time.s up — it was/i)
    click(screen.getByRole('button', { name: 'Next word' }))
    expect(speak).toHaveBeenCalledWith(game.questions[1]!.word.col2)
    expect(onAdvance).toHaveBeenCalled()
  })

  it('offers no "Next word" button while the clock is still running', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Next word' })).not.toBeInTheDocument()
  })

  it('re-speaks the current word on demand, without touching the clock (008 FR-16)', async () => {
    const { speak, game } = setup()
    await wait(2000)
    click(screen.getByRole('button', { name: 'Hear it again' }))
    expect(speak).toHaveBeenCalledWith(currentQuestion(game)!.word.col2)
    // The clock kept running rather than resetting to 10.
    expect(screen.getByText('8')).toBeInTheDocument()
  })
})

describe('moving between questions', () => {
  it('gives each new question a full clock', async () => {
    const game = freshGame()
    const { rerender } = setup(game)
    await wait(4000)
    expect(screen.getByText('6')).toBeInTheDocument()

    const next = { ...game, index: 1, answers: [], verdict: null }
    rerender(
      <GameCloud
        game={next}
        speak={vi.fn()}
        onAnswer={vi.fn()}
        onTimeOut={vi.fn()}
        onAdvance={vi.fn()}
        onQuit={vi.fn()}
      />,
    )
    // A full ten immediately — never one frame of the previous question's clock.
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
  })
})

describe('the cloud (008 D-1)', () => {
  const cloud = () => screen.getByRole('group', { name: /choose the meaning/i })
  const words = () => within(cloud()).getAllByRole('button')

  it('holds every option and nothing else', () => {
    const { game } = setup()
    expect(words().map((w) => w.textContent)).toEqual(
      currentQuestion(game)!.options.map((o) => o.col1),
    )
  })

  it('gives EVERY word the same size', () => {
    setup()
    /*
     * The point of the cloud, and the one way it departs from what a word cloud
     * normally is. Size in a real word cloud encodes frequency; here there is nothing
     * for it to encode, so any variation would be read as a hint — the biggest word
     * looks like the important one. This fails the moment someone "improves" the
     * cloud by scaling its words.
     */
    const SIZE = /^text-(?:xs|sm|base|lg|xl|\d+xl|word)$/
    const sizeOf = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => SIZE.test(c))

    // Every word carries exactly one size class, and it is the same one for all of them.
    expect(words().every((w) => sizeOf(w).length === 1)).toBe(true)
    expect(new Set(words().map((w) => sizeOf(w)[0])).size).toBe(1)
  })

  it('keeps every word a 44px touch target, though it is not a .btn', () => {
    setup()
    // The rule lives in `.btn`, and these are bare words — so it has to be explicit.
    expect(words().every((w) => w.className.includes('min-h-11'))).toBe(true)
  })

  it('colours and staggers by position, so a redraw cannot reshuffle the cloud', async () => {
    // This component re-renders ten times a second to move the countdown. Anything
    // random here would twitch and re-colour under the player's thumb.
    setup()
    const before = words().map((w) => w.className)
    await wait(2500)
    expect(words().map((w) => w.className)).toEqual(before)
  })

  it('uses no raw palette colour — the cloud is tokens like everything else', () => {
    setup()
    for (const word of words()) {
      expect(word.className).not.toMatch(/text-(red|blue|green|purple|orange|teal|pink)-\d/)
    }
  })
})
