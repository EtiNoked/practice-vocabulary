import { useMemo, useState } from 'react'
import { LANG_NAMES } from '../lang/languages'
import { listOptions, poolLanguages, type PoolSource, type PoolSpec } from '../state/wordPool'
import type { WordList } from '../state/types'
import { COUNT_CHIPS, MAX_GAME_WORDS, MIN_POOL, type GameSettings } from '../game/types'

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
  const [selected, setSelected] = useState<string[]>(() => [...(initial?.spec.listIds ?? [])])
  const [source, setSource] = useState<PoolSource>(initial?.spec.source ?? 'all')
  /*
   * Held as the RAW STRING, not a number.
   *
   * A controlled number input whose value is clamped on every render cannot be
   * cleared: emptying it re-renders as the minimum, and the next digit typed appends
   * to that instead of replacing it — so typing "4" over "10" gives 104. The clamp
   * belongs at the point the value is USED, not at the point it is typed.
   */
  const [typed, setTyped] = useState<string>(String(initial?.count ?? COUNT_CHIPS[0]!))

  const spec: PoolSpec = useMemo(() => ({ listIds: selected, source }), [selected, source])

  /*
   * Memoised on the SPEC and nothing else. A spec has no `count` in it, which is what
   * stops every keystroke in the number box from rebuilding the pool (008 R8).
   */
  const poolCount = useMemo(() => count(spec), [count, spec])

  const options = useMemo(() => listOptions(lists, selected), [lists, selected])
  const langs = useMemo(() => poolLanguages(lists, selected), [lists, selected])

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const cap = Math.min(poolCount, MAX_GAME_WORDS)
  const chips = COUNT_CHIPS.filter((n) => n <= cap)
  // Always leave at least one tap target: a pool of 7 offers no 10/15/20 chip, so it
  // gets an "All 7" instead of nothing but a number box.
  const showAll = cap >= MIN_POOL && !chips.includes(cap)
  const enough = poolCount >= MIN_POOL
  const asking = Math.max(1, Math.min(Number(typed) || 0, cap))

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
          <div className="flex flex-col gap-2">
            <h2 className="font-semibold">Which lists?</h2>
            <div className="flex flex-col gap-2">
              {options.map(({ list, selected: on, selectable, blocked }) => (
                <button
                  key={list.id}
                  type="button"
                  aria-pressed={on}
                  // Disabled, not hidden: a zero-explanation gap invites the question
                  // that a stated reason closes.
                  disabled={!selectable}
                  onClick={() => toggle(list.id)}
                  className={`btn btn-quiet w-full justify-between text-left ${
                    on ? 'border-primary bg-primary-soft' : ''
                  }`}
                >
                  <span>{list.name}</span>
                  <span className="text-sm text-ink-muted">
                    {blocked === 'language'
                      ? `${LANG_NAMES[list.col1Lang]} → ${LANG_NAMES[list.col2Lang]} — a game uses one language pair`
                      : `${list.pairs.length} ${list.pairs.length === 1 ? 'word' : 'words'}`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="font-semibold">Which words?</h2>
            <div className="flex gap-2">
              {(
                [
                  ['all', 'All words'],
                  ['missed', 'Words I got wrong'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={source === value}
                  onClick={() => setSource(value)}
                  className={`btn btn-quiet flex-1 ${
                    source === value ? 'border-primary bg-primary-soft' : ''
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* The ask's "see how many words you have after this selection" (008 FR-6). */}
          <p role="status" className="rounded-lg bg-surface-sunken p-3">
            {selected.length === 0 ? (
              'Pick at least one list to see how many words you have.'
            ) : poolCount === 0 && source === 'missed' ? (
              'No words to practise here yet — you have not got any of these wrong. Try “All words”.'
            ) : !enough ? (
              <>
                Only <strong>{poolCount}</strong>{' '}
                {poolCount === 1 ? 'word' : 'words'} in this selection. A game needs at least{' '}
                {MIN_POOL} — add another list, or switch to “All words”.
              </>
            ) : (
              <>
                <strong>{poolCount}</strong> words to draw from
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

          {enough && (
            <div className="flex flex-col gap-2">
              <h2 className="font-semibold">How many words?</h2>
              <div className="flex flex-wrap gap-2">
                {chips.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={asking === n}
                    onClick={() => setTyped(String(n))}
                    className={`btn btn-quiet ${asking === n ? 'border-primary bg-primary-soft' : ''}`}
                  >
                    {n}
                  </button>
                ))}
                {showAll && (
                  <button
                    type="button"
                    aria-pressed={asking === cap}
                    onClick={() => setTyped(String(cap))}
                    className={`btn btn-quiet ${asking === cap ? 'border-primary bg-primary-soft' : ''}`}
                  >
                    All {cap}
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-ink-muted">or type a number</span>
                <input
                  type="number"
                  min={1}
                  max={cap}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="field w-24"
                />
              </label>
              {poolCount > MAX_GAME_WORDS && (
                <p className="text-sm text-ink-muted">
                  A game tops out at {MAX_GAME_WORDS} words.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {/*
              This tap is what speaks the first word. It must not navigate and let
              something else speak later: iOS Safari drops any utterance that does not
              descend from a gesture, and it does so silently (008 NFR-2).
            */}
            <button
              type="button"
              disabled={!enough}
              onClick={() =>
                langs &&
                onStart({
                  spec,
                  count: asking,
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
