import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GameSetup } from './GameSetup'
import { buildWordPool, poolSize, type PoolSpec } from '../state/wordPool'
import type { WordList } from '../state/types'
import type { MissSource } from '../state/missedWords'
import { MAX_GAME_WORDS, MIN_POOL } from '../game/types'

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0)

const makeList = (
  id: string,
  name: string,
  words: number,
  over: Partial<WordList> = {},
): WordList => ({
  id,
  name,
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: Array.from({ length: words }, (_, i) => ({
    id: `${id}-p${i}`,
    col1: `${id}-word-${i}`,
    col2: `${id}-vertaling-${i}`,
  })),
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
  ...over,
})

const food = makeList('l1', 'Food', 12)
const market = makeList('l2', 'Market', 9)
const paris = makeList('l3', 'Paris', 6, { col2Lang: 'fr' })

/*
 * The fixtures are the test. An override silently dropped here makes every
 * language-pair assertion below pass vacuously — nothing is ever blocked, and the
 * suite reports green on a rule it never exercised.
 */
describe('the fixtures themselves', () => {
  it('applies its overrides', () => {
    expect(paris.col2Lang).toBe('fr')
    expect(food.col2Lang).toBe('nl')
  })
})

const setup = (over: Partial<Parameters<typeof GameSetup>[0]> = {}, records: MissSource[] = []) => {
  const lists = over.lists ?? [food, market, paris]
  const onStart = vi.fn()
  const onBack = vi.fn()
  const onNewList = vi.fn()
  render(
    <GameSetup
      lists={lists}
      count={(spec: PoolSpec) => poolSize(lists, spec, { records, now: NOW })}
      onStart={onStart}
      onBack={onBack}
      onNewList={onNewList}
      {...over}
    />,
  )
  return { onStart, onBack, onNewList, user: userEvent.setup(), lists }
}

const listRow = (name: string) => screen.getByRole('button', { name: new RegExp(name) })
const start = () => screen.getByRole('button', { name: 'Start game' })

describe('with nothing to play', () => {
  it('says so and offers a way out', async () => {
    const { onNewList, user } = setup({ lists: [] })
    expect(screen.getByText(/need a list/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New list' }))
    expect(onNewList).toHaveBeenCalled()
  })

  it('shows a loading state rather than an empty one while lists are unknown', () => {
    setup({ lists: [], loading: true })
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByText(/need a list/i)).not.toBeInTheDocument()
  })
})

describe('picking lists', () => {
  it('offers every list with its size', () => {
    setup()
    expect(listRow('Food')).toHaveTextContent('12 words')
    expect(listRow('Market')).toHaveTextContent('9 words')
  })

  it('starts with everything selectable', () => {
    setup()
    for (const name of ['Food', 'Market', 'Paris']) expect(listRow(name)).toBeEnabled()
  })

  it('fixes the language pair on the first pick, and says why the others are out', async () => {
    const { user } = setup()
    await user.click(listRow('Food'))
    expect(listRow('Paris')).toBeDisabled()
    expect(listRow('Paris')).toHaveTextContent(/one language pair/i)
    expect(listRow('Market')).toBeEnabled()
  })

  it('releases the pair when the selection empties again (008 FR-4)', async () => {
    const { user } = setup()
    await user.click(listRow('Food'))
    await user.click(listRow('Food'))
    expect(listRow('Paris')).toBeEnabled()
  })

  it('marks what is selected', async () => {
    const { user } = setup()
    await user.click(listRow('Food'))
    expect(listRow('Food')).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('the live pool count (008 FR-6)', () => {
  it('asks for a list before it can say anything', () => {
    setup()
    expect(screen.getByRole('status')).toHaveTextContent(/pick at least one list/i)
  })

  it('counts one list', async () => {
    const { user } = setup()
    await user.click(listRow('Food'))
    expect(screen.getByRole('status')).toHaveTextContent('12')
  })

  it('recounts as lists are added and removed', async () => {
    const { user } = setup()
    await user.click(listRow('Food'))
    await user.click(listRow('Market'))
    expect(screen.getByRole('status')).toHaveTextContent('21')
    await user.click(listRow('Market'))
    expect(screen.getByRole('status')).toHaveTextContent('12')
  })

  it('says which way round the game runs', async () => {
    const { user } = setup()
    await user.click(listRow('Food'))
    expect(screen.getByRole('status')).toHaveTextContent(/hear Dutch/i)
    expect(screen.getByRole('status')).toHaveTextContent(/pick the English/i)
  })

  it('counts only what is still missed under “Words I got wrong”', async () => {
    const records: MissSource[] = [
      {
        listId: 'l1',
        finishedAt: NOW - 1000,
        wrongPairs: food.pairs.slice(0, 5),
        rightPairs: food.pairs.slice(5),
      },
    ]
    const { user } = setup({}, records)
    await user.click(listRow('Food'))
    await user.click(screen.getByRole('button', { name: 'Words I got wrong' }))
    expect(screen.getByRole('status')).toHaveTextContent('5')
  })

  it('explains an empty mistake pool instead of showing a bare zero (008 FR-10)', async () => {
    const { user } = setup()
    await user.click(listRow('Food'))
    await user.click(screen.getByRole('button', { name: 'Words I got wrong' }))
    expect(screen.getByRole('status')).toHaveTextContent(/not got any of these wrong/i)
    expect(start()).toBeDisabled()
  })
})

describe('too few words to play', () => {
  it('refuses to start and says what would fix it', async () => {
    const tiny = makeList('l9', 'Tiny', MIN_POOL - 1)
    const { user } = setup({ lists: [tiny] })
    await user.click(listRow('Tiny'))
    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`at least ${MIN_POOL}`))
    expect(start()).toBeDisabled()
  })

  it('hides the length picker until there is something to pick from', () => {
    setup()
    expect(screen.queryByRole('button', { name: '10' })).not.toBeInTheDocument()
  })
})

describe('choosing a length (008 FR-8)', () => {
  it('offers only the chips the pool can fill', async () => {
    const { user } = setup()
    await user.click(listRow('Food')) // 12 words
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '15' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '20' })).not.toBeInTheDocument()
  })

  it('offers more chips as the pool grows', async () => {
    const { user } = setup()
    await user.click(listRow('Food'))
    await user.click(listRow('Market')) // 21 words
    expect(screen.getByRole('button', { name: '20' })).toBeInTheDocument()
  })

  it('offers an “All N” chip when no fixed chip fits, so there is always a tap target', async () => {
    const small = makeList('l9', 'Small', 7)
    const { user } = setup({ lists: [small] })
    await user.click(listRow('Small'))
    expect(screen.getByRole('button', { name: 'All 7' })).toBeInTheDocument()
  })

  it('takes a typed number', async () => {
    const { user, onStart } = setup()
    await user.click(listRow('Food'))
    const box = screen.getByRole('spinbutton')
    await user.clear(box)
    await user.type(box, '4')
    await user.click(start())
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ count: 4 }))
  })

  it('clamps a typed number above the pool', async () => {
    const { user, onStart } = setup()
    await user.click(listRow('Food')) // 12
    const box = screen.getByRole('spinbutton')
    await user.clear(box)
    await user.type(box, '99')
    await user.click(start())
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ count: 12 }))
  })

  it('states the ceiling when a pool is bigger than a game may be', async () => {
    const huge = makeList('l9', 'Huge', MAX_GAME_WORDS + 20)
    const { user } = setup({ lists: [huge] })
    await user.click(listRow('Huge'))
    expect(screen.getByText(new RegExp(`tops out at ${MAX_GAME_WORDS}`))).toBeInTheDocument()
  })
})

describe('starting', () => {
  it('emits exactly the settings chosen', async () => {
    const { user, onStart } = setup()
    await user.click(listRow('Food'))
    await user.click(listRow('Market'))
    await user.click(screen.getByRole('button', { name: '20' }))
    await user.click(start())
    expect(onStart).toHaveBeenCalledWith({
      spec: { listIds: ['l1', 'l2'], source: 'all' },
      count: 20,
      col1Lang: 'en',
      col2Lang: 'nl',
    })
  })

  it('emits settings a game can actually be built from', async () => {
    const { user, onStart, lists } = setup()
    await user.click(listRow('Food'))
    await user.click(start())
    const settings = onStart.mock.calls[0]![0]
    const pool = buildWordPool(lists, settings.spec, { records: [], now: NOW })
    expect(pool.length).toBeGreaterThanOrEqual(settings.count)
  })

  it('cannot start with nothing selected', () => {
    setup()
    expect(start()).toBeDisabled()
  })

  it('goes back', async () => {
    const { user, onBack } = setup()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('pre-filling from a previous game (008 FR-27)', () => {
  it('restores the lists, the source and the length', () => {
    setup({
      initial: {
        spec: { listIds: ['l1', 'l2'], source: 'all' },
        count: 20,
        col1Lang: 'en',
        col2Lang: 'nl',
      },
    })
    expect(listRow('Food')).toHaveAttribute('aria-pressed', 'true')
    expect(listRow('Market')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '20' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('is still editable — it is a starting point, not a lock', async () => {
    const { user, onStart } = setup({
      initial: {
        spec: { listIds: ['l1'], source: 'all' },
        count: 10,
        col1Lang: 'en',
        col2Lang: 'nl',
      },
    })
    await user.click(listRow('Market'))
    await user.click(start())
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { listIds: ['l1', 'l2'], source: 'all' } }),
    )
  })
})
