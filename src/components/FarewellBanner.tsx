import type { Farewell } from '../share/types'

interface Props {
  farewells: Farewell[]
  onKeep: (farewell: Farewell) => void
  onDismiss: (farewell: Farewell) => void
}

const WHAT: Record<Farewell['reason'], string> = {
  removed: 'removed you from',
  stopped: 'stopped sharing',
  deleted: 'deleted',
}

/**
 * "Keep a copy?" for every shared list someone lost while they were away (016 D-11).
 *
 * It waits however long they take to come back: the farewell holds the list as they last
 * saw it, so the offer stays good even after the original changes or is gone.
 */
export function FarewellBanner({ farewells, onKeep, onDismiss }: Props) {
  if (farewells.length === 0) return null
  return (
    <ul className="flex flex-col gap-2" aria-label="Lists no longer shared with you">
      {farewells.map((f) => (
        <li key={f.id} className="rounded-lg border border-line-strong bg-accent-soft p-3 text-ink">
          <p>
            {f.byName ?? 'The owner'} {WHAT[f.reason]} “{f.list.name}”
            {f.reason === 'stopped' ? ' with you' : ''}.
          </p>
          <p className="text-sm text-ink-muted">
            Keep a private copy of its {f.list.pairs.length} {f.list.pairs.length === 1 ? 'word' : 'words'}? Your practice
            history comes with it.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => onKeep(f)}>
              Keep a private copy
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => onDismiss(f)}>
              Dismiss
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
