import { useMemo, useState } from 'react'
import { LANG_NAMES } from '../lang/languages'
import { listOptions, type PoolSource, type PoolSpec } from '../state/wordPool'
import type { WordList } from '../state/types'

/**
 * What a caller allows, and what it cannot.
 *
 * Passed in rather than read from a constant, because the two callers are bounded by
 * different things: a game is bounded by its clock (50 words × 10s is eight minutes) and
 * a test only by its pool. One shared constant would couple two limits that have nothing
 * to do with each other.
 */
export interface PoolLimits {
  /** Offered caps, filtered down to the pool. */
  readonly chips: readonly number[]
  /** Hard ceiling beyond the pool size. Absent means "the pool is the ceiling". */
  readonly max?: number
  /** Below this, a pool cannot be run and the count controls stay hidden. */
  readonly min: number
  /**
   * Whether "All N" means *uncapped* or literally N.
   *
   * A saved test is a definition that gets re-run, so "all of them" has to keep meaning
   * all of them as the lists grow. A game is dealt once and the distinction is invisible.
   */
  readonly allowUncapped: boolean
}

export interface PoolDraft {
  readonly spec: PoolSpec
  /** How many words the spec selects, from the caller's `count`. */
  readonly poolCount: number
  /** The cap as it would be SAVED: a number, or null for uncapped. */
  readonly count: number | null
  /** What that cap resolves to against today's pool — always a real number. */
  readonly asking: number
  /** True when there are enough words to run at all. */
  readonly enough: boolean
  readonly listIds: string[]
  readonly source: PoolSource
  readonly typed: string
  readonly uncapped: boolean
  /** min(poolCount, limits.max) — the largest cap that means anything. */
  readonly cap: number
  readonly toggle: (id: string) => void
  readonly setSource: (source: PoolSource) => void
  readonly setTyped: (value: string) => void
  readonly setUncapped: (value: boolean) => void
}

/**
 * The selection, as state.
 *
 * A hook rather than state inside `PoolPicker` because both callers need to READ the
 * draft — for their own summary sentence, and to hand a finished value to `onStart` — and
 * a component that owned it privately would have to report it back through an effect,
 * one render late. The screens differ in their prose and their actions, not in this.
 */
export function usePoolDraft(options: {
  initial?: { spec: PoolSpec; count: number | null }
  /** How many words a spec selects. Closed over the records by the screen's parent. */
  count: (spec: PoolSpec) => number
  limits: PoolLimits
}): PoolDraft {
  const { initial, count, limits } = options

  const [listIds, setListIds] = useState<string[]>(() => [...(initial?.spec.listIds ?? [])])
  const [source, setSource] = useState<PoolSource>(initial?.spec.source ?? 'all')
  const [uncapped, setUncapped] = useState(initial ? initial.count === null : false)
  /*
   * Held as the RAW STRING, not a number.
   *
   * A controlled number input whose value is clamped on every render cannot be cleared:
   * emptying it re-renders as the minimum, and the next digit typed appends to that
   * instead of replacing it — so typing "4" over "10" gives 104. The clamp belongs at the
   * point the value is USED, not at the point it is typed.
   *
   * Moved here from GameSetup unchanged. This comment is the load-bearing part; the next
   * person to "simplify" this into a number is the reason it is written down.
   */
  const [typed, setTyped] = useState<string>(String(initial?.count ?? limits.chips[0] ?? 10))

  const spec: PoolSpec = useMemo(() => ({ listIds, source }), [listIds, source])

  /*
   * Memoised on the SPEC and nothing else. A spec has no count in it, which is what stops
   * every keystroke in the number box from rebuilding the pool (008 R8).
   */
  const poolCount = useMemo(() => count(spec), [count, spec])

  const cap = limits.max === undefined ? poolCount : Math.min(poolCount, limits.max)
  const asking = uncapped ? cap : Math.max(1, Math.min(Number(typed) || 0, cap))

  return {
    spec,
    poolCount,
    count: uncapped ? null : asking,
    asking,
    enough: poolCount >= limits.min,
    listIds,
    source,
    typed,
    uncapped,
    cap,
    toggle: (id) => setListIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])),
    setSource,
    setTyped: (value) => {
      setUncapped(false)
      setTyped(value)
    },
    setUncapped,
  }
}

/**
 * Which lists, which words, and how many — the three questions both setup screens ask.
 *
 * Extracted from `GameSetup` for 011, and NOT as a reflex: the counter-precedent is real
 * and explicit, in `NavMenu`, which refuses to share its popover with `AccountMenu`
 * because "two call sites is not three" and the two differed in a BEHAVIOUR one had no
 * use for. These two differ only in their copy and their limits, which are props — and
 * what they render is a RULE (`listOptions`' one-language-pair, disabled-not-hidden, one
 * live count from one computation) that already lives in a shared module. `GameSetup`
 * said as much itself: a second picker that re-derived that rule slightly differently is
 * exactly what keeping it in `state/wordPool.ts` prevents.
 *
 * What stays OUT, in each screen: the heading, the summary sentence, the language line
 * and the actions. Those genuinely differ — "a game needs at least 4" has no equivalent
 * here — and a shared component that tried to cover them would be a superset of both
 * rather than the intersection.
 */
export function PoolPicker({
  lists,
  draft,
  limits,
}: {
  lists: WordList[]
  draft: PoolDraft
  limits: PoolLimits
}) {
  const options = useMemo(() => listOptions(lists, draft.listIds), [lists, draft.listIds])

  const chips = limits.chips.filter((n) => n <= draft.cap)
  // Always leave at least one tap target: a pool of 7 offers no 10/15/20 chip, so it gets
  // an "All 7" instead of nothing but a number box.
  const showAll = draft.cap >= limits.min && (!chips.includes(draft.cap) || limits.allowUncapped)
  const allSelected = limits.allowUncapped ? draft.uncapped : draft.asking === draft.cap

  return (
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
              onClick={() => draft.toggle(list.id)}
              className={`btn btn-quiet w-full justify-between text-left ${
                on ? 'border-primary bg-primary-soft' : ''
              }`}
            >
              <span>{list.name}</span>
              <span className="text-sm text-ink-muted">
                {blocked === 'language'
                  ? `${LANG_NAMES[list.col1Lang]} → ${LANG_NAMES[list.col2Lang]} — one language pair at a time`
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
              aria-pressed={draft.source === value}
              onClick={() => draft.setSource(value)}
              className={`btn btn-quiet flex-1 ${
                draft.source === value ? 'border-primary bg-primary-soft' : ''
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {draft.enough && (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">How many words?</h2>
          <div className="flex flex-wrap gap-2">
            {chips.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={!draft.uncapped && draft.asking === n}
                onClick={() => draft.setTyped(String(n))}
                className={`btn btn-quiet ${
                  !draft.uncapped && draft.asking === n ? 'border-primary bg-primary-soft' : ''
                }`}
              >
                {n}
              </button>
            ))}
            {showAll && (
              <button
                type="button"
                aria-pressed={allSelected}
                onClick={() =>
                  limits.allowUncapped ? draft.setUncapped(true) : draft.setTyped(String(draft.cap))
                }
                className={`btn btn-quiet ${allSelected ? 'border-primary bg-primary-soft' : ''}`}
              >
                All {draft.cap}
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-muted">or type a number</span>
            <input
              type="number"
              min={1}
              max={draft.cap}
              value={draft.uncapped ? '' : draft.typed}
              onChange={(e) => draft.setTyped(e.target.value)}
              className="field w-24"
            />
          </label>
          {limits.max !== undefined && draft.poolCount > limits.max && (
            <p className="text-sm text-ink-muted">A game tops out at {limits.max} words.</p>
          )}
        </div>
      )}
    </>
  )
}
