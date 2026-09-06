import { describe, expect, it } from 'vitest'
import { buildGameRecord, gameMissSources } from './gameRecord'
import { advance, answer, createGame, currentQuestion, timeOut } from './game'
import { QUESTION_MS, type Game, type GameRecord, type GameSettings } from './types'
import { collectMissed } from '../state/missedWords'
import { seededRng } from '../state/session'
import type { PooledWord } from '../state/wordPool'
import type { WordList } from '../state/types'

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0)

const w = (id: string, col1: string, col2: string, listId: string, listName: string): PooledWord =>
  ({ id, col1, col2, listId, listName })

/** Nine words spread across three lists. */
const POOL: PooledWord[] = [
  w('w0', 'bread', 'brood', 'l1', 'Food'),
  w('w1', 'cheese', 'kaas', 'l1', 'Food'),
  w('w2', 'apple', 'appel', 'l1', 'Food'),
  w('w3', 'money', 'geld', 'l2', 'Market'),
  w('w4', 'stall', 'kraam', 'l2', 'Market'),
  w('w5', 'price', 'prijs', 'l2', 'Market'),
  w('w6', 'train', 'trein', 'l3', 'Travel'),
  w('w7', 'ticket', 'kaartje', 'l3', 'Travel'),
  w('w8', 'station', 'station', 'l3', 'Travel'),
]

const settings: GameSettings = {
  spec: { listIds: ['l1', 'l2', 'l3'], source: 'all' },
  count: 9,
  col1Lang: 'en',
  col2Lang: 'nl',
}

/** Play a whole game, answering `rightIds` correctly and everything else wrong. */
function play(rightIds: Set<string>, count = 9): Game {
  let g = createGame({ ...settings, count }, POOL, seededRng(5))
  while (currentQuestion(g)) {
    const q = currentQuestion(g)!
    g = rightIds.has(q.word.id)
      ? answer(g, q.word.id, QUESTION_MS - 2000)
      : answer(g, q.options.find((o) => o.id !== q.word.id)!.id, QUESTION_MS - 2000)
    g = advance(g)
  }
  return g
}

const food: WordList = {
  id: 'l1',
  name: 'Food',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [
    { id: 'p1', col1: 'bread', col2: 'brood' },
    { id: 'p2', col1: 'cheese', col2: 'kaas' },
    { id: 'p3', col1: 'apple', col2: 'appel' },
  ],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

describe('buildGameRecord', () => {
  it('is null when nothing was answered — an empty log entry is noise', () => {
    const untouched = createGame(settings, POOL, seededRng(1))
    expect(buildGameRecord(untouched, { partial: true, now: NOW })).toBeNull()
  })

  it('records the score', () => {
    const record = buildGameRecord(play(new Set(['w0', 'w1'])), { partial: false, now: NOW })
    expect(record).toMatchObject({ correct: 2, asked: 9, points: 16, available: 90 })
  })

  it('takes finishedAt from the injected clock', () => {
    expect(buildGameRecord(play(new Set()), { partial: false, now: NOW })?.finishedAt).toBe(NOW)
  })

  it('mints an id when not given one', () => {
    expect(buildGameRecord(play(new Set()), { partial: false, now: NOW })?.id).toBeTruthy()
  })

  it('names every contributing list, so history reads after a delete', () => {
    // Order is first-ASKED, not spec order — the questions are shuffled — so compare
    // as sets. What matters is that each contributing list is named exactly once.
    const record = buildGameRecord(play(new Set()), { partial: false, now: NOW })
    expect([...record!.listIds].sort()).toEqual(['l1', 'l2', 'l3'])
    expect([...record!.listNames].sort()).toEqual(['Food', 'Market', 'Travel'])
  })

  it('names each list once, however many of its words were asked', () => {
    const record = buildGameRecord(play(new Set()), { partial: false, now: NOW })
    expect(new Set(record!.listIds).size).toBe(record!.listIds.length)
  })

  it('names only the lists actually asked about, not the whole spec', () => {
    // A 2-question game off a 3-list pool may never touch the third list.
    const record = buildGameRecord(play(new Set(), 2), { partial: true, now: NOW })
    expect(record!.listIds.length).toBeLessThanOrEqual(2)
  })

  it('carries the source through', () => {
    const record = buildGameRecord(play(new Set()), { partial: false, now: NOW })
    expect(record?.source).toBe('all')
  })

  it('flags a quit game as partial', () => {
    expect(buildGameRecord(play(new Set(), 3), { partial: true, now: NOW })?.partial).toBe(true)
  })

  it('keeps one result per answered word, with its origin list intact (008 R4)', () => {
    const record = buildGameRecord(play(new Set(['w0'])), { partial: false, now: NOW })
    expect(record?.results).toHaveLength(9)
    expect(record?.results?.find((r) => r.word.id === 'w0')).toMatchObject({ correct: true })
  })

  it('records a timeout as an answered word that was got wrong', () => {
    let g = createGame({ ...settings, count: 1 }, POOL, seededRng(5))
    g = advance(timeOut(g))
    const record = buildGameRecord(g, { partial: false, now: NOW })
    expect(record).toMatchObject({ correct: 0, asked: 1 })
    expect(record?.results?.[0]?.correct).toBe(false)
  })
})

describe('gameMissSources — one source per contributing list (008 FR-29)', () => {
  it('splits a game across the lists it drew from', () => {
    const record = buildGameRecord(play(new Set(['w0'])), { partial: false, now: NOW })!
    expect(gameMissSources(record).map((s) => s.listId).sort()).toEqual(['l1', 'l2', 'l3'])
  })

  it('files each word against the list it actually came from', () => {
    const record = buildGameRecord(play(new Set(['w0', 'w3'])), { partial: false, now: NOW })!
    const food = gameMissSources(record).find((s) => s.listId === 'l1')!
    expect(food.rightPairs?.map((p) => p.col1)).toEqual(['bread'])
    expect(food.wrongPairs.map((p) => p.col1).sort()).toEqual(['apple', 'cheese'])
  })

  it('always defines rightPairs, so a game never sets 006’s `degraded` flag', () => {
    // `degraded` means "recorded before right answers were saved". No game ever was, and
    // showing that warning on a screen where it is false is worse than showing nothing.
    const record = buildGameRecord(play(new Set()), { partial: false, now: NOW })!
    for (const source of gameMissSources(record)) {
      expect(source.rightPairs).toBeDefined()
    }
  })

  it('shares the game’s finishedAt, so ordering against drills is coherent', () => {
    const record = buildGameRecord(play(new Set()), { partial: false, now: NOW })!
    expect(gameMissSources(record).every((s) => s.finishedAt === NOW)).toBe(true)
  })

  it('is empty for a record whose detail was shed under storage pressure', () => {
    const shed = { id: 'g1', finishedAt: NOW, listIds: ['l1'], listNames: ['Food'],
      source: 'all', correct: 0, asked: 3, points: 0, available: 30, partial: false } as GameRecord
    expect(gameMissSources(shed)).toEqual([])
  })
})

describe('a game feeds the drill’s missed pool, end to end (008 D-3, D-10)', () => {
  it('puts the words it missed into collectMissed', () => {
    const record = buildGameRecord(play(new Set(['w0'])), { partial: false, now: NOW })!
    const set = collectMissed(gameMissSources(record), {
      listId: 'l1',
      window: 'all',
      now: NOW,
      list: food,
    })
    expect(set.words.map((w) => w.pair.col1).sort()).toEqual(['apple', 'cheese'])
  })

  it('lets a later correct answer clear a word again (008 D-10)', () => {
    const missedIt = buildGameRecord(play(new Set()), { partial: false, now: NOW - 1000 })!
    const gotIt = buildGameRecord(play(new Set(['w1'])), { partial: false, now: NOW })!
    const set = collectMissed(
      [...gameMissSources(missedIt), ...gameMissSources(gotIt)],
      { listId: 'l1', window: 'all', now: NOW, list: food },
    )
    expect(set.words.map((w) => w.pair.col1)).not.toContain('cheese')
  })

  it('reports no degradation, unlike pre-006 drill history', () => {
    const record = buildGameRecord(play(new Set()), { partial: false, now: NOW })!
    const set = collectMissed(gameMissSources(record), {
      listId: 'l1', window: 'all', now: NOW, list: food,
    })
    expect(set.degraded).toBe(false)
  })
})
