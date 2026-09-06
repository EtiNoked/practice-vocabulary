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
import type { ReviewWindow } from './missedWords'
import type { DrillMode, MarkResult, Session, WordList, WordPair } from './types'
import { advance as advanceGame, answer as answerGame, isFinished as gameFinished, replay as replayGame, timeOut as timeOutGame } from '../game/game'
import type { Game, GameSettings } from '../game/types'

/**
 * Where a missed-words subset came from, so the ready screen can say it in
 * words. A discriminated union rather than a display string: prose belongs to
 * the component, and the state stays serialisable and comparable.
 */
export type MissedSource =
  | { kind: 'window'; window: ReviewWindow }
  | { kind: 'session'; finishedAt: number }

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
  | {
      screen: 'ready'
      list: WordList
      /**
       * Present when the user picked a missed-words subset on this screen.
       *
       * Carried BESIDE the list rather than as a synthetic WordList whose pairs
       * are the subset. Such a list would share the real one's id, so "Save this
       * list" would overwrite forty words with twelve — keeping them separate
       * makes that mistake unrepresentable rather than merely avoided.
       */
      missed?: { pairs: WordPair[]; source: MissedSource }
    }
  | { screen: 'practising'; list: WordList; session: Session }
  | { screen: 'results'; list: WordList; session: Session }
  | { screen: 'review' }
  /**
   * The game's three screens (008).
   *
   * Beside the drill's, not inside them. A game has questions with options, a clock and
   * points where a Session has cards and marks — folding them together would mean a
   * union every existing consumer has to narrow, or optional fields meaningless half the
   * time (008 D-7).
   */
  | {
      screen: 'gameSetup'
      /**
       * Pre-fills the form after "New game", so the previous round's settings are the
       * starting point rather than a blank slate (008 FR-27). The FORM's own state lives
       * in the component (008 D-11); this is only its seed.
       */
      initial?: GameSettings
    }
  | { screen: 'playing'; game: Game }
  | { screen: 'gameResults'; game: Game }
  /** Holds the record ID, never the record: a copy goes stale on the next emit. */
  | { screen: 'reviewDetail'; recordId: string }

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
  | { type: 'OPEN_REVIEW' }
  | { type: 'OPEN_REVIEW_DETAIL'; recordId: string }
  /** Arrive at ready with a subset of the list's words to drill. */
  | { type: 'PRACTISE_MISSED'; list: WordList; pairs: WordPair[]; source: MissedSource }
  /** Drop the subset and go back to the whole list, staying on ready. */
  | { type: 'PRACTISE_FULL' }
  | { type: 'GO_HOME' }
  | { type: 'OPEN_GAME' }
  /**
   * Carries a FINISHED Game, not settings.
   *
   * Building one needs the live lists and every record, which a pure reducer does not
   * have and must not acquire — the same reason PRACTISE_MISSED carries finished pairs.
   */
  | { type: 'START_GAME'; game: Game }
  | { type: 'ANSWER'; choiceId: string; remainingMs: number }
  | { type: 'TIME_OUT' }
  | { type: 'ADVANCE' }
  /** Same settings, same pool, a fresh draw. Pure — the pool is already in the state. */
  | { type: 'REPLAY_GAME' }
  | { type: 'NEW_GAME' }
  | { type: 'QUIT_GAME' }

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
      // Deliberately WITHOUT `missed`: arriving from home always means the whole
      // list, even when the previous visit to this screen had a subset selected.
      return { screen: 'ready', list: action.list }

    case 'PRACTISE_MISSED':
      return {
        screen: 'ready',
        list: action.list,
        missed: { pairs: action.pairs, source: action.source },
      }

    case 'PRACTISE_FULL':
      return state.screen === 'ready' ? { screen: 'ready', list: state.list } : state

    /*
     * Legal from every screen, the running drill included.
     *
     * The "you will lose this drill" confirm lives in NavMenu, not here: a pure
     * reducer must not open a dialog, which is the same reason AccountMenu owns
     * its own mid-drill sign-out warning.
     */
    case 'OPEN_REVIEW':
      return { screen: 'review' }

    case 'OPEN_REVIEW_DETAIL':
      return { screen: 'reviewDetail', recordId: action.recordId }

    case 'CANCEL_EDIT':
      return state.screen === 'editing' ? { screen: 'home' } : state

    case 'CONFIRM_LIST':
      return state.screen === 'editing' ? { screen: 'ready', list: action.list } : state

    case 'START':
      if (state.screen !== 'ready') return state
      return {
        screen: 'practising',
        list: state.list,
        session: createSession(
          // The subset when one is selected, otherwise the whole list. The list
          // ID is kept either way, so the record files against the real list and
          // the next missed set can read this drill back.
          state.missed?.pairs ?? state.list.pairs,
          rng,
          state.list.id,
          action.mode ?? 'test',
        ),
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

    case 'OPEN_GAME':
      // Legal from anywhere, the drill included — NavMenu owns the "you will lose this"
      // confirm, for the same reason OPEN_REVIEW does: a pure reducer must not open a
      // dialog.
      return { screen: 'gameSetup' }

    case 'START_GAME':
      return state.screen === 'gameSetup' ? { screen: 'playing', game: action.game } : state

    case 'ANSWER':
      if (state.screen !== 'playing') return state
      return { ...state, game: answerGame(state.game, action.choiceId, action.remainingMs) }

    case 'TIME_OUT':
      if (state.screen !== 'playing') return state
      return { ...state, game: timeOutGame(state.game) }

    case 'ADVANCE': {
      if (state.screen !== 'playing') return state
      const game = advanceGame(state.game)
      // Past the last question is the end of the round — the same boundary MARK and
      // NEXT already cross via isFinished.
      return gameFinished(game) ? { screen: 'gameResults', game } : { ...state, game }
    }

    case 'QUIT_GAME':
      return state.screen === 'playing' ? { screen: 'gameResults', game: state.game } : state

    /*
     * Pure, unlike START_GAME, and that is the whole value of carrying the pool inside
     * the Game: a replay needs no lists and no records, so it cannot accidentally draw
     * from a pool the user was never shown a count for (008 D-9).
     */
    case 'REPLAY_GAME':
      return state.screen === 'gameResults'
        ? { screen: 'playing', game: replayGame(state.game, rng) }
        : state

    case 'NEW_GAME':
      return state.screen === 'gameResults'
        ? { screen: 'gameSetup', initial: state.game.settings }
        : state

    case 'GO_HOME':
      return { screen: 'home' }

    default:
      return state
  }
}
