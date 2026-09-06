import { useMemo } from 'react'
import { LANG_NAMES } from '../lang/languages'
import { listOptions } from '../state/wordPool'
import type { WordList } from '../state/types'
import type { PoolDraft, PoolLimits } from './usePoolDraft'

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
