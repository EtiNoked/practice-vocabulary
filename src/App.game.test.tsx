import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listRepo } from './storage/listRepo'
import { gameRepo } from './storage/gameRepo'
import { sessionRepo } from './storage/sessionRepo'
import type { WordList } from './state/types'
import { speechCalls } from './test/setup'
import { renderApp } from './test/renderApp'
import { drillRepo } from './storage/drillRepo'
import { QUESTION_MS, VERDICT_MS } from './game/types'

/**
 * The game, end to end through the real App.
 *
 * `fireEvent` rather than `userEvent` for the same reason GameCloud's own test file
 * uses it: this screen runs a 100ms interval under fake timers, and userEvent drives
 * timers of its own until the two deadlock.
 */

const food: WordList = {
  id: 'food',
  name: 'Food',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [
    { id: 'f1', col1: 'bread', col2: 'brood' },
    { id: 'f2', col1: 'cheese', col2: 'kaas' },
    { id: 'f3', col1: 'apple', col2: 'appel' },
    { id: 'f4', col1: 'milk', col2: 'melk' },
    { id: 'f5', col1: 'water', col2: 'water' },
    { id: 'f6', col1: 'sugar', col2: 'suiker' },
  ],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

const market: WordList = {
  ...food,
  id: 'market',
  name: 'Market',
  pairs: [
    { id: 'm1', col1: 'money', col2: 'geld' },
    { id: 'm2', col1: 'stall', col2: 'kraam' },
    { id: 'm3', col1: 'price', col2: 'prijs' },
    { id: 'm4', col1: 'basket', col2: 'mand' },
  ],
}

/** en → fr, so it can never join the other two. */
const paris: WordList = {
  ...food,
  id: 'paris',
  name: 'Paris',
  col2Lang: 'fr',
  pairs: [{ id: 'r1', col1: 'bread', col2: 'pain' }],
}

const click = (el: HTMLElement) => act(() => void fireEvent.click(el))
const wait = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

const spoken = () => speechCalls.filter((c) => c.type === 'speak')

/**
 * The words in the cloud.
 *
 * Found through the cloud's own `role="group"` rather than by a class name — a layout
 * class is not a contract, and the previous version of this helper broke the moment the
 * cloud stopped being a grid.
 */
const tiles = () => {
  const cloud = screen.queryByRole('group', { name: /choose the meaning/i })
  return cloud ? within(cloud).getAllByRole('button') : []
}

const openGame = () => {
  renderApp()
  click(screen.getByRole('button', { name: 'Play a game' }))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
})

afterEach(async () => {
  /*
   * Unmount inside act(), and BEFORE restoring real timers.
   *
   * A test that ends with the countdown still running leaves a queued React update
   * behind. Swapping the clock back underneath it lets that update land outside act(),
   * which surfaces as an "update not wrapped in act" warning on whichever test happened
   * to run last — intermittently, which is worse than always: a warning that appears
   * one run in three is a warning people learn to ignore.
   */
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
})

describe('setting a game up from the home screen', () => {
  it('reaches setup, counts a pool, and starts', async () => {
    listRepo.save(food)
    listRepo.save(market)
    openGame()

    expect(screen.getByRole('heading', { name: 'Play a game' })).toBeInTheDocument()

    click(screen.getByRole('button', { name: /Food/ }))
    expect(screen.getByRole('status')).toHaveTextContent('6')

    click(screen.getByRole('button', { name: /Market/ }))
    expect(screen.getByRole('status')).toHaveTextContent('10')

    click(screen.getByRole('button', { name: '10' }))
    click(screen.getByRole('button', { name: 'Start game' }))

    expect(screen.getByText('1 / 10')).toBeInTheDocument()
  })

  it('refuses to mix language pairs, and says why', () => {
    listRepo.save(food)
    listRepo.save(paris)
    openGame()

    click(screen.getByRole('button', { name: /Food/ }))
    const parisRow = screen.getByRole('button', { name: /Paris/ })
    expect(parisRow).toBeDisabled()
    expect(parisRow).toHaveTextContent(/one language pair/i)
  })

  it('speaks the first word from the Start tap itself (008 NFR-2)', () => {
    listRepo.save(food)
    openGame()
    click(screen.getByRole('button', { name: /Food/ }))
    click(screen.getByRole('button', { name: 'Start game' }))

    // Spoken in the LIST's language, and it is a col2 word — the thing you must hear.
    expect(spoken()).toHaveLength(1)
    expect(spoken()[0]).toMatchObject({ lang: 'nl-NL' })
    expect(food.pairs.map((p) => p.col2)).toContain(spoken()[0]!.text)
  })
})

describe('playing a round', () => {
  const startFood = () => {
    listRepo.save(food)
    openGame()
    click(screen.getByRole('button', { name: /Food/ }))
    click(screen.getByRole('button', { name: `All 6` }))
    click(screen.getByRole('button', { name: 'Start game' }))
  }

  it('scores a correct answer by the clock and moves on', async () => {
    startFood()
    await wait(3000)
    expect(screen.getByText('7')).toBeInTheDocument()

    // The tile whose text is the meaning of the word just spoken.
    const heard = spoken().at(-1)!.text
    const meaning = food.pairs.find((p) => p.col2 === heard)!.col1
    click(screen.getByRole('button', { name: meaning }))

    expect(screen.getByRole('status')).toHaveTextContent(/right — 7 points/i)
    await wait(VERDICT_MS)
    expect(screen.getByText('2 / 6')).toBeInTheDocument()
    expect(screen.getByText(/7 points/)).toBeInTheDocument()
  })

  it('signals a wrong answer three ways and scores nothing', async () => {
    startFood()
    const heard = spoken().at(-1)!.text
    const meaning = food.pairs.find((p) => p.col2 === heard)!.col1
    const wrong = tiles().find((t) => t.textContent !== meaning)!
    const wrongText = wrong.textContent
    click(wrong)

    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`wrong — it was “${meaning}”`, 'i'))
    expect(screen.getByRole('button', { name: meaning })).toHaveTextContent('✓')
    expect(screen.getByRole('button', { name: wrongText! })).toHaveTextContent('✗')
    expect(screen.getByText(/0 points/)).toBeInTheDocument()
  })

  it('waits for a tap after a timeout, and speaks only then (008 FR-20)', async () => {
    startFood()
    const before = spoken().length

    await wait(QUESTION_MS)
    expect(screen.getByRole('status')).toHaveTextContent(/time.s up/i)

    // The critical assertion: NOTHING was spoken from the timer callback.
    await wait(VERDICT_MS * 3)
    expect(spoken()).toHaveLength(before)
    expect(screen.getByText('1 / 6')).toBeInTheDocument()

    click(screen.getByRole('button', { name: 'Next word' }))
    expect(spoken().length).toBe(before + 1)
    expect(screen.getByText('2 / 6')).toBeInTheDocument()
  })
})

describe('finishing, and going again', () => {
  /** Play every question wrong, as fast as the clock allows. */
  const playThrough = async () => {
    for (;;) {
      const cloud = tiles()
      if (cloud.length === 0) break
      const heard = spoken().at(-1)!.text
      const meaning = food.pairs.find((p) => p.col2 === heard)?.col1
      click(cloud.find((t) => t.textContent !== meaning) ?? cloud[0]!)
      await wait(VERDICT_MS)
    }
  }

  const startShort = () => {
    listRepo.save(food)
    openGame()
    click(screen.getByRole('button', { name: /Food/ }))
    const box = screen.getByRole('spinbutton')
    fireEvent.change(box, { target: { value: '4' } })
    click(screen.getByRole('button', { name: 'Start game' }))
  }

  it('reaches results and reports the score', async () => {
    startShort()
    await playThrough()
    expect(screen.getByRole('heading', { name: /game over/i })).toBeInTheDocument()
    expect(screen.getByText(/0 of 4 right/)).toBeInTheDocument()
  })

  it('records the game, so it survives a reload', async () => {
    startShort()
    await playThrough()
    const stored = gameRepo.getAll()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ asked: 4, correct: 0, listIds: ['food'] })
  })

  it('plays again with the same settings and a fresh draw', async () => {
    startShort()
    await playThrough()
    click(screen.getByRole('button', { name: 'Play again' }))
    expect(screen.getByText('1 / 4')).toBeInTheDocument()
  })

  it('speaks the first word of the replay from that tap', async () => {
    startShort()
    await playThrough()
    const before = spoken().length
    click(screen.getByRole('button', { name: 'Play again' }))
    expect(spoken().length).toBe(before + 1)
  })

  it('returns to setup with the settings pre-filled', async () => {
    startShort()
    await playThrough()
    click(screen.getByRole('button', { name: 'New game' }))
    expect(screen.getByRole('heading', { name: 'Play a game' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Food/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('a game teaches the drill (008 D-3)', () => {
  it('puts what it missed into the list’s “words you missed” chips', async () => {
    listRepo.save(food)
    openGame()
    click(screen.getByRole('button', { name: /Food/ }))
    const box = screen.getByRole('spinbutton')
    fireEvent.change(box, { target: { value: '4' } })
    click(screen.getByRole('button', { name: 'Start game' }))

    for (;;) {
      const cloud = tiles()
      if (cloud.length === 0) break
      const heard = spoken().at(-1)!.text
      const meaning = food.pairs.find((p) => p.col2 === heard)?.col1
      click(cloud.find((t) => t.textContent !== meaning) ?? cloud[0]!)
      await wait(VERDICT_MS)
    }

    click(screen.getByRole('button', { name: 'Done' }))
    // Back on home, into the list's ready screen the ordinary way.
    click(screen.getByRole('button', { name: /practise/i }))

    // Four words got wrong in a game, offered back on the drill's ready screen.
    const chip = screen.getByRole('button', { name: /All time · 4/ })
    expect(chip).toBeEnabled()
  })

  it('does not claim history is degraded — no game predates right-answer recording', async () => {
    listRepo.save(food)
    openGame()
    click(screen.getByRole('button', { name: /Food/ }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } })
    click(screen.getByRole('button', { name: 'Start game' }))
    for (;;) {
      const cloud = tiles()
      if (cloud.length === 0) break
      click(cloud[0]!)
      await wait(VERDICT_MS)
    }
    click(screen.getByRole('button', { name: 'Done' }))
    click(screen.getByRole('button', { name: /practise/i }))
    expect(screen.queryByText(/before right answers were saved/i)).not.toBeInTheDocument()
  })
})

describe('a game is not a drill', () => {
  it('writes nothing to the drill history', async () => {
    listRepo.save(food)
    openGame()
    click(screen.getByRole('button', { name: /Food/ }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } })
    click(screen.getByRole('button', { name: 'Start game' }))
    for (;;) {
      const cloud = tiles()
      if (cloud.length === 0) break
      click(cloud[0]!)
      await wait(VERDICT_MS)
    }
    // An auto-marked score must never enter the self-marked average.
    expect(sessionRepo.getAll()).toEqual([])
  })

  it('quitting records only what was answered, and says so', async () => {
    listRepo.save(food)
    openGame()
    click(screen.getByRole('button', { name: /Food/ }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '6' } })
    click(screen.getByRole('button', { name: 'Start game' }))

    click(tiles()[0]!)
    await wait(VERDICT_MS)
    click(screen.getByRole('button', { name: 'Quit' }))

    expect(screen.getByText(/you left early/i)).toBeInTheDocument()
    expect(gameRepo.getAll()[0]).toMatchObject({ asked: 1, partial: true })
  })

  it('is lost on reload, and takes no parked drill with it (008 D-8)', () => {
    listRepo.save(food)
    openGame()
    click(screen.getByRole('button', { name: /Food/ }))
    click(screen.getByRole('button', { name: 'All 6' }))
    click(screen.getByRole('button', { name: 'Start game' }))

    // Nothing is parked: a timed round has no honest resume.
    expect(drillRepo.load()).toBeNull()
  })
})

describe('which side is heard, and which side is answered (008 D-5)', () => {
  /*
   * The app's standing promise, made in words on the drill's ready screen: you HEAR
   * col2 and ANSWER in col1. The game has to keep it, and two ways of breaking it are
   * silent — speaking the answer instead of the prompt (which gives the game away), and
   * speaking the right text under the wrong language tag (right words, wrong accent,
   * and on a real device often no voice at all).
   *
   * The fixtures below share no text between the two columns, so an assertion can tell
   * the sides apart without ambiguity.
   */
  const col1s = food.pairs.map((p) => p.col1)
  const col2s = food.pairs.map((p) => p.col2)

  const startFullGame = () => {
    listRepo.save(food)
    openGame()
    click(screen.getByRole('button', { name: /Food/ }))
    click(screen.getByRole('button', { name: 'All 6' }))
    click(screen.getByRole('button', { name: 'Start game' }))
  }

  it('speaks a col2 word, never a col1 word', () => {
    startFullGame()
    expect(col2s).toContain(spoken()[0]!.text)
    expect(col1s).not.toContain(spoken()[0]!.text)
  })

  it('tags every utterance with the list’s col2 language', () => {
    startFullGame()
    expect(spoken()[0]).toMatchObject({ lang: 'nl-NL' })
  })

  it('keeps that true for EVERY word of a whole round, not just the first', async () => {
    startFullGame()
    for (;;) {
      const cloud = tiles()
      if (cloud.length === 0) break
      click(cloud[0]!)
      await wait(VERDICT_MS)
    }
    expect(spoken().length).toBeGreaterThan(1)
    for (const call of spoken()) {
      expect(col2s).toContain(call.text)
      expect(call.lang).toBe('nl-NL')
    }
  })

  it('puts col1 in the cloud and never shows the word being spoken', () => {
    startFullGame()
    const shown = tiles().map((t) => t.textContent)
    for (const word of shown) expect(col1s).toContain(word)
    // The prompt must not be readable anywhere on the screen.
    expect(shown).not.toContain(spoken()[0]!.text)
    expect(screen.queryByText(spoken()[0]!.text)).not.toBeInTheDocument()
  })

  it('re-speaks the same col2 word on "Hear it again", in the same language', () => {
    startFullGame()
    const first = spoken()[0]!
    click(screen.getByRole('button', { name: 'Hear it again' }))
    expect(spoken().at(-1)).toMatchObject({ text: first.text, lang: 'nl-NL' })
  })

  it('follows the LIST’s own languages, not a hardcoded pair', () => {
    /*
     * A French→Dutch list: col1 is French, col2 is Dutch. If anything anywhere assumed
     * "col1 is English", this is where it shows up.
     */
    const frnl: WordList = {
      ...food,
      id: 'frnl',
      name: 'Bilingual',
      col1Lang: 'fr',
      col2Lang: 'nl',
      pairs: [
        { id: 'b1', col1: 'pain', col2: 'brood' },
        { id: 'b2', col1: 'fromage', col2: 'kaas' },
        { id: 'b3', col1: 'pomme', col2: 'appel' },
        { id: 'b4', col1: 'lait', col2: 'melk' },
      ],
    }
    listRepo.save(frnl)
    openGame()
    click(screen.getByRole('button', { name: /Bilingual/ }))
    click(screen.getByRole('button', { name: 'All 4' }))
    click(screen.getByRole('button', { name: 'Start game' }))

    // Spoken in DUTCH (col2), and the cloud is French (col1).
    expect(spoken()[0]).toMatchObject({ lang: 'nl-NL' })
    expect(frnl.pairs.map((p) => p.col2)).toContain(spoken()[0]!.text)
    for (const word of tiles().map((t) => t.textContent)) {
      expect(frnl.pairs.map((p) => p.col1)).toContain(word)
    }
  })

  it('promises on the setup screen exactly what the game then does', () => {
    listRepo.save(food)
    openGame()
    click(screen.getByRole('button', { name: /Food/ }))
    // "You'll hear Dutch and pick the English" — col2 heard, col1 answered.
    expect(screen.getByRole('status')).toHaveTextContent(/hear Dutch/i)
    expect(screen.getByRole('status')).toHaveTextContent(/pick the English/i)

    click(screen.getByRole('button', { name: 'All 6' }))
    click(screen.getByRole('button', { name: 'Start game' }))
    expect(spoken()[0]).toMatchObject({ lang: 'nl-NL' })
    expect(col1s).toContain(tiles()[0]!.textContent)
  })
})
