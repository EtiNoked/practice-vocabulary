import type { LangCode } from '../lang/languages'
import type { LangSource, RawRow } from '../parse/types'
import {
  createSession,
  isFinished,
  mark as markSession,
  randomRng,
  restartShuffled,
  restartWrongOnly,
  reveal as revealSession,
  type Rng,
} from './session'
import type { MarkResult, Session, WordList } from './types'

/**
 * The whole app as a discriminated union.
 *
 * Modelling screens this way rather than as a bag of booleans is what makes
 * "the answer is unreachable while prompting" a compile-time property: a state
 * that has no `session` simply cannot be asked for one.
 */
export type AppState =
  | { screen: 'home' }
  | {
      screen: 'editing'
      mode: 'create' | 'update'
      rows: RawRow[]
      /** Present only in update mode. */
      listId?: string
      name?: string
      /**
       * Carried alongside the rows for the same reason `name` is: projecting a
       * WordList down to RawRow[] would otherwise drop the languages, and the
       * editor would re-detect them — silently discarding a choice the user made.
       */
      langs?: { col1: LangCode; col2: LangCode }
      langSource?: LangSource
    }
  | { screen: 'ready'; list: WordList }
  | { screen: 'practising'; list: WordList; session: Session }
  | { screen: 'results'; list: WordList; session: Session }

export type AppAction =
  | { type: 'NEW_LIST' }
  | { type: 'EDIT_LIST'; list: WordList }
  | { type: 'PRACTISE_LIST'; list: WordList }
  | { type: 'CANCEL_EDIT' }
  | { type: 'CONFIRM_LIST'; list: WordList }
  | { type: 'START' }
  | { type: 'REVEAL' }
  | { type: 'MARK'; result: MarkResult }
  | { type: 'QUIT' }
  | { type: 'RESTART_SHUFFLED' }
  | { type: 'RESTART_WRONG_ONLY' }
  | { type: 'GO_HOME' }

export const initialState: AppState = { screen: 'home' }

const EMPTY_ROW: RawRow = { col1: '', col2: '' }

/**
 * Pure state transition. Actions that do not apply to the current screen return
 * the state unchanged (by reference), so an illegal transition is a no-op rather
 * than a corrupt state.
 *
 * `rng` is injectable so tests can pin the shuffle.
 */
export function reduce(state: AppState, action: AppAction, rng: Rng = randomRng): AppState {
  switch (action.type) {
    case 'NEW_LIST':
      return { screen: 'editing', mode: 'create', rows: [{ ...EMPTY_ROW }] }

    case 'EDIT_LIST':
      return {
        screen: 'editing',
        mode: 'update',
        listId: action.list.id,
        name: action.list.name,
        rows: action.list.pairs.map((p) => ({ col1: p.col1, col2: p.col2 })),
        langs: { col1: action.list.col1Lang, col2: action.list.col2Lang },
        langSource: action.list.langSource,
      }

    case 'PRACTISE_LIST':
      return { screen: 'ready', list: action.list }

    case 'CANCEL_EDIT':
      return state.screen === 'editing' ? { screen: 'home' } : state

    case 'CONFIRM_LIST':
      return state.screen === 'editing' ? { screen: 'ready', list: action.list } : state

    case 'START':
      if (state.screen !== 'ready') return state
      return {
        screen: 'practising',
        list: state.list,
        session: createSession(state.list.pairs, rng, state.list.id),
      }

    case 'REVEAL':
      if (state.screen !== 'practising') return state
      return { ...state, session: revealSession(state.session) }

    case 'MARK': {
      if (state.screen !== 'practising') return state
      const session = markSession(state.session, action.result)
      return isFinished(session)
        ? { screen: 'results', list: state.list, session }
        : { ...state, session }
    }

    case 'QUIT':
      if (state.screen !== 'practising') return state
      return { screen: 'results', list: state.list, session: state.session }

    case 'RESTART_SHUFFLED':
      if (state.screen !== 'results') return state
      return {
        screen: 'practising',
        list: state.list,
        session: restartShuffled(state.session, rng),
      }

    case 'RESTART_WRONG_ONLY':
      if (state.screen !== 'results') return state
      return {
        screen: 'practising',
        list: state.list,
        session: restartWrongOnly(state.session, rng),
      }

    case 'GO_HOME':
      return { screen: 'home' }

    default:
      return state
  }
}
