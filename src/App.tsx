import { useCallback, useState } from 'react'
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
import { listRepo } from './storage/listRepo'
import { currentPair } from './state/session'

export default function App() {
  const [state, setState] = useState<AppState>(initialState)
  const [lists, setLists] = useState<WordList[]>(() => listRepo.getAll())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const { voices, ready } = useVoices()

  const refresh = useCallback(() => setLists(listRepo.getAll()), [])

  const persist = useCallback(
    (list: WordList) => {
      const existing = listRepo.getById(list.id)
      const result = existing
        ? listRepo.update(list.id, {
            pairs: list.pairs,
            col1Lang: list.col1Lang,
            col2Lang: list.col2Lang,
            langSource: list.langSource,
          })
        : listRepo.save(list)

      if (!result.ok) {
        setToast(
          result.reason === 'quota'
            ? "This device's storage is full, so the list wasn't saved. You can still practise it now."
            : "Couldn't save to this browser's storage. You can still practise this list now.",
        )
        return
      }
      if (existing && list.name !== existing.name) listRepo.rename(list.id, list.name)
      setSavedIds((s) => new Set(s).add(list.id))
      setToast(null)
      refresh()
    },
    [refresh],
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
          onRename={(list) => {
            const name = window.prompt('New name', list.name)
            if (name && name.trim() !== '') {
              listRepo.rename(list.id, name.trim())
              refresh()
            }
          }}
          onDelete={(list) => {
            if (window.confirm(`Delete “${list.name}”?`)) {
              listRepo.remove(list.id)
              refresh()
            }
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
            if (state.mode === 'update') persist(list)
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
          onSave={() => persist(state.list)}
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
