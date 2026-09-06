import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { Home } from './components/Home'
import { ListEditor } from './components/ListEditor'
import { TestCard } from './components/TestCard'
import { StudyCard } from './components/StudyCard'
import { ReadyScreen } from './components/ReadyScreen'
import { ReviewScreen } from './components/ReviewScreen'
import { ReviewDetail } from './components/ReviewDetail'
import { NavMenu } from './components/NavMenu'
import { ResultsScreen } from './components/ResultsScreen'
import { MigratePrompt } from './components/MigratePrompt'
import { ScoreHistory } from './components/ScoreHistory'
import { SyncStatus } from './components/SyncStatus'
import { VoiceWarning } from './components/VoiceWarning'
import { initialState, reduce, type AppAction, type AppState } from './state/appMachine'
import type { SessionRecord, WordList } from './state/types'
import { speak } from './speech/tts'
import { useVoices } from './speech/useVoices'
import { hasVoiceFor } from './speech/tts'
import { writeFailureMessage } from './storage/messages'
import { drillRepo } from './storage/drillRepo'
import { useListStore } from './storage/useListStore'
import { useAuth } from './auth/useAuth'
import { readGuestChoice, writeGuestChoice } from './auth/guestChoice'
import { WelcomeScreen } from './components/WelcomeScreen'
import { AccountMenu } from './components/AccountMenu'
import { ThemeToggle } from './components/ThemeToggle'
import { useMigration } from './storage/useMigration'
import { currentPair } from './state/session'
import {
  collectMissed,
  missedCounts,
  toDrillPairs,
  type ReviewWindow,
} from './state/missedWords'
import { buildSessionRecord } from './state/sessionRecord'
import { GameSetup } from './components/GameSetup'
import { GameCloud } from './components/GameCloud'
import { GameResults } from './components/GameResults'
import { buildWordPool, poolSize, type PoolSpec } from './state/wordPool'
import { createGame } from './game/game'
import { buildGameRecord, gameMissSources } from './game/gameRecord'
import type { GameRecord, GameSettings } from './game/types'

/**
 * Pick up a drill parked by a previous page load.
 *
 * Read ONCE, here, rather than in two places: the screen and the run kind have
 * to come from the same payload, and `resumed` has to be true exactly when they
 * did.
 */
function restore(): { state: AppState; runKind: SessionRecord['mode']; resumed: boolean } {
  const drill = drillRepo.load()
  if (!drill) return { state: initialState, runKind: 'full', resumed: false }
  return {
    state: { screen: 'practising', list: drill.list, session: drill.session },
    runKind: drill.runKind,
    resumed: true,
  }
}

export default function App() {
  /*
   * Seeded with a FUNCTION, not a value: passing restore() directly would
   * re-read localStorage on every render. Restoring in the initialiser rather
   * than an effect also means there is no first-paint flash of the home screen
   * before the drill reappears (NFR-3).
   */
  const [restored] = useState(restore)
  const [state, setState] = useState<AppState>(restored.state)
  const [lists, setLists] = useState<WordList[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [records, setRecords] = useState<SessionRecord[]>([])
  const [games, setGames] = useState<GameRecord[]>([])
  const [toast, setToast] = useState<string | null>(null)
  // Which kind of drill is currently running, so a wrong-only re-run can be
  // recorded as such and kept out of the plain average. Seeded from the restored
  // drill so a reload cannot relabel a wrong-only re-run as a full one.
  const [sessionMode, setSessionMode] = useState<'full' | 'wrong-only'>(restored.runKind)
  /**
   * True while the card on screen arrived from storage rather than from a tap.
   *
   * FR-3: a restore has no user gesture in scope, so nothing was spoken — and on
   * iOS Safari nothing COULD be. The card says so instead, and the flag clears
   * on the first action, which re-establishes the chain.
   */
  const [resumed, setResumed] = useState(restored.resumed)
  const { voices, ready } = useVoices()

  // localStorage while signed out, Firestore while signed in. Nothing below this
  // line knows or cares which implementation it is holding.
  const { store, error: storeError } = useListStore()
  const { status: authStatus, user, available: authAvailable } = useAuth()
  const migration = useMigration(store, user?.uid ?? null)

  // Seeded with the FUNCTION, not its result — the latter re-reads storage on
  // every render.
  const [guestChosen, setGuestChosen] = useState(readGuestChoice)

  /**
   * The front door.
   *
   * `authAvailable` is the first term deliberately: with no Firebase project the
   * rest is never evaluated and no gate DOM exists at all, so a local-only build
   * is byte-for-byte what it always was.
   *
   * Deliberately NOT raised while `resolving`. That status means a device hint
   * exists, so this visitor is almost certainly about to resolve to signed-in,
   * and showing them a login screen in that window asks a returning user to log
   * in again — the same false alarm AuthStatus.resolving exists to prevent
   * (auth/types.ts:8). Falling through is already right: `store` is null there,
   * so Home renders its loading state.
   */
  const showWelcome = authAvailable && authStatus === 'guest' && !guestChosen

  /**
   * Signing out is a reset, not a navigation.
   *
   * Clearing the session choice is all the routing there is: `status` becomes
   * `guest` with nothing chosen, so the gate above goes back up on its own.
   *
   * `setState(initialState)` rather than `act({ type: 'GO_HOME' })` — `act` runs
   * the record-a-finished-drill branch and re-reads `sessionMode`, neither of
   * which is wanted here. And `savedIds` MUST be cleared: it is keyed by list id
   * and nothing else clears it on an identity change, so a list saved under one
   * account would render "Saved ✓" under the next.
   */
  const handleSignedOut = useCallback(() => {
    writeGuestChoice(false)
    setGuestChosen(false)
    setState(initialState)
    setSavedIds(new Set())
    setToast(null)
    setResumed(false)
    // The parked drill goes too. It bypasses `act`, so nothing else would clear
    // it — and a drill the user was warned they were ending must not reappear
    // when the next person signs in on this device.
    drillRepo.clear()
  }, [])

  /**
   * A layout effect rather than a plain one, deliberately.
   *
   * The local store emits synchronously on subscribe, so subscribing before the
   * browser paints means a returning user never sees a frame of "No saved lists
   * yet" before their lists appear. With `useEffect` that frame is painted, and
   * a flash of an empty home screen reads as data loss.
   */
  useLayoutEffect(() => {
    if (!store) return
    const unsubscribe = store.subscribeLists(setLists, (error) => setToast(error.message))
    return () => {
      unsubscribe()
    }
  }, [store])

  useLayoutEffect(() => {
    if (!store) return
    const unsubscribe = store.subscribeSessions(null, setRecords, () => {})
    return () => {
      unsubscribe()
    }
  }, [store])

  useLayoutEffect(() => {
    if (!store) return
    const unsubscribe = store.subscribeGames(setGames, () => {})
    return () => {
      unsubscribe()
    }
  }, [store])

  /**
   * Derived, not stored: with no store we do not yet know whose data this is,
   * so the previous identity's lists must not stay on screen. Deriving avoids a
   * clear-then-refill cascade and cannot leave a stale frame behind.
   */
  const visibleLists = useMemo(() => (store ? lists : []), [store, lists])
  const visibleRecords = useMemo(() => (store ? records : []), [store, records])
  const visibleGames = useMemo(() => (store ? games : []), [store, games])

  /**
   * Everything that can say a word was got right or wrong — drills AND games.
   *
   * A game splits into one neutral source per contributing list, so 006's engine reads
   * both without knowing the difference (008 D-3). This is what makes a game's misses
   * turn up in the ready screen's "words you missed" chips.
   */
  const missSources = useMemo(
    () => [...visibleRecords, ...visibleGames.flatMap(gameMissSources)],
    [visibleRecords, visibleGames],
  )

  /**
   * The list as it stands NOW, for a screen that is holding a snapshot of it.
   *
   * `?? fallback` rather than `null`, deliberately: a brand-new unsaved list is
   * not in `visibleLists` yet, and null means "deleted" to `collectMissed` —
   * which would drop every word it was asked about.
   */
  const liveList = useCallback(
    (fallback: WordList) => visibleLists.find((l) => l.id === fallback.id) ?? fallback,
    [visibleLists],
  )

  /**
   * The clock, read at deliberate moments rather than during render.
   *
   * Everything time-dependent on screen — the four window counts and the drill
   * that a chip produces — must agree on ONE instant, or a chip says 12 and the
   * drill deals 11. Refreshed on arriving at a screen that shows any of it, so a
   * tab left open for days does not go on answering for the day it was opened.
   */
  const [now, setNow] = useState(() => Date.now())

  const readyList = state.screen === 'ready' ? state.list : null

  /**
   * How many words each window would drill, for the chips on the ready screen.
   *
   * `Date.now()` is read HERE and threaded into the pure layer, so all four
   * counts agree on one instant. Four chips computed against four different
   * milliseconds is how you get a count of 12 and a drill of 11.
   */
  const missedForReady = useMemo(() => {
    if (!readyList) return null
    const list = liveList(readyList)
    return {
      counts: missedCounts(missSources, { listId: readyList.id, now, list }),
      degraded: collectMissed(missSources, {
        listId: readyList.id,
        window: 'all',
        now,
        list,
      }).degraded,
    }
  }, [readyList, missSources, liveList, now])

  const persist = useCallback(
    async (list: WordList) => {
      if (!store) return
      const result = await store.saveList(list)
      if (!result.ok) {
        setToast(writeFailureMessage(result.reason))
        return
      }
      setSavedIds((s) => new Set(s).add(list.id))
      setToast(null)
    },
    [store],
  )

  /**
   * Speak the current prompt. Every call site descends from a tap (Start, or a
   * Right/Wrong mark), which is what keeps iOS Safari from dropping the audio.
   */
  const speakCurrent = useCallback(
    (next: AppState) => {
      if (next.screen !== 'practising') return
      const pair = currentPair(next.session)
      if (pair) speak(pair.col2, next.list.col2Lang, voices)
    },
    [voices],
  )

  /**
   * Apply an action and, when it lands on a new card, speak it.
   *
   * The next state is computed ONCE and both stored and spoken from. Computing it
   * twice would re-run the shuffle with a different random draw, so the word
   * spoken could differ from the card shown.
   *
   * Speech happens here rather than in an effect because an effect fires outside
   * the gesture that caused it, and iOS Safari silently drops speech that does not
   * descend from a user gesture.
   */
  const act = useCallback(
    (action: AppAction) => {
      const next = reduce(state, action)
      setState(next)

      // Any action at all is a user gesture, so the "resumed" affordance has
      // done its job and the speech chain is live again.
      setResumed(false)

      // Arriving somewhere that counts or dates anything: take a fresh reading.
      if (next.screen === 'ready' || next.screen === 'review') setNow(Date.now())

      /**
       * Record a finished drill.
       *
       * Deliberately here and not in appMachine.ts: the reducer is pure and must
       * stay that way — a write inside it would be a side effect in a pure
       * function and would break its existing tests.
       *
       * `sessionMode` still holds the mode of the session that just ENDED: the
       * mode for a new session is set by START/RESTART below, while results are
       * only ever entered by MARK or QUIT.
       */
      if (state.screen === 'practising' && next.screen === 'results' && store) {
        const record = buildSessionRecord(next.list, next.session, {
          mode: sessionMode,
          partial: action.type === 'QUIT',
        })
        if (record) void store.recordSession(record)
      }

      /*
       * Record a finished game.
       *
       * Beside the drill's branch above and for the same reasons: the reducer is pure,
       * and the write belongs to whoever owns the store. `partial` is true when the
       * user quit, mirroring SessionRecord.partial.
       */
      if (state.screen === 'playing' && next.screen === 'gameResults' && store) {
        const record = buildGameRecord(next.game, { partial: action.type === 'QUIT_GAME' })
        if (record) void store.recordGame(record)
      }

      /*
       * Computed as a local FIRST and only then stored, because the value is
       * needed twice in this same call — once for setState and once for the
       * persisted payload below. Reading `sessionMode` back after
       * setSessionMode would still see the previous render's value.
       */
      const nextRunKind: SessionRecord['mode'] =
        action.type === 'RESTART_WRONG_ONLY'
          ? 'wrong-only'
          : action.type === 'START'
            ? /*
               * A missed-words drill is a harder subset and must not flatter the
               * average — the same reasoning that made RESTART_WRONG_ONLY its own
               * run kind. `state` here is the PRE-action state, which is `ready`
               * at the moment START is dispatched, so the subset is still visible.
               */
              state.screen === 'ready' && state.missed
              ? 'wrong-only'
              : 'full'
            : action.type === 'RESTART_SHUFFLED' || action.type === 'SWITCH_MODE'
              ? 'full'
              : sessionMode
      setSessionMode(nextRunKind)

      /*
       * Park or discard the drill.
       *
       * HERE, not in a useEffect. An effect fires a render later, so a reload
       * landing in that gap loses the card — which is the exact defect this
       * feature exists to fix. `act` is already the single choke point every
       * transition flows through, so one call covers all of them.
       *
       * The result is deliberately ignored: persistence is a convenience layer,
       * and a quota or private-mode failure must degrade to 001's in-memory
       * behaviour rather than interrupt the drill (FR-6).
       */
      if (next.screen === 'practising') {
        drillRepo.save({ list: next.list, session: next.session, runKind: nextRunKind })
      } else {
        // Covers finishing, QUIT (which routes to results) and GO_HOME (FR-4).
        //
        // Every GAME screen lands here too, which is deliberate rather than incidental:
        // starting a game abandons a parked drill exactly as going home does, and a
        // game itself is never parked (008 D-8) — there is no honest answer to how much
        // of the ten seconds was left, and no gesture to re-speak the word on restore.
        drillRepo.clear()
      }

      const advances =
        action.type === 'START' ||
        action.type === 'MARK' ||
        action.type === 'RESTART_SHUFFLED' ||
        action.type === 'RESTART_WRONG_ONLY' ||
        action.type === 'NEXT' ||
        // PREV too: moving back a card should say the card you moved back TO.
        action.type === 'PREV' ||
        action.type === 'SWITCH_MODE'
      if (advances) speakCurrent(next)

      /*
       * "Play again" deals a fresh round, so its first word has to be spoken — and from
       * inside the tap that dispatched this, for the reason every other speak() call in
       * this file is where it is.
       *
       * Only REPLAY_GAME: START_GAME already spoke in `startGame` (which needs the pool
       * anyway), and every later word is spoken by GameCloud from the tap that answered
       * the one before it.
       */
      if (action.type === 'REPLAY_GAME' && next.screen === 'playing') {
        const first = next.game.questions[0]
        if (first) speak(first.word.col2, next.game.settings.col2Lang, voices)
      }
    },
    [state, speakCurrent, store, sessionMode, voices],
  )

  const pickWindow = useCallback(
    (window: ReviewWindow) => {
      if (state.screen !== 'ready') return
      const list = liveList(state.list)
      const set = collectMissed(missSources, {
        listId: state.list.id,
        window,
        // The SAME `now` the chips were counted against. Reading the clock again
        // here is how a chip says 12 and the drill deals 11.
        now,
        list,
      })
      // The chip is already disabled at zero; this is the belt to that pair of
      // braces, and it keeps the reducer from ever seeing an empty drill.
      if (set.words.length === 0) return
      act({
        type: 'PRACTISE_MISSED',
        list,
        pairs: toDrillPairs(set.words),
        source: { kind: 'window', window },
      })
    },
    [state, missSources, liveList, act, now],
  )

  /**
   * How many words a spec selects, for the setup screen's live count.
   *
   * Closed over the records here so `GameSetup` never touches storage — it is handed a
   * number and renders it.
   */
  const gamePoolSize = useCallback(
    (spec: PoolSpec) => poolSize(visibleLists, spec, { records: missSources, now: Date.now() }),
    [visibleLists, missSources],
  )

  /**
   * Build the round and start it.
   *
   * The first word is spoken HERE, synchronously inside the Start tap that called this.
   * Deferring it to an effect would put it outside the gesture, and iOS Safari drops
   * that silently (008 NFR-2).
   */
  const startGame = useCallback(
    (settings: GameSettings) => {
      const pool = buildWordPool(visibleLists, settings.spec, {
        records: missSources,
        now: Date.now(),
        idPrefix: 'g',
      })
      const game = createGame(settings, pool, Math.random)
      const first = game.questions[0]
      if (first) speak(first.word.col2, settings.col2Lang, voices)
      act({ type: 'START_GAME', game })
    },
    [visibleLists, missSources, act, voices],
  )

  const promptLang =
    state.screen === 'practising' || state.screen === 'ready' ? state.list.col2Lang : null
  const voiceMissing = ready && promptLang !== null && !hasVoiceFor(promptLang, voices)

  if (showWelcome) {
    return (
      <main className="min-h-dvh bg-ground text-ink">
        <WelcomeScreen
          onContinueAsGuest={() => {
            writeGuestChoice(true)
            setGuestChosen(true)
          }}
        />
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-ground text-ink">
      {(toast ?? storeError) && (
        <p role="alert" className="bg-accent-soft p-3 text-sm text-ink">
          {toast ?? storeError}
        </p>
      )}
      <SyncStatus active={authStatus === 'signed-in'} />
      {voiceMissing && promptLang && <VoiceWarning lang={promptLang} />}

      {/*
        The settings slot, on every screen.

        In normal flow rather than fixed: TestCard's header already owns the
        top-right corner with its Quit button, and an overlay lands on top of it.
        `max-w-xl px-4` matches every screen's container so the control aligns
        with the content edge, not the viewport edge.

        Always rendered now, where it used to collapse without a Firebase project.
        The theme lives in here, and it is not an account setting — leaving the
        slot out of a local-only build would take dark mode with it.
      */}
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-4 pt-3">
        {/*
          Navigation is not an account feature, so it sits in this slot whether
          or not Firebase is configured — the same reason the theme control does.
          The confirm before abandoning a drill lives in NavMenu, because a pure
          reducer must not open a dialog.
        */}
        <NavMenu
          screen={state.screen}
          guard={
            state.screen === 'practising'
              ? 'drill'
              : state.screen === 'playing'
                ? 'game'
                : state.screen === 'editing'
                  ? 'edit'
                  : null
          }
          onHome={() => act({ type: 'GO_HOME' })}
          onReview={() => act({ type: 'OPEN_REVIEW' })}
          onGame={() => act({ type: 'OPEN_GAME' })}
        />
        {authAvailable ? (
          <AccountMenu
            drillInProgress={state.screen === 'practising'}
            onSignedOut={handleSignedOut}
          />
        ) : (
          /*
           * No account system, so no avatar and no popover to hang the theme
           * control in — but the theme is not an account setting, and a
           * local-only build would otherwise have no way to reach it at all.
           * The same slot, the same alignment, one control instead of two.
           */
          <ThemeToggle />
        )}
      </div>

      {state.screen === 'home' && (
        <Home
          lists={visibleLists}
          loading={store === null}
          scope={authStatus === 'signed-in' ? 'account' : 'device'}
          banner={
            <MigratePrompt
              count={migration.count}
              onCopy={migration.copy}
              onDismiss={migration.dismiss}
            />
          }
          history={<ScoreHistory records={visibleRecords} />}
          onSeeAllHistory={() => act({ type: 'OPEN_REVIEW' })}
          onNewList={() => act({ type: 'NEW_LIST' })}
          onPlayGame={() => act({ type: 'OPEN_GAME' })}
          onPractise={(list) => act({ type: 'PRACTISE_LIST', list })}
          onEdit={(list) => act({ type: 'EDIT_LIST', list })}
          onRename={async (list) => {
            const name = window.prompt('New name', list.name)
            if (name === null || name.trim() === '') return
            if (!store) return
            const result = await store.renameList(list.id, name.trim())
            if (!result.ok) setToast(writeFailureMessage(result.reason))
          }}
          onDelete={async (list) => {
            if (!window.confirm(`Delete “${list.name}”?`)) return
            if (!store) return
            const result = await store.removeList(list.id)
            if (!result.ok) setToast(writeFailureMessage(result.reason))
          }}
        />
      )}

      {state.screen === 'editing' && (
        <ListEditor
          mode={state.mode}
          initialRows={state.rows}
          {...(state.listId !== undefined ? { listId: state.listId } : {})}
          {...(state.name !== undefined ? { initialName: state.name } : {})}
          {...(state.langs !== undefined ? { initialLangs: state.langs } : {})}
          {...(state.langSource !== undefined ? { initialLangSource: state.langSource } : {})}
          onConfirm={(list) => {
            // Editing an already-saved list persists straight away: the user came
            // from a stored list, so silently dropping their correction if they
            // skipped a Save button would be surprising. A brand-new list is not
            // saved until they ask, via "Save this list" on the next screen.
            if (state.mode === 'update') void persist(list)
            act({ type: 'CONFIRM_LIST', list })
          }}
          onCancel={() => act({ type: 'CANCEL_EDIT' })}
        />
      )}

      {state.screen === 'ready' && (
        <ReadyScreen
          list={state.list}
          saved={savedIds.has(state.list.id) || visibleLists.some((l) => l.id === state.list.id)}
          missed={
            state.missed
              ? { count: state.missed.pairs.length, source: state.missed.source }
              : null
          }
          counts={missedForReady?.counts ?? { day: 0, week: 0, month: 0, all: 0 }}
          degraded={missedForReady?.degraded ?? false}
          onStart={(mode) => act({ type: 'START', mode })}
          onPickWindow={pickWindow}
          onPractiseFull={() => act({ type: 'PRACTISE_FULL' })}
          onSave={() => void persist(state.list)}
          onBack={() => act({ type: 'GO_HOME' })}
        />
      )}

      {/*
        Routed on the SESSION's mode, not on a separate screen.

        The two cards answer opposite questions — one gates the answer behind a
        one-way reveal and scores what follows, the other lets the user uncover
        and re-cover it at will and counts nothing — so they are two components
        rather than one with a pile of conditionals. Since 009 both hide the
        answer, which makes them look mergeable and is exactly why the note in
        StudyCard.tsx spells out that they are not.
      */}
      {state.screen === 'practising' &&
        (state.session.mode === 'practice' ? (
          <StudyCard
            list={state.list}
            session={state.session}
            resumed={resumed}
            onNext={() => act({ type: 'NEXT' })}
            onPrev={() => act({ type: 'PREV' })}
            onToggleAnswer={() => act({ type: 'TOGGLE_ANSWER' })}
            onQuit={() => act({ type: 'QUIT' })}
          />
        ) : (
          <TestCard
            list={state.list}
            session={state.session}
            voiceMissing={voiceMissing}
            resumed={resumed}
            onReveal={() => act({ type: 'REVEAL' })}
            onMark={(result) => act({ type: 'MARK', result })}
            onQuit={() => act({ type: 'QUIT' })}
          />
        ))}

      {state.screen === 'results' && (
        <ResultsScreen
          list={state.list}
          session={state.session}
          onRestartShuffled={() => act({ type: 'RESTART_SHUFFLED' })}
          onRestartWrongOnly={() => act({ type: 'RESTART_WRONG_ONLY' })}
          onSwitchMode={() => act({ type: 'SWITCH_MODE' })}
          onDone={() => act({ type: 'GO_HOME' })}
        />
      )}

      {state.screen === 'gameSetup' && (
        <GameSetup
          lists={visibleLists}
          loading={store === null}
          count={gamePoolSize}
          {...(state.initial !== undefined ? { initial: state.initial } : {})}
          onStart={startGame}
          onBack={() => act({ type: 'GO_HOME' })}
          onNewList={() => act({ type: 'NEW_LIST' })}
        />
      )}

      {state.screen === 'playing' && (
        <GameCloud
          game={state.game}
          // Bound to the game's own language, not the drill's.
          speak={(text) => speak(text, state.game.settings.col2Lang, voices)}
          onAnswer={(choiceId, remaining) =>
            act({ type: 'ANSWER', choiceId, remainingMs: remaining })
          }
          onTimeOut={() => act({ type: 'TIME_OUT' })}
          onAdvance={() => act({ type: 'ADVANCE' })}
          onQuit={() => act({ type: 'QUIT_GAME' })}
        />
      )}

      {state.screen === 'gameResults' && (
        <GameResults
          game={state.game}
          partial={state.game.answers.length < state.game.questions.length}
          onReplay={() => act({ type: 'REPLAY_GAME' })}
          onNewGame={() => act({ type: 'NEW_GAME' })}
          onDone={() => act({ type: 'GO_HOME' })}
        />
      )}

      {state.screen === 'review' && (
        <ReviewScreen
          records={visibleRecords}
          loading={store === null}
          onOpen={(recordId) => act({ type: 'OPEN_REVIEW_DETAIL', recordId })}
          onHome={() => act({ type: 'GO_HOME' })}
        />
      )}

      {state.screen === 'reviewDetail' &&
        (() => {
          /*
           * Resolved at RENDER time from the live records, never copied into
           * state. A re-emitted subscription has to win, and a record that has
           * gone (account deletion, or trimmed under the cap) has to be
           * detectable rather than frozen on screen.
           */
          const record = visibleRecords.find((r) => r.id === state.recordId) ?? null
          const list = record
            ? (visibleLists.find((l) => l.id === record.listId) ?? null)
            : null
          return (
            <ReviewDetail
              record={record}
              list={list}
              onBack={() => act({ type: 'OPEN_REVIEW' })}
              onPractiseMisses={() => {
                if (!record || !list) return
                /*
                 * Run the single record through collectMissed rather than using
                 * `wrongPairs` directly. Still-missed does not apply to one
                 * drill — these ARE its misses — but the live-list resolution
                 * does: a translation corrected since is what should be drilled,
                 * and a word deleted since should not be.
                 */
                const set = collectMissed([record], {
                  listId: record.listId,
                  window: 'all',
                  now: Date.now(),
                  list,
                })
                if (set.words.length === 0) return
                act({
                  type: 'PRACTISE_MISSED',
                  list,
                  pairs: toDrillPairs(set.words),
                  source: { kind: 'session', finishedAt: record.finishedAt },
                })
              }}
            />
          )
        })()}
    </main>
  )
}
