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
})
