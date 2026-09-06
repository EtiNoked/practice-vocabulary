import { useMemo } from 'react'
import { LANG_NAMES } from '../lang/languages'
import type { TestPlan } from '../state/drillRun'
import { TEST_COUNT_CHIPS, isRunnable, type SavedTest } from '../state/testPlan'
import type { DrillMode } from '../state/types'
import type { WordList } from '../state/types'
import { poolLanguages, type PoolSpec } from '../state/wordPool'
import { PoolPicker, usePoolDraft, type PoolLimits } from './PoolPicker'

/**
 * What a test allows.
 *
 * `min: 1` — a one-word drill is a perfectly reasonable thing to want, and unlike the
 * game there are no distractors to find. No `max`: a test has no clock, so the only
 * ceiling is the pool itself. `allowUncapped` because a saved test is re-run, and "all of
 * them" has to keep meaning all of them as the lists grow (011 D-10).
 */
const TEST_LIMITS: PoolLimits = {
  chips: TEST_COUNT_CHIPS,
  min: 1,
  allowUncapped: true,
}

interface Props {
  lists: WordList[]
  /** True while we do not yet know whose lists to show. */
  loading?: boolean
  /**
   * How many words a spec would select.
   *
   * Supplied by `App`, which holds the records — this screen never touches storage. It is
   * `poolSize` with the context already closed over, against one agreed millisecond.
   */
  count: (spec: PoolSpec) => number
  /** A saved test being edited, or a plan being reused. */
  initial?: SavedTest | TestPlan
  /** `savedTestId` is present when this run came from a saved test. */
  onStart: (plan: TestPlan, mode: DrillMode, savedTestId: string | undefined) => void
  onSave: (plan: TestPlan, name: string) => void
  onBack: () => void
  onNewList: () => void
}

/** A saved test has an id; a bare plan does not. */
function savedId(initial: SavedTest | TestPlan | undefined): string | undefined {
  return initial && 'id' in initial ? initial.id : undefined
}

/**
 * Build a test: which lists, which words, how many — then drill it, or keep it.
 *
 * Owns its own form state and hands `App` a finished `TestPlan`, the same shape
 * `ListEditor` and `GameSetup` have and for the same reason (008 D-11): the form has no
 * cross-screen consequence, so putting five fields and four actions in the reducer would
 * double it for nothing.
 *
 * Everything list-shaped comes from `PoolPicker`, which renders the one-language-pair rule
 * rather than deciding it. This screen owns only its own prose and its own actions.
 */
export function TestSetup({
  lists,
  loading = false,
  count,
  initial,
  onStart,
  onSave,
  onBack,
  onNewList,
}: Props) {
  const draft = usePoolDraft({
    ...(initial !== undefined
      ? { initial: { spec: initial.spec, count: initial.count } }
      : {}),
    count,
    limits: TEST_LIMITS,
  })

  const langs = useMemo(() => poolLanguages(lists, draft.listIds), [lists, draft.listIds])

  const editing = savedId(initial)
  const name = initial && 'name' in initial ? initial.name : null
  const plan: TestPlan = { spec: draft.spec, count: draft.count }
  const ready = isRunnable(draft.poolCount) && langs !== null

  const save = () => {
    // `window.prompt`, matching Home's rename. This app has exactly one dialog pattern
    // and introducing a second for one field would be a whole modal's worth of work.
    const chosen = name ?? window.prompt('Name this test')
    if (chosen === null || chosen.trim() === '') return
    onSave(plan, chosen.trim())
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-2xl font-semibold">{name ?? 'Build a test'}</h1>
        <p className="mt-1 text-ink-muted">
          Several lists at once, or just the words you keep getting wrong.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-muted">Loading your lists…</p>
      ) : lists.length === 0 ? (
        <div className="card flex flex-col gap-3 p-4">
          <p>You need a list before you can build a test.</p>
          <button type="button" onClick={onNewList} className="btn btn-primary">
            New list
          </button>
        </div>
      ) : (
        <>
          <PoolPicker lists={lists} draft={draft} limits={TEST_LIMITS} />

          <p role="status" className="rounded-lg bg-surface-sunken p-3">
            {draft.listIds.length === 0 ? (
              'Pick at least one list to see how many words you have.'
            ) : draft.poolCount === 0 && draft.source === 'missed' ? (
              'Nothing to practise here yet — you have not got any of these wrong. Try “All words”.'
            ) : draft.poolCount === 0 ? (
              'No words in this selection.'
            ) : (
              <>
                <strong>{draft.asking}</strong> of <strong>{draft.poolCount}</strong>{' '}
                {draft.poolCount === 1 ? 'word' : 'words'}
                {langs && (
                  <>
                    . You&apos;ll hear <strong>{LANG_NAMES[langs.col2Lang]}</strong> and answer in{' '}
                    <strong>{LANG_NAMES[langs.col1Lang]}</strong>
                  </>
                )}
                .
              </>
            )}
          </p>

          {/*
            EITHER button starts its mode's first utterance, and both call `onStart`
            synchronously. On iOS the tap establishes the user-gesture chain that every
            later auto-speak descends from, and speech from anywhere else is dropped
            silently — so neither may be demoted to something that navigates first and
            speaks later. The same construction, and the same reason, as ReadyScreen.
          */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={!ready}
                onClick={() => onStart(plan, 'practice', editing)}
                aria-describedby="test-practice-hint"
                className="btn btn-primary btn-lg"
              >
                Practice
              </button>
              <p id="test-practice-hint" className="text-center text-sm text-ink-muted">
                Hear it, try it, reveal when you want
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={!ready}
                onClick={() => onStart(plan, 'test', editing)}
                aria-describedby="test-test-hint"
                className="btn btn-lg bg-ink text-ground disabled:opacity-40"
              >
                Test
              </button>
              <p id="test-test-hint" className="text-center text-sm text-ink-muted">
                Hear it and answer from memory
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={draft.listIds.length === 0}
              onClick={save}
              className="btn btn-quiet"
            >
              {editing ? 'Save changes' : 'Save this test'}
            </button>
            <button type="button" onClick={onBack} className="btn btn-quiet">
              Back
            </button>
          </div>
        </>
      )}
    </section>
  )
}
