import { useMemo } from 'react'
import { LANG_NAMES } from '../lang/languages'
import { poolLanguages, type PoolSpec } from '../state/wordPool'
import type { WordList } from '../state/types'
import { PoolPicker, usePoolDraft, type PoolLimits } from './PoolPicker'
import { COUNT_CHIPS, MAX_GAME_WORDS, MIN_POOL, type GameSettings } from '../game/types'

/**
 * What a game allows.
 *
 * `min` is MIN_POOL because a cloud of six needs five distractors; `max` is the CLOCK —
 * 50 words at ten seconds is about eight minutes. Neither is a fact about choosing words,
 * which is why they are stated here and passed in rather than living in the picker.
 */
const GAME_LIMITS: PoolLimits = {
  chips: COUNT_CHIPS,
  max: MAX_GAME_WORDS,
  min: MIN_POOL,
  // A game is dealt once, so "all 7" can simply BE 7 — there is no later re-run for the
  // distinction to matter to.
  allowUncapped: false,
}

interface Props {
  lists: WordList[]
  /** True while we do not yet know whose lists to show. */
  loading?: boolean
  /**
   * How many words a spec would select.
   *
   * Supplied by `App`, which holds the records — this screen never touches storage. It
   * is `poolSize` with the context already closed over.
   */
  count: (spec: PoolSpec) => number
  /** Pre-fills the form after "New game" (008 FR-27). */
  initial?: GameSettings
  onStart: (settings: GameSettings) => void
  onBack: () => void
  onNewList: () => void
}

/**
 * Choose what a game is made of.
 *
 * Owns its own selection state and hands `App` a finished `GameSettings` on start — the
 * same shape `ListEditor` has, and for the same reason (008 D-11): the form has no
 * cross-screen consequence, so putting five fields and four actions in the reducer would
 * double it for nothing.
 *
 * Everything list-shaped here comes from `state/wordPool`: the rows and their disabled
 * state from `listOptions`, the language line from `poolLanguages`, the live count from
 * the `count` prop. This screen RENDERS the one-language-pair rule; it does not decide
 * it. A second picker that re-derived that rule slightly differently is exactly what
 * keeping it in the shared module prevents.
 */
export function GameSetup({
  lists,
  loading = false,
  count,
  initial,
  onStart,
  onBack,
  onNewList,
}: Props) {
  const draft = usePoolDraft({
    ...(initial !== undefined ? { initial: { spec: initial.spec, count: initial.count } } : {}),
    count,
    limits: GAME_LIMITS,
  })

  const langs = useMemo(() => poolLanguages(lists, draft.listIds), [lists, draft.listIds])

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Play a game</h1>
        <p className="mt-1 text-ink-muted">
          Hear a word, grab it from the cloud before the clock runs out.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-muted">Loading your lists…</p>
      ) : lists.length === 0 ? (
        <div className="card flex flex-col gap-3 p-4">
          <p>You need a list before you can play.</p>
          <button type="button" onClick={onNewList} className="btn btn-primary">
            New list
          </button>
        </div>
      ) : (
        <>
          <PoolPicker lists={lists} draft={draft} limits={GAME_LIMITS} />

          {/* The ask's "see how many words you have after this selection" (008 FR-6). */}
          <p role="status" className="rounded-lg bg-surface-sunken p-3">
            {draft.listIds.length === 0 ? (
              'Pick at least one list to see how many words you have.'
            ) : draft.poolCount === 0 && draft.source === 'missed' ? (
              'No words to practise here yet — you have not got any of these wrong. Try “All words”.'
            ) : !draft.enough ? (
              <>
                Only <strong>{draft.poolCount}</strong>{' '}
                {draft.poolCount === 1 ? 'word' : 'words'} in this selection. A game needs at least{' '}
                {MIN_POOL} — add another list, or switch to “All words”.
              </>
            ) : (
              <>
                <strong>{draft.poolCount}</strong> words to draw from
                {langs && (
                  <>
                    . You&apos;ll hear <strong>{LANG_NAMES[langs.col2Lang]}</strong> and pick the{' '}
                    <strong>{LANG_NAMES[langs.col1Lang]}</strong>
                  </>
                )}
                .
              </>
            )}
          </p>

          <div className="flex flex-col gap-2">
            {/*
              This tap is what speaks the first word. It must not navigate and let
              something else speak later: iOS Safari drops any utterance that does not
              descend from a gesture, and it does so silently (008 NFR-2).
            */}
            <button
              type="button"
              disabled={!draft.enough}
              onClick={() =>
                langs &&
                onStart({
                  spec: draft.spec,
                  count: draft.asking,
                  col1Lang: langs.col1Lang,
                  col2Lang: langs.col2Lang,
                })
              }
              className="btn btn-primary btn-lg"
            >
              Start game
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
