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
import {
  redraw,
  runFromList,
  runListId,
  runPairs,
  type DrillRun,
  type TestPlan,
} from './drillRun'
import type { SavedTest } from './testPlan'
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
  /**
   * The three section screens (012).
   *
   * Stateless on purpose. What each one shows is derived in `App` from the live
   * subscriptions, exactly as `home` derived its lists before this feature moved them —
   * a section carrying a snapshot would go stale the moment another tab wrote, and would
   * have to be invalidated by hand from four places.
   */
  | { screen: 'lists' }
  | { screen: 'tests' }
  | { screen: 'games' }
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
  /**
   * A drill in flight, and the run it is a run OF.
   *
   * A `DrillRun` rather than a `WordList` since 011: a test can span several lists, and
   * there is then no honest single list to hold. A synthetic one was rejected on the
   * grounds the ready screen already documents for its missed subset — it would share a
   * real list's id, so anything saving by id would overwrite the real thing (011 D-7).
   *
   * The `ready` screen above deliberately keeps a real `WordList`: it needs `pairs`,
   * "Save this list" and the missed chips, none of which a run has.
   */
  | { screen: 'practising'; run: DrillRun; session: Session }
  | { screen: 'results'; run: DrillRun; session: Session }
  | {
      screen: 'review'
      /**
       * Seeds the list filter, when arriving from one list's practice line (012 FR-5).
       *
       * A SEED, not the filter itself: the filter's own state stays in the component, the
       * rule `testSetup.initial` and `gameSetup.initial` already follow (008 D-11). A
       * controlled prop would yank the user's choice back on the next re-render.
       *
       * ABSENT means "all lists", which is what arriving from the menu means. Absent
       * rather than a sentinel, and the reducer spreads it in conditionally, because
       * `exactOptionalPropertyTypes` does not accept an explicit `undefined` here.
       */
      listId?: string
    }
  /**
   * The game's three screens (008).
   *
   * Beside the drill's, not inside them. A game has questions with options, a clock and
   * points where a Session has cards and marks — folding them together would mean a
   * union every existing consumer has to narrow, or optional fields meaningless half the
   * time (008 D-7).
   */
  /**
   * The test builder (011).
   *
   * Beside the game's setup screen and shaped like it, down to the pre-fill: the two
   * screens ask the same question — which words, and how many — and only differ in what
   * happens afterwards.
   */
  | {
      screen: 'testSetup'
      /**
       * Pre-fills the builder: a saved test being edited, or a plan being reused.
       *
       * The FORM's own state lives in the component (008 D-11); this is only its seed. A
       * `SavedTest` carries an id, which is what tells the screen it is editing rather
       * than creating.
       */
      initial?: SavedTest | TestPlan
    }
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
  /** `listId` seeds the review screen's filter; omitting it means every list. */
  | { type: 'OPEN_REVIEW'; listId?: string }
  | { type: 'OPEN_REVIEW_DETAIL'; recordId: string }
  /** The three sections (012). Legal from anywhere, like OPEN_REVIEW and OPEN_GAME. */
  | { type: 'OPEN_LISTS' }
  | { type: 'OPEN_TESTS' }
  | { type: 'OPEN_GAMES' }
  /** Arrive at ready with a subset of the list's words to drill. */
  | { type: 'PRACTISE_MISSED'; list: WordList; pairs: WordPair[]; source: MissedSource }
  /** Drop the subset and go back to the whole list, staying on ready. */
  | { type: 'PRACTISE_FULL' }
  | { type: 'GO_HOME' }
  /** Open the test builder, empty. */
  | { type: 'OPEN_TEST_SETUP' }
  /** Open the test builder on an existing saved test. */
  | { type: 'EDIT_TEST'; test: SavedTest }
  /**
   * Start a run built in the builder.
   *
   * Carries a FINISHED run, not a plan. Building one needs the live lists and every
   * record, which a pure reducer does not have and must not acquire — the same reason
   * START_GAME carries a built game and PRACTISE_MISSED carries finished pairs.
   */
  | { type: 'START_RUN'; run: DrillRun; mode: DrillMode }
  /** From results: the same settings over a freshly drawn set. Pure — the pool is in state. */
  | { type: 'RESTART_FRESH_DRAW' }
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
      /*
       * The seed is SPREAD rather than assigned, so an action without one produces a
       * state with no `listId` key at all. `exactOptionalPropertyTypes` rejects an
       * explicit undefined against `listId?: string`, and a state carrying one would
       * also stop being structurally equal to the one the menu produces.
       */
      return { screen: 'review', ...(action.listId !== undefined && { listId: action.listId }) }

    case 'OPEN_REVIEW_DETAIL':
      return { screen: 'reviewDetail', recordId: action.recordId }

    /*
     * Legal from every screen, the running drill included — the same rule OPEN_REVIEW
     * above and OPEN_GAME below already follow. NavMenu owns the "you will lose this
     * drill" confirm, because a pure reducer must not open a dialog.
     */
    case 'OPEN_LISTS':
      return { screen: 'lists' }

    case 'OPEN_TESTS':
      return { screen: 'tests' }

    case 'OPEN_GAMES':
      return { screen: 'games' }

    case 'CANCEL_EDIT':
      // My lists, not home: that is the only place the editor is opened from, and 012 D-8
      // makes "back" mean the owning section rather than the front door.
      return state.screen === 'editing' ? { screen: 'lists' } : state

    case 'CONFIRM_LIST':
      return state.screen === 'editing' ? { screen: 'ready', list: action.list } : state

    case 'START': {
      if (state.screen !== 'ready') return state
      /*
       * The subset when one is selected, otherwise the whole list — and either way as a
       * RUN, through the same constructor the builder uses (011 D-9). One record-writing
       * path downstream, not two: a second path for "the simple case" is how the simple
       * case quietly stops matching the complicated one.
       */
      const run = runFromList(state.list, state.missed?.pairs ?? state.list.pairs)
      return {
        screen: 'practising',
        run,
        session: createSession(runPairs(run), rng, runListId(run), action.mode ?? 'test'),
      }
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
        ? { screen: 'results', run: state.run, session }
        : { ...state, session }
    }

    case 'NEXT': {
      if (state.screen !== 'practising' || state.session.mode !== 'practice') return state
      const session = nextCard(state.session)
      // Past the last card is the end of the run — the same boundary MARK
      // already crosses via isFinished.
      return isFinished(session)
        ? { screen: 'results', run: state.run, session }
        : { ...state, session }
    }

    case 'PREV':
      if (state.screen !== 'practising' || state.session.mode !== 'practice') return state
      return { ...state, session: prevCard(state.session) }

    case 'QUIT':
      if (state.screen !== 'practising') return state
      return { screen: 'results', run: state.run, session: state.session }

    case 'RESTART_SHUFFLED':
      if (state.screen !== 'results') return state
      return {
        screen: 'practising',
        run: state.run,
        session: restartShuffled(state.session, rng),
      }

    case 'RESTART_WRONG_ONLY':
      if (state.screen !== 'results') return state
      return {
        screen: 'practising',
        run: state.run,
        session: restartWrongOnly(state.session, rng),
      }

    /*
     * Built from `state.run.words`, NOT from the finished session's pairs.
     * After a wrong-only re-run the session holds only the pairs that were
     * missed, and switching mode there would silently drop every pair the user
     * got right.
     *
     * `run.words` is what `state.list.pairs` used to be — for a list run it IS the
     * list's pairs — and for a pool run it is the drawn set, which is right: switching
     * mode should study the fifteen words you were just tested on, not the two hundred
     * they were drawn from.
     */
    case 'SWITCH_MODE':
      if (state.screen !== 'results') return state
      return {
        screen: 'practising',
        run: state.run,
        session: createSession(
          runPairs(state.run),
          rng,
          runListId(state.run),
          otherMode(state.session.mode),
        ),
      }

    /*
     * Legal from anywhere, the drill included — NavMenu owns the "you will lose this"
     * confirm, for the same reason OPEN_REVIEW and OPEN_GAME do: a pure reducer must not
     * open a dialog.
     */
    case 'OPEN_TEST_SETUP':
      return { screen: 'testSetup' }

    case 'EDIT_TEST':
      return { screen: 'testSetup', initial: action.test }

    /*
     * Legal from the builder AND from the saved-tests screen, because a saved test is run
     * from that list — guarding this to `testSetup` alone made that button a silent no-op
     * in 011, which is precisely what the end-to-end test caught.
     *
     * `tests` rather than `home` since 012: the saved-tests list moved to its own screen,
     * and a guard that names where a collection USED to live is the same defect wearing a
     * different screen name. `appMachine.test.ts` now asserts both halves.
     *
     * Named screens rather than "anywhere": the point of the guard is that a run cannot
     * start on top of a drill or a game already in flight.
     */
    case 'START_RUN':
      if (state.screen !== 'testSetup' && state.screen !== 'tests') return state
      return {
        screen: 'practising',
        run: action.run,
        session: createSession(
          runPairs(action.run),
          rng,
          runListId(action.run),
          action.mode,
        ),
      }

    /*
     * A fresh sample of the same size, from the SAME pool snapshot (011 D-6).
     *
     * Pure, exactly as REPLAY_GAME is, and for the same reason: the pool travels inside
     * the run, so a re-draw cannot accidentally pull from a pool the user was never shown
     * a count for. `redraw` returns the run unchanged when there is nothing else to draw,
     * which is what makes this a no-op on a plain list drill rather than a reshuffle
     * wearing a different name.
     */
    case 'RESTART_FRESH_DRAW': {
      if (state.screen !== 'results') return state
      const run = redraw(state.run, rng)
      if (run === state.run) return state
      return {
        screen: 'practising',
        run,
        session: createSession(runPairs(run), rng, runListId(run), state.session.mode),
      }
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
