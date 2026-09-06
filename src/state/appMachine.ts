import type { LangCode } from '../lang/languages'
import type { LangSource, RawRow } from '../parse/types'
import {
  createSession,
  isFinished,
  mark as markSession,
  nextCard,
  otherMode,
  prevCard,
  randomRng,
  restartShuffled,
  restartWrongOnly,
  reveal as revealSession,
  toggleAnswers,
  type Rng,
} from './session'
import type { DrillMode, MarkResult, Session, WordList } from './types'

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
  /** Omitting `mode` means test — 001's behaviour, and what every pre-modes caller meant. */
  | { type: 'START'; mode?: DrillMode }
  | { type: 'REVEAL' }
  /** Practice-mode's answer cover. A no-op in test mode, which has REVEAL. */
  | { type: 'TOGGLE_ANSWER' }
  | { type: 'MARK'; result: MarkResult }
  /** Practice-mode navigation. No-ops in test mode, where MARK does the advancing. */
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'QUIT' }
  | { type: 'RESTART_SHUFFLED' }
  | { type: 'RESTART_WRONG_ONLY' }
  /** From results: run the same list again in the other mode. */
  | { type: 'SWITCH_MODE' }
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
        session: createSession(state.list.pairs, rng, state.list.id, action.mode ?? 'test'),
      }

    /*
     * REVEAL and MARK are guarded to test mode, and NEXT/PREV to practice.
     *
     * Guarding rather than splitting `practising` into two screens keeps the
     * exhaustive switch intact, and means an out-of-mode action degrades to a
     * no-op instead of becoming a type error at a call site that cannot know the
     * mode. Same rule as an action arriving on the wrong screen: the state comes
     * back unchanged, by reference.
     */
    case 'REVEAL':
      if (state.screen !== 'practising' || state.session.mode !== 'test') return state
      return { ...state, session: revealSession(state.session) }

    /*
     * The mirror image of REVEAL, guarded the opposite way — each mode owns
     * exactly one way to show the answer and neither reaches into the other.
     *
     * Unlike REVEAL this is reversible and survives the next card: it sets a
     * property of the RUN, not of the card (009 FR-3, FR-4).
     */
    case 'TOGGLE_ANSWER':
      if (state.screen !== 'practising' || state.session.mode !== 'practice') return state
      return { ...state, session: toggleAnswers(state.session) }

    case 'MARK': {
      if (state.screen !== 'practising' || state.session.mode !== 'test') return state
      const session = markSession(state.session, action.result)
      return isFinished(session)
        ? { screen: 'results', list: state.list, session }
        : { ...state, session }
    }

    case 'NEXT': {
      if (state.screen !== 'practising' || state.session.mode !== 'practice') return state
      const session = nextCard(state.session)
      // Past the last card is the end of the run — the same boundary MARK
      // already crosses via isFinished.
      return isFinished(session)
        ? { screen: 'results', list: state.list, session }
        : { ...state, session }
    }

    case 'PREV':
      if (state.screen !== 'practising' || state.session.mode !== 'practice') return state
      return { ...state, session: prevCard(state.session) }

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

    /*
     * Built from `state.list.pairs`, NOT from the finished session's pairs.
     * After a wrong-only re-run the session holds only the pairs that were
     * missed, and switching mode there would silently drop every pair the user
     * got right.
     */
    case 'SWITCH_MODE':
      if (state.screen !== 'results') return state
      return {
        screen: 'practising',
        list: state.list,
        session: createSession(
          state.list.pairs,
          rng,
          state.list.id,
          otherMode(state.session.mode),
        ),
      }

    case 'GO_HOME':
      return { screen: 'home' }

    default:
      return state
  }
}
