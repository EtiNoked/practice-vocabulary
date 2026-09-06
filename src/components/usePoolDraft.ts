import { useMemo, useState } from 'react'
import type { PoolSource, PoolSpec } from '../state/wordPool'

/**
 * The selection state behind `PoolPicker`, in its own file.
 *
 * Split out because a `.tsx` module that exports both a component and a hook breaks fast
 * refresh — the lint rule says so, and it is right: editing the hook would remount the
 * screen and throw away the selection the user was in the middle of making.
 */

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
