import type { WordList } from '../state/types'

interface Props {
  lists: WordList[]
  loading?: boolean
  /** Where these lists live, which changes what the empty state can promise. */
  scope?: 'device' | 'account'
  /**
   * How this list has been going, or null when it has never been drilled.
   *
   * Supplied by `App` from ONE computation over every list, so eight rows cannot disagree
   * about which millisecond they were counted at (012 NFR-4) — the same rule `SavedTests`
   * follows for its live pool counts.
   *
   * Derived rather than stored, and it has to be: a count kept beside the list would be
   * wrong by the next drill. `App` computes it by filtering the records to this list and
   * THEN grouping them, which is the only rule that gives a multi-list test one entry per
   * list rather than one per record (012 D-5).
   *
   * Optional, and the line renders only when this AND `onOpenPractices` are supplied —
   * several tests render this component directly with no router, the same reason
   * `onSeeAllHistory` is optional on `Home`.
   */
  practices?: (listId: string) => { count: number; lastPct: number } | null
  onOpenPractices?: (list: WordList) => void
  onPractise: (list: WordList) => void
  onEdit: (list: WordList) => void
  onRename: (list: WordList) => void
  onDelete: (list: WordList) => void
}

const formatDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB')

export function SavedLists({
  lists,
  loading = false,
  scope = 'device',
  practices,
  onOpenPractices,
  onPractise,
  onEdit,
  onRename,
  onDelete,
}: Props) {
  // "No saved lists yet" shown to a signed-in user whose lists are still
  // arriving reads as data loss. Say nothing definite until we know.
  if (loading) {
    return (
      <p className="text-ink-muted" role="status">
        Loading your lists…
      </p>
    )
  }

  if (lists.length === 0) {
    return (
      <p className="text-ink-muted">
        No saved lists yet. Make one and it will appear here
        {scope === 'account' ? ', on any device you sign in on.' : ', on this device.'}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {lists.map((list) => {
        const summary = practices?.(list.id) ?? null
        return (
        <li
          key={list.id}
          className="rounded-lg border border-line-strong p-3"
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold">{list.name}</span>
            <span className="text-sm text-ink-muted">
              {list.pairs.length} {list.pairs.length === 1 ? 'word' : 'words'} ·{' '}
              {formatDate(list.updatedAt)}
            </span>
          </div>
          {/*
            A list with no history says nothing rather than "0 practices" — a line of
            noise on every row of a new account, carrying no information.
          */}
          {summary && onOpenPractices && (
            <button
              type="button"
              onClick={() => onOpenPractices(list)}
              className="mt-1 block text-sm text-primary underline"
            >
              {summary.count} {summary.count === 1 ? 'practice' : 'practices'} · last{' '}
              {summary.lastPct}%
            </button>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPractise(list)}
              className="btn btn-primary"
            >
              Practise
            </button>
            <button
              type="button"
              onClick={() => onEdit(list)}
              className="btn btn-quiet"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onRename(list)}
              className="btn btn-quiet"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => onDelete(list)}
              className="btn btn-quiet"
            >
              Delete
            </button>
          </div>
        </li>
        )
      })}
    </ul>
  )
}
