import { useCallback, useLayoutEffect, useState } from 'react'
import { Home } from './components/Home'
import { ListEditor } from './components/ListEditor'
import { PracticeCard } from './components/PracticeCard'
import { ReadyScreen } from './components/ReadyScreen'
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
import { useListStore } from './storage/useListStore'
import { useAuth } from './auth/useAuth'
import { readGuestChoice, writeGuestChoice } from './auth/guestChoice'
import { WelcomeScreen } from './components/WelcomeScreen'
import { AccountMenu } from './components/AccountMenu'
import { useMigration } from './storage/useMigration'
import { currentPair } from './state/session'
import { buildSessionRecord } from './state/sessionRecord'

export default function App() {
  const [state, setState] = useState<AppState>(initialState)
  const [lists, setLists] = useState<WordList[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [records, setRecords] = useState<SessionRecord[]>([])
  const [toast, setToast] = useState<string | null>(null)
  // Which kind of drill is currently running, so a wrong-only re-run can be
  // recorded as such and kept out of the plain average.
  const [sessionMode, setSessionMode] = useState<'full' | 'wrong-only'>('full')
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

  /**
   * Derived, not stored: with no store we do not yet know whose data this is,
   * so the previous identity's lists must not stay on screen. Deriving avoids a
   * clear-then-refill cascade and cannot leave a stale frame behind.
   */
  const visibleLists = store ? lists : []
  const visibleRecords = store ? records : []

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

      if (action.type === 'RESTART_WRONG_ONLY') setSessionMode('wrong-only')
      else if (action.type === 'START' || action.type === 'RESTART_SHUFFLED') setSessionMode('full')

      const advances =
        action.type === 'START' ||
        action.type === 'MARK' ||
        action.type === 'RESTART_SHUFFLED' ||
        action.type === 'RESTART_WRONG_ONLY'
      if (advances) speakCurrent(next)
    },
    [state, speakCurrent, store, sessionMode],
  )

  const promptLang =
    state.screen === 'practising' || state.screen === 'ready' ? state.list.col2Lang : null
  const voiceMissing = ready && promptLang !== null && !hasVoiceFor(promptLang, voices)

  if (showWelcome) {
    return (
      <main className="min-h-dvh bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
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
    <main className="min-h-dvh bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {(toast ?? storeError) && (
        <p role="alert" className="bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          {toast ?? storeError}
        </p>
      )}
      <SyncStatus active={authStatus === 'signed-in'} />
      {voiceMissing && promptLang && <VoiceWarning lang={promptLang} />}

      {/*
        The account slot, on every screen.

        In normal flow rather than fixed: PracticeCard's header already owns the
        top-right corner with its Quit button, and an overlay lands on top of it.
        `max-w-xl px-4` matches every screen's container so the control aligns
        with the content edge, not the viewport edge. Rendered only when there is
        an account system at all, so a local-only build has no extra DOM and no
        extra height.
      */}
      {authAvailable && (
        <div className="mx-auto flex max-w-xl justify-end px-4 pt-3">
          <AccountMenu
            drillInProgress={state.screen === 'practising'}
            onSignedOut={handleSignedOut}
          />
        </div>
      )}

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
          onNewList={() => act({ type: 'NEW_LIST' })}
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
          onStart={() => act({ type: 'START' })}
          onSave={() => void persist(state.list)}
          onBack={() => act({ type: 'GO_HOME' })}
        />
      )}

      {state.screen === 'practising' && (
        <PracticeCard
          list={state.list}
          session={state.session}
          voiceMissing={voiceMissing}
          onReveal={() => act({ type: 'REVEAL' })}
          onMark={(result) => act({ type: 'MARK', result })}
          onQuit={() => act({ type: 'QUIT' })}
        />
      )}

      {state.screen === 'results' && (
        <ResultsScreen
          list={state.list}
          session={state.session}
          onRestartShuffled={() => act({ type: 'RESTART_SHUFFLED' })}
          onRestartWrongOnly={() => act({ type: 'RESTART_WRONG_ONLY' })}
          onDone={() => act({ type: 'GO_HOME' })}
        />
      )}
    </main>
  )
}
