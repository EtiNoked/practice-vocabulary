import { describe, expect, it } from 'vitest'
import type { WordList } from './types'
import { type AppState, initialState, reduce } from './appMachine'

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

  it('cancelling the editor returns home', () => {
    const s = at(initialState, { type: 'NEW_LIST' }, { type: 'CANCEL_EDIT' })
    expect(s.screen).toBe('home')
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
