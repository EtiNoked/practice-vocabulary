import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { Home } from './components/Home'
import { ListEditor } from './components/ListEditor'
import { PracticeCard } from './components/PracticeCard'
import { ReadyScreen } from './components/ReadyScreen'
import { ResultsScreen } from './components/ResultsScreen'
import { VoiceWarning } from './components/VoiceWarning'
import { initialState, reduce, type AppAction, type AppState } from './state/appMachine'
import type { WordList } from './state/types'
import { speak } from './speech/tts'
import { useVoices } from './speech/useVoices'
import { hasVoiceFor } from './speech/tts'
import { createLocalListStore } from './storage/localListStore'
import { writeFailureMessage } from './storage/messages'
import { currentPair } from './state/session'

export default function App() {
  const [state, setState] = useState<AppState>(initialState)
  const [lists, setLists] = useState<WordList[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const { voices, ready } = useVoices()

  // Signed-out storage. Phase 5 swaps this for a cloud store when a user signs in;
  // nothing below this line knows or cares which implementation it is holding.
  const store = useMemo(() => createLocalListStore(), [])

  /**
   * A layout effect rather than a plain one, deliberately.
   *
   * The local store emits synchronously on subscribe, so subscribing before the
   * browser paints means a returning user never sees a frame of "No saved lists
   * yet" before their lists appear. With `useEffect` that frame is painted, and
   * a flash of an empty home screen reads as data loss.
   */
  useLayoutEffect(() => {
    const unsubscribe = store.subscribeLists(setLists, (error) => setToast(error.message))
    return () => {
      unsubscribe()
    }
  }, [store])

  const persist = useCallback(
    async (list: WordList) => {
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
      const advances =
        action.type === 'START' ||
        action.type === 'MARK' ||
        action.type === 'RESTART_SHUFFLED' ||
        action.type === 'RESTART_WRONG_ONLY'
      if (advances) speakCurrent(next)
    },
    [state, speakCurrent],
  )

  const promptLang =
    state.screen === 'practising' || state.screen === 'ready' ? state.list.col2Lang : null
  const voiceMissing = ready && promptLang !== null && !hasVoiceFor(promptLang, voices)

  return (
    <main className="min-h-dvh bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {toast && (
        <p role="alert" className="bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          {toast}
        </p>
      )}
      {voiceMissing && promptLang && <VoiceWarning lang={promptLang} />}

      {state.screen === 'home' && (
        <Home
          lists={lists}
          onNewList={() => act({ type: 'NEW_LIST' })}
          onPractise={(list) => act({ type: 'PRACTISE_LIST', list })}
          onEdit={(list) => act({ type: 'EDIT_LIST', list })}
          onRename={async (list) => {
            const name = window.prompt('New name', list.name)
            if (name === null || name.trim() === '') return
            const result = await store.renameList(list.id, name.trim())
            if (!result.ok) setToast(writeFailureMessage(result.reason))
          }}
          onDelete={async (list) => {
            if (!window.confirm(`Delete “${list.name}”?`)) return
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
          saved={savedIds.has(state.list.id) || lists.some((l) => l.id === state.list.id)}
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
