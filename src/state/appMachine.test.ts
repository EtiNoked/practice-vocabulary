import { createGame, currentQuestion } from '../game/game'
import type { GameSettings } from '../game/types'
import { seededRng } from './session'
import { runFromPool } from './drillRun'
import type { PooledWord } from './wordPool'
import { describe, expect, it } from 'vitest'
import type { WordList } from './types'
import { type AppAction, type AppState, initialState, reduce } from './appMachine'

const list: WordList = {
  id: 'a',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [
    { id: 'p1', col1: 'daughter', col2: 'dochter' },
    { id: 'p2', col1: 'son', col2: 'zoon' },
  ],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

// Note the explicit arrow: passing `reduce` directly to Array.prototype.reduce
// would hand the array index to reduce's third parameter (rng).
const at = (state: AppState, ...actions: Parameters<typeof reduce>[1][]): AppState =>
  actions.reduce((acc, action) => reduce(acc, action), state)

describe('initial state', () => {
  it('starts at home', () => {
    expect(initialState.screen).toBe('home')
  })
})

describe('reaching the editor', () => {
  it('new list opens an empty editor in create mode', () => {
    const s = reduce(initialState, { type: 'NEW_LIST' })
    expect(s.screen).toBe('editing')
    if (s.screen !== 'editing') throw new Error('unreachable')
    expect(s.mode).toBe('create')
    expect(s.rows).toHaveLength(1)
    expect(s.rows[0]).toEqual({ col1: '', col2: '' })
  })

  it('edit list opens a pre-filled editor in update mode', () => {
    const s = reduce(initialState, { type: 'EDIT_LIST', list })
    expect(s.screen).toBe('editing')
    if (s.screen !== 'editing') throw new Error('unreachable')
    expect(s.mode).toBe('update')
    expect(s.listId).toBe('a')
    expect(s.rows).toHaveLength(2)
  })

  it('cancelling the editor returns to my lists, where it was opened from (012 D-8)', () => {
    const s = at(initialState, { type: 'NEW_LIST' }, { type: 'CANCEL_EDIT' })
    expect(s.screen).toBe('lists')
  })
})

describe('reaching practice', () => {
  it('confirming the editor moves to ready', () => {
    const s = at(initialState, { type: 'NEW_LIST' }, { type: 'CONFIRM_LIST', list })
    expect(s.screen).toBe('ready')
  })

  it('practising a saved list skips the editor', () => {
    const s = reduce(initialState, { type: 'PRACTISE_LIST', list })
    expect(s.screen).toBe('ready')
  })

  it('start begins a session over every pair', () => {
    const s = at(initialState, { type: 'PRACTISE_LIST', list }, { type: 'START' })
    expect(s.screen).toBe('practising')
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.order).toHaveLength(2)
    expect(s.session.revealed).toBe(false)
  })
})

describe('the practice loop', () => {
  const practising = at(initialState, { type: 'PRACTISE_LIST', list }, { type: 'START' })

  it('reveal exposes the answer', () => {
    const s = reduce(practising, { type: 'REVEAL' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.revealed).toBe(true)
  })

  it('marking every card ends the session at results', () => {
    const s = at(
      practising,
      { type: 'REVEAL' },
      { type: 'MARK', result: 'right' },
      { type: 'REVEAL' },
      { type: 'MARK', result: 'wrong' },
    )
    expect(s.screen).toBe('results')
  })

  it('quitting early goes to results with a partial score', () => {
    const s = at(practising, { type: 'REVEAL' }, { type: 'MARK', result: 'right' }, { type: 'QUIT' })
    expect(s.screen).toBe('results')
    if (s.screen !== 'results') throw new Error('unreachable')
    expect(s.session.index).toBe(1)
  })
})

describe('restarting from results', () => {
  const finished = at(
    initialState,
    { type: 'PRACTISE_LIST', list },
    { type: 'START' },
    { type: 'REVEAL' },
    { type: 'MARK', result: 'wrong' },
    { type: 'REVEAL' },
    { type: 'MARK', result: 'right' },
  )

  it('shuffle and restart begins a fresh full session', () => {
    const s = reduce(finished, { type: 'RESTART_SHUFFLED' })
    expect(s.screen).toBe('practising')
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.order).toHaveLength(2)
    expect(s.session.marks).toEqual({})
  })

  it('practise-wrong-only keeps just the missed pairs', () => {
    const s = reduce(finished, { type: 'RESTART_WRONG_ONLY' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.order).toHaveLength(1)
  })

  it('done returns home', () => {
    expect(reduce(finished, { type: 'GO_HOME' }).screen).toBe('home')
  })
})

describe('starting in a mode', () => {
  const ready = reduce(initialState, { type: 'PRACTISE_LIST', list })

  it('defaults to test mode, so 001 behaviour is what an unqualified START means', () => {
    const s = reduce(ready, { type: 'START' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.mode).toBe('test')
  })

  it('starts a test drill', () => {
    const s = reduce(ready, { type: 'START', mode: 'test' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.mode).toBe('test')
  })

  it('starts a practice drill in list order', () => {
    const s = reduce(ready, { type: 'START', mode: 'practice' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.mode).toBe('practice')
    expect(s.session.order).toEqual(['p1', 'p2'])
  })
})

describe('the practice-mode loop', () => {
  const studying = at(
    initialState,
    { type: 'PRACTISE_LIST', list },
    { type: 'START', mode: 'practice' },
  )

  it('NEXT advances a card', () => {
    const s = reduce(studying, { type: 'NEXT' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.index).toBe(1)
  })

  // The same boundary MARK already handles via isFinished.
  it('NEXT past the last card lands on results', () => {
    const s = at(studying, { type: 'NEXT' }, { type: 'NEXT' })
    expect(s.screen).toBe('results')
  })

  it('PREV goes back a card', () => {
    const s = at(studying, { type: 'NEXT' }, { type: 'PREV' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.index).toBe(0)
  })

  it('PREV never produces a negative index', () => {
    const s = at(studying, { type: 'PREV' }, { type: 'PREV' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.index).toBe(0)
  })

  // FR-13: no marking in practice, so nothing can accumulate a score.
  it('records no marks however far it is navigated', () => {
    const s = at(studying, { type: 'NEXT' }, { type: 'PREV' }, { type: 'NEXT' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.marks).toEqual({})
  })

  // 009. The answer cover, which is a property of the run rather than the card.
  it('TOGGLE_ANSWER uncovers the answer', () => {
    const s = reduce(studying, { type: 'TOGGLE_ANSWER' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.answersOpen).toBe(true)
  })

  it('TOGGLE_ANSWER twice covers it again', () => {
    const s = at(studying, { type: 'TOGGLE_ANSWER' }, { type: 'TOGGLE_ANSWER' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.answersOpen).toBe(false)
  })

  // FR-4: the decision outlives the card it was made on, in both directions.
  it('carries the uncovered answer across NEXT and back across PREV', () => {
    const s = at(studying, { type: 'TOGGLE_ANSWER' }, { type: 'NEXT' }, { type: 'PREV' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.answersOpen).toBe(true)
  })

  it('changes nothing else about the card', () => {
    const s = reduce(studying, { type: 'TOGGLE_ANSWER' })
    if (s.screen !== 'practising' || studying.screen !== 'practising') {
      throw new Error('unreachable')
    }
    expect(s.session.index).toBe(studying.session.index)
    expect(s.session.order).toEqual(studying.session.order)
    expect(s.session.marks).toEqual({})
  })
})

describe('actions guarded by mode', () => {
  const studying = at(
    initialState,
    { type: 'PRACTISE_LIST', list },
    { type: 'START', mode: 'practice' },
  )
  const testing = at(initialState, { type: 'PRACTISE_LIST', list }, { type: 'START', mode: 'test' })

  /*
   * Unchanged BY REFERENCE, matching the machine's existing contract for an
   * action that does not apply — not a throw, and not a cloned object.
   */
  it('REVEAL is a no-op in practice mode', () => {
    expect(reduce(studying, { type: 'REVEAL' })).toBe(studying)
  })

  it('MARK is a no-op in practice mode', () => {
    expect(reduce(studying, { type: 'MARK', result: 'right' })).toBe(studying)
  })

  /*
   * The mirror image of REVEAL above, and the pair is the point: each mode owns
   * exactly one way to show the answer, and neither reaches into the other.
   */
  it('TOGGLE_ANSWER is a no-op in test mode', () => {
    expect(reduce(testing, { type: 'TOGGLE_ANSWER' })).toBe(testing)
  })

  it('NEXT is a no-op in test mode', () => {
    expect(reduce(testing, { type: 'NEXT' })).toBe(testing)
  })

  it('PREV is a no-op in test mode', () => {
    expect(reduce(testing, { type: 'PREV' })).toBe(testing)
  })

  it('QUIT still works in practice mode', () => {
    expect(reduce(studying, { type: 'QUIT' }).screen).toBe('results')
  })
})

describe('SWITCH_MODE', () => {
  const finishedTest = at(
    initialState,
    { type: 'PRACTISE_LIST', list },
    { type: 'START', mode: 'test' },
    { type: 'REVEAL' },
    { type: 'MARK', result: 'wrong' },
    { type: 'REVEAL' },
    { type: 'MARK', result: 'right' },
  )

  it('flips a finished test into a practice run', () => {
    const s = reduce(finishedTest, { type: 'SWITCH_MODE' })
    expect(s.screen).toBe('practising')
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.mode).toBe('practice')
    expect(s.session.marks).toEqual({})
    expect(s.session.index).toBe(0)
  })

  // 009 FR-5, via E-9: the switch builds a fresh session, so the cover comes
  // back up for free — as long as createSession stays the only initialiser.
  it('starts the new practice run with the answer covered', () => {
    const s = reduce(finishedTest, { type: 'SWITCH_MODE' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.answersOpen).toBe(false)
  })

  it('flips a finished practice run into a test', () => {
    const finishedPractice = at(
      initialState,
      { type: 'PRACTISE_LIST', list },
      { type: 'START', mode: 'practice' },
      { type: 'QUIT' },
    )
    const s = reduce(finishedPractice, { type: 'SWITCH_MODE' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.mode).toBe('test')
  })

  /**
   * Built from the LIST's pairs, not the finished session's. After a wrong-only
   * re-run the session holds only the missed pairs, and switching mode there
   * must not quietly drop everything the user got right.
   */
  it('covers the whole list even after a wrong-only re-run', () => {
    const s = at(finishedTest, { type: 'RESTART_WRONG_ONLY' }, { type: 'QUIT' }, {
      type: 'SWITCH_MODE',
    })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.order).toHaveLength(2)
  })

  it('is ignored anywhere but results', () => {
    expect(reduce(initialState, { type: 'SWITCH_MODE' })).toBe(initialState)
  })
})

describe('illegal transitions', () => {
  // The reducer must ignore actions that do not belong to the current screen
  // rather than producing a nonsensical state.
  it('ignores REVEAL when not practising', () => {
    expect(reduce(initialState, { type: 'REVEAL' })).toBe(initialState)
  })

  it('ignores MARK when not practising', () => {
    expect(reduce(initialState, { type: 'MARK', result: 'right' })).toBe(initialState)
  })

  it('ignores TOGGLE_ANSWER when not practising', () => {
    expect(reduce(initialState, { type: 'TOGGLE_ANSWER' })).toBe(initialState)
  })

  it('ignores START when not ready', () => {
    expect(reduce(initialState, { type: 'START' })).toBe(initialState)
  })

  it('ignores CONFIRM_LIST when not editing', () => {
    expect(reduce(initialState, { type: 'CONFIRM_LIST', list })).toBe(initialState)
  })

  it('ignores NEXT when not practising', () => {
    expect(reduce(initialState, { type: 'NEXT' })).toBe(initialState)
  })

  it('ignores PREV when not practising', () => {
    expect(reduce(initialState, { type: 'PREV' })).toBe(initialState)
  })
})

describe('reaching the review screens', () => {
  it('opens review from anywhere', () => {
    for (const start of [
      initialState,
      reduce(initialState, { type: 'PRACTISE_LIST', list }),
      at(initialState, { type: 'PRACTISE_LIST', list }, { type: 'START' }),
    ]) {
      expect(reduce(start, { type: 'OPEN_REVIEW' }).screen).toBe('review')
    }
  })

  it('opens one drill by its record id, not by copying the record', () => {
    // Holding the id keeps the state serialisable and means a re-emitted
    // subscription always wins over what the screen was opened with.
    const s = reduce(initialState, { type: 'OPEN_REVIEW_DETAIL', recordId: 'r1' })
    expect(s).toEqual({ screen: 'reviewDetail', recordId: 'r1' })
  })

  it('goes home from either review screen', () => {
    expect(reduce({ screen: 'review' }, { type: 'GO_HOME' }).screen).toBe('home')
    expect(
      reduce({ screen: 'reviewDetail', recordId: 'r1' }, { type: 'GO_HOME' }).screen,
    ).toBe('home')
  })

  it('leaves a running drill for review — the confirm belongs to the menu, not here', () => {
    // A pure reducer must not open a dialog, so this transition is legal and the
    // warning lives in NavMenu, exactly as the mid-drill sign-out warning lives
    // in AccountMenu.
    const drilling = at(initialState, { type: 'PRACTISE_LIST', list }, { type: 'START' })
    expect(reduce(drilling, { type: 'OPEN_REVIEW' }).screen).toBe('review')
  })
})

describe('practising the words you missed', () => {
  const missedPairs = [{ id: 'missed-0', col1: 'son', col2: 'zoon' }]
  const source = { kind: 'window', window: 'week' } as const

  it('lands on ready carrying the subset, beside the real list', () => {
    const s = reduce(initialState, { type: 'PRACTISE_MISSED', list, pairs: missedPairs, source })
    expect(s.screen).toBe('ready')
    if (s.screen !== 'ready') throw new Error('unreachable')
    // The list is the REAL one — the subset never masquerades as it, or Save
    // would overwrite two words with one.
    expect(s.list).toBe(list)
    expect(s.missed?.pairs).toEqual(missedPairs)
    expect(s.missed?.source).toEqual(source)
  })

  it('starts the drill from the subset', () => {
    const s = at(
      initialState,
      { type: 'PRACTISE_MISSED', list, pairs: missedPairs, source },
      { type: 'START' },
    )
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.pairs).toHaveLength(1)
    expect(s.session.pairs[0]?.col2).toBe('zoon')
    // Still attributed to the real list, so the record files correctly and the
    // next missed set can read this drill back.
    expect(s.session.listId).toBe(list.id)
  })

  it('starts the whole list when no subset is selected', () => {
    const s = at(initialState, { type: 'PRACTISE_LIST', list }, { type: 'START' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.pairs).toHaveLength(2)
  })

  it('honours the drill mode for a missed subset too', () => {
    const s = at(
      initialState,
      { type: 'PRACTISE_MISSED', list, pairs: missedPairs, source },
      { type: 'START', mode: 'practice' },
    )
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.mode).toBe('practice')
  })

  it('drops back to the full list on PRACTISE_FULL', () => {
    const s = at(
      initialState,
      { type: 'PRACTISE_MISSED', list, pairs: missedPairs, source },
      { type: 'PRACTISE_FULL' },
    )
    if (s.screen !== 'ready') throw new Error('unreachable')
    expect(s.missed).toBeUndefined()
    expect(s.list).toBe(list)
  })

  it('ignores PRACTISE_FULL anywhere but ready, by reference', () => {
    const home: AppState = { screen: 'home' }
    expect(reduce(home, { type: 'PRACTISE_FULL' })).toBe(home)
  })

  it('clears a stale subset when the same list is picked again from home', () => {
    // Arriving from Home always means the whole list.
    const s = at(
      initialState,
      { type: 'PRACTISE_MISSED', list, pairs: missedPairs, source },
      { type: 'PRACTISE_LIST', list },
    )
    if (s.screen !== 'ready') throw new Error('unreachable')
    expect(s.missed).toBeUndefined()
  })
})

describe('the game screens (008)', () => {
  const pool = [
    'bread/brood',
    'cheese/kaas',
    'apple/appel',
    'money/geld',
    'water/water',
    'milk/melk',
    'sugar/suiker',
  ].map((s, i) => ({
    id: `w${i}`,
    col1: s.split('/')[0]!,
    col2: s.split('/')[1]!,
    listId: 'l1',
    listName: 'Food',
  }))

  const settings: GameSettings = {
    spec: { listIds: ['l1'], source: 'all' },
    count: 3,
    col1Lang: 'en',
    col2Lang: 'nl',
  }

  const freshGame = (seed = 1) => createGame(settings, pool, seededRng(seed))
  const playing = (seed = 1): AppState => ({ screen: 'playing', game: freshGame(seed) })

  /** Answer the question on screen correctly. */
  const answerRight = (state: AppState) => {
    if (state.screen !== 'playing') throw new Error('not playing')
    return reduce(state, {
      type: 'ANSWER',
      choiceId: currentQuestion(state.game)!.word.id,
      remainingMs: 7000,
    })
  }

  describe('getting in and out', () => {
    it('opens setup from home', () => {
      expect(reduce({ screen: 'home' }, { type: 'OPEN_GAME' })).toEqual({ screen: 'gameSetup' })
    })

    it('opens setup from anywhere, the drill included — NavMenu owns the confirm', () => {
      const mid = reduce({ screen: 'ready', list }, { type: 'START' })
      expect(reduce(mid, { type: 'OPEN_GAME' }).screen).toBe('gameSetup')
    })

    it('starts a game from setup', () => {
      const game = freshGame()
      expect(reduce({ screen: 'gameSetup' }, { type: 'START_GAME', game })).toEqual({
        screen: 'playing',
        game,
      })
    })

    it('goes home from any game screen', () => {
      expect(reduce(playing(), { type: 'GO_HOME' })).toEqual({ screen: 'home' })
    })
  })

  describe('answering', () => {
    it('records an answer without advancing — the screen owns the verdict pause', () => {
      const next = answerRight(playing())
      expect(next.screen === 'playing' && next.game.index).toBe(0)
      expect(next.screen === 'playing' && next.game.answers).toHaveLength(1)
    })

    it('banks the clock as points', () => {
      const next = answerRight(playing())
      expect(next.screen === 'playing' && next.game.answers[0]?.points).toBe(7)
    })

    it('records a timeout', () => {
      const next = reduce(playing(), { type: 'TIME_OUT' })
      expect(next.screen === 'playing' && next.game.verdict?.kind).toBe('timeout')
    })

    it('advances to the next question and clears the verdict', () => {
      const next = reduce(answerRight(playing()), { type: 'ADVANCE' })
      expect(next.screen === 'playing' && next.game.index).toBe(1)
      expect(next.screen === 'playing' && next.game.verdict).toBeNull()
    })

    it('lands on results after the last question', () => {
      let state = playing()
      for (let i = 0; i < 3; i++) state = reduce(answerRight(state), { type: 'ADVANCE' })
      expect(state.screen).toBe('gameResults')
    })
  })

  describe('quitting', () => {
    it('routes to results holding what was answered so far', () => {
      const partial = reduce(answerRight(playing()), { type: 'ADVANCE' })
      const quit = reduce(partial, { type: 'QUIT_GAME' })
      expect(quit.screen).toBe('gameResults')
      expect(quit.screen === 'gameResults' && quit.game.answers).toHaveLength(1)
    })
  })

  describe('playing again', () => {
    it('re-draws from the same pool under the same settings', () => {
      let state = playing()
      for (let i = 0; i < 3; i++) state = reduce(answerRight(state), { type: 'ADVANCE' })
      const again = reduce(state, { type: 'REPLAY_GAME' }, seededRng(99))
      expect(again.screen).toBe('playing')
      expect(again.screen === 'playing' && again.game.settings).toEqual(settings)
      expect(again.screen === 'playing' && again.game.pool).toEqual(pool)
      expect(again.screen === 'playing' && again.game.answers).toEqual([])
    })

    it('draws a different round under a different rng', () => {
      const done: AppState = { screen: 'gameResults', game: freshGame(1) }
      const a = reduce(done, { type: 'REPLAY_GAME' }, seededRng(3))
      const b = reduce(done, { type: 'REPLAY_GAME' }, seededRng(400))
      const ids = (s: AppState) =>
        s.screen === 'playing' ? s.game.questions.map((q) => q.word.id) : []
      expect(ids(a)).not.toEqual(ids(b))
    })

    it('returns to setup with the previous settings pre-filled (008 FR-27)', () => {
      const done: AppState = { screen: 'gameResults', game: freshGame() }
      expect(reduce(done, { type: 'NEW_GAME' })).toEqual({ screen: 'gameSetup', initial: settings })
    })
  })

  describe('illegal transitions are no-ops BY REFERENCE, as everywhere else here', () => {
    const cases: Array<[string, AppState, AppAction]> = [
      ['START_GAME off setup', { screen: 'home' }, { type: 'START_GAME', game: freshGame() }],
      ['ANSWER off playing', { screen: 'home' }, { type: 'ANSWER', choiceId: 'w0', remainingMs: 1 }],
      ['TIME_OUT off playing', { screen: 'home' }, { type: 'TIME_OUT' }],
      ['ADVANCE off playing', { screen: 'home' }, { type: 'ADVANCE' }],
      ['QUIT_GAME off playing', { screen: 'home' }, { type: 'QUIT_GAME' }],
      ['REPLAY_GAME off results', { screen: 'home' }, { type: 'REPLAY_GAME' }],
      ['NEW_GAME off results', { screen: 'home' }, { type: 'NEW_GAME' }],
      ['ANSWER on the results screen', { screen: 'gameResults', game: freshGame() },
        { type: 'ANSWER', choiceId: 'w0', remainingMs: 1 }],
    ]

    for (const [name, state, action] of cases) {
      it(`ignores ${name}`, () => {
        expect(reduce(state, action)).toBe(state)
      })
    }

    it('leaves the drill’s own actions alone on a game screen', () => {
      const state = playing()
      expect(reduce(state, { type: 'MARK', result: 'right' })).toBe(state)
      expect(reduce(state, { type: 'REVEAL' })).toBe(state)
      expect(reduce(state, { type: 'TOGGLE_ANSWER' })).toBe(state)
    })
  })
})

describe('a drill carries a run, not a list (011 D-7, D-9)', () => {
  it('starts the whole list as a run over its own words', () => {
    const s = at(initialState, { type: 'PRACTISE_LIST', list }, { type: 'START' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.run.subject.name).toBe('Lesson 3')
    expect(s.run.subject.col2Lang).toBe('nl')
    expect(s.run.words.map((w) => w.id)).toEqual(['p1', 'p2'])
    expect(s.run.words.every((w) => w.listId === 'a')).toBe(true)
    // A list drill has no plan and nothing else to draw — same as before 011.
    expect(s.run.plan).toBeUndefined()
  })

  it('starts a missed subset as a run over just those words', () => {
    const s = at(
      initialState,
      { type: 'PRACTISE_MISSED', list, pairs: [{ id: 'missed-0', col1: 'son', col2: 'zoon' }], source: { kind: 'window', window: 'week' } },
      { type: 'START' },
    )
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.run.words.map((w) => w.col2)).toEqual(['zoon'])
    expect(s.run.words[0]?.listId).toBe('a')
  })

  it('carries the run through to results, and back into every re-run', () => {
    const started = at(initialState, { type: 'PRACTISE_LIST', list }, { type: 'START' })
    const done = at(started, { type: 'MARK', result: 'wrong' }, { type: 'MARK', result: 'right' })
    if (done.screen !== 'results') throw new Error('unreachable')
    if (started.screen !== 'practising') throw new Error('unreachable')
    expect(done.run).toBe(started.run)

    const again = reduce(done, { type: 'RESTART_SHUFFLED' })
    if (again.screen !== 'practising') throw new Error('unreachable')
    expect(again.run).toBe(done.run)
  })

  it('SWITCH_MODE still covers the whole run after a wrong-only re-run', () => {
    const done = at(
      initialState,
      { type: 'PRACTISE_LIST', list },
      { type: 'START' },
      { type: 'MARK', result: 'wrong' },
      { type: 'MARK', result: 'right' },
      { type: 'RESTART_WRONG_ONLY' },
      { type: 'MARK', result: 'right' },
    )
    // The wrong-only re-run covered one word and finished.
    if (done.screen !== 'results') throw new Error('unreachable')
    const switched = reduce(done, { type: 'SWITCH_MODE' })
    if (switched.screen !== 'practising') throw new Error('unreachable')
    // BOTH words, not just the missed one — the bug this branch exists to prevent.
    expect(switched.session.pairs).toHaveLength(2)
    expect(switched.session.mode).toBe('practice')
  })
})

describe('building a test (011)', () => {
  const pool: PooledWord[] = Array.from({ length: 30 }, (_, i) => ({
    id: `w${i}`,
    col1: `en${i}`,
    col2: `nl${i}`,
    listId: i % 2 === 0 ? 'A' : 'B',
    listName: i % 2 === 0 ? 'Chapter 1' : 'Chapter 2',
  }))
  const testPlan = { spec: { listIds: ['A', 'B'], source: 'all' as const }, count: 10 }
  const subject = { name: '2 lists', col1Lang: 'en' as const, col2Lang: 'nl' as const }
  const poolRun = () => runFromPool(pool, testPlan, subject, seededRng(1))

  const savedTest = {
    id: 't1',
    name: 'Weak verbs',
    spec: { listIds: ['A'], source: 'missed' as const },
    count: 15,
    createdAt: 1,
    updatedAt: 2,
  }

  it('opens the builder from anywhere, like the game does', () => {
    for (const from of [initialState, { screen: 'review' } as AppState]) {
      expect(reduce(from, { type: 'OPEN_TEST_SETUP' }).screen).toBe('testSetup')
    }
  })

  it('opens the builder with nothing pre-filled', () => {
    const s = reduce(initialState, { type: 'OPEN_TEST_SETUP' })
    if (s.screen !== 'testSetup') throw new Error('unreachable')
    expect(s.initial).toBeUndefined()
  })

  it('opens the builder pre-filled when editing a saved test', () => {
    const s = reduce(initialState, { type: 'EDIT_TEST', test: savedTest })
    if (s.screen !== 'testSetup') throw new Error('unreachable')
    expect(s.initial).toBe(savedTest)
  })

  it('starts a run from the builder, in the mode asked for', () => {
    const run = poolRun()
    const s = at(initialState, { type: 'OPEN_TEST_SETUP' }, { type: 'START_RUN', run, mode: 'test' })
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.run).toBe(run)
    expect(s.session.mode).toBe('test')
    expect(s.session.pairs).toHaveLength(10)
  })

  it('starts a pool run in practice mode too (011 D-2)', () => {
    const s = at(
      initialState,
      { type: 'OPEN_TEST_SETUP' },
      { type: 'START_RUN', run: poolRun(), mode: 'practice' },
    )
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.mode).toBe('practice')
  })

  it('leaves the session with no single list when the run spans several', () => {
    const s = at(
      initialState,
      { type: 'OPEN_TEST_SETUP' },
      { type: 'START_RUN', run: poolRun(), mode: 'test' },
    )
    if (s.screen !== 'practising') throw new Error('unreachable')
    expect(s.session.listId).toBe('')
  })

  /*
   * THE regression this guard has already produced once.
   *
   * A saved test is run from the saved-tests list, and 012 moved that list off home onto
   * its own screen. Leaving the guard naming `home` would make the Run button a silent
   * no-op there — which is exactly what happened in 011 when the guard named only
   * `testSetup`, and it was caught end-to-end rather than here. This is the cheap catch.
   */
  it('starts a saved test straight from My tests, where the saved-tests list lives', () => {
    const s = reduce({ screen: 'tests' }, { type: 'START_RUN', run: poolRun(), mode: 'test' })
    expect(s.screen).toBe('practising')
  })

  it('no longer starts one from home, which holds no tests since 012', () => {
    const home: AppState = { screen: 'home' }
    expect(reduce(home, { type: 'START_RUN', run: poolRun(), mode: 'test' })).toBe(home)
  })

  it('refuses to start on top of a drill or a game already running, by reference', () => {
    const mid = at(initialState, { type: 'PRACTISE_LIST', list }, { type: 'START' })
    expect(reduce(mid, { type: 'START_RUN', run: poolRun(), mode: 'test' })).toBe(mid)
    const review: AppState = { screen: 'review' }
    expect(reduce(review, { type: 'START_RUN', run: poolRun(), mode: 'test' })).toBe(review)
  })
})

describe('a fresh draw (011 FR-26)', () => {
  const pool: PooledWord[] = Array.from({ length: 30 }, (_, i) => ({
    id: `w${i}`,
    col1: `en${i}`,
    col2: `nl${i}`,
    listId: 'A',
    listName: 'Chapter 1',
  }))
  const finished = (): AppState => {
    const run = runFromPool(
      pool,
      { spec: { listIds: ['A'], source: 'all' }, count: 5 },
      { name: 'Chapter 1', col1Lang: 'en', col2Lang: 'nl' },
      seededRng(1),
    )
    let s = at(initialState, { type: 'OPEN_TEST_SETUP' }, { type: 'START_RUN', run, mode: 'test' })
    for (let i = 0; i < 5; i++) s = reduce(s, { type: 'MARK', result: 'right' })
    return s
  }

  it('draws a different five from the same pool', () => {
    const done = finished()
    if (done.screen !== 'results') throw new Error('unreachable')
    const again = reduce(done, { type: 'RESTART_FRESH_DRAW' }, seededRng(99))
    if (again.screen !== 'practising') throw new Error('unreachable')
    expect(again.session.pairs).toHaveLength(5)
    expect(again.run.words.map((w) => w.id)).not.toEqual(done.run.words.map((w) => w.id))
    // The same pool, so the same count the user chose against still holds.
    expect(again.run.pool).toBe(done.run.pool)
  })

  it('keeps the mode it was played in', () => {
    const done = finished()
    const again = reduce(done, { type: 'RESTART_FRESH_DRAW' }, seededRng(99))
    if (again.screen !== 'practising') throw new Error('unreachable')
    expect(again.session.mode).toBe('test')
  })

  it('is a no-op on a plain list drill, which has nothing else to draw', () => {
    const done = at(
      initialState,
      { type: 'PRACTISE_LIST', list },
      { type: 'START' },
      { type: 'MARK', result: 'right' },
      { type: 'MARK', result: 'right' },
    )
    expect(reduce(done, { type: 'RESTART_FRESH_DRAW' })).toBe(done)
  })

  it('ignores it anywhere but results, by reference', () => {
    const home: AppState = { screen: 'home' }
    expect(reduce(home, { type: 'RESTART_FRESH_DRAW' })).toBe(home)
  })
})

describe('the section screens (012)', () => {
  const drilling = () => at(initialState, { type: 'PRACTISE_LIST', list }, { type: 'START' })

  /*
   * Legal from EVERY screen, the running drill included — the same rule OPEN_REVIEW,
   * OPEN_GAME and OPEN_TEST_SETUP already follow. The "you will lose this drill" confirm
   * belongs to NavMenu, because a pure reducer must not open a dialog.
   */
  it.each([
    ['OPEN_LISTS', 'lists'],
    ['OPEN_TESTS', 'tests'],
    ['OPEN_GAMES', 'games'],
  ] as const)('%s reaches %s from anywhere', (type, screen) => {
    for (const from of [
      initialState,
      { screen: 'review' } as AppState,
      reduce(initialState, { type: 'PRACTISE_LIST', list }),
      drilling(),
    ]) {
      expect(reduce(from, { type }).screen).toBe(screen)
    }
  })

  it('carries nothing — a section derives what it shows from the live data', () => {
    expect(reduce(initialState, { type: 'OPEN_LISTS' })).toEqual({ screen: 'lists' })
    expect(reduce(initialState, { type: 'OPEN_TESTS' })).toEqual({ screen: 'tests' })
    expect(reduce(initialState, { type: 'OPEN_GAMES' })).toEqual({ screen: 'games' })
  })

  it('goes home from any of them', () => {
    for (const from of ['lists', 'tests', 'games'] as const) {
      expect(reduce({ screen: from }, { type: 'GO_HOME' }).screen).toBe('home')
    }
  })

  describe('a seeded review filter (012 FR-5)', () => {
    it('carries the list id when one is given', () => {
      const s = reduce(initialState, { type: 'OPEN_REVIEW', listId: 'a' })
      expect(s).toEqual({ screen: 'review', listId: 'a' })
    })

    /*
     * The KEY must be absent, not present-and-undefined.
     *
     * `exactOptionalPropertyTypes` is on, so `{ listId: undefined }` does not satisfy
     * `listId?: string` — and a state carrying an explicit undefined would also stop
     * being structurally equal to the state the menu produces.
     */
    it('carries no key at all when none is given', () => {
      const s = reduce(initialState, { type: 'OPEN_REVIEW' })
      expect(s).toEqual({ screen: 'review' })
      expect(Object.hasOwn(s, 'listId')).toBe(false)
    })

    it('still opens from a running drill, seed or no seed', () => {
      expect(reduce(drilling(), { type: 'OPEN_REVIEW', listId: 'a' })).toEqual({
        screen: 'review',
        listId: 'a',
      })
    })
  })

  describe('the new screens do not become a back door', () => {
    it('refuses REVEAL, MARK, NEXT and ANSWER, by reference', () => {
      for (const from of ['lists', 'tests', 'games'] as const) {
        const state: AppState = { screen: from }
        for (const action of [
          { type: 'REVEAL' },
          { type: 'MARK', result: 'right' },
          { type: 'NEXT' },
          { type: 'ADVANCE' },
        ] as AppAction[]) {
          expect(reduce(state, action)).toBe(state)
        }
      }
    })
  })
})
