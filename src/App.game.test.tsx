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

afterEach(() => {
  // Unmount FIRST. Swapping back to real timers while GameCloud is still mounted lets
  // its pending 100ms interval fire for real, outside act() — which shows up as an
  // "update not wrapped in act" warning on whichever test happens to be last.
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
