import type { WordList } from '../state/types'

interface Props {
  lists: WordList[]
  loading?: boolean
  /** Where these lists live, which changes what the empty state can promise. */
  scope?: 'device' | 'account'
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
  onPractise,
  onEdit,
  onRename,
  onDelete,
}: Props) {
  // "No saved lists yet" shown to a signed-in user whose lists are still
  // arriving reads as data loss. Say nothing definite until we know.
  if (loading) {
    return (
      <p className="text-slate-600 dark:text-slate-400" role="status">
        Loading your lists…
      </p>
    )
  }

  if (lists.length === 0) {
    return (
      <p className="text-slate-600 dark:text-slate-400">
        No saved lists yet. Make one and it will appear here
        {scope === 'account' ? ', on any device you sign in on.' : ', on this device.'}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {lists.map((list) => (
        <li
          key={list.id}
          className="rounded-lg border border-slate-300 p-3 dark:border-slate-600"
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold">{list.name}</span>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {list.pairs.length} {list.pairs.length === 1 ? 'word' : 'words'} ·{' '}
              {formatDate(list.updatedAt)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPractise(list)}
              className="min-h-11 rounded bg-emerald-700 px-3 text-white"
            >
              Practise
            </button>
            <button
              type="button"
              onClick={() => onEdit(list)}
              className="min-h-11 rounded border border-slate-300 px-3 dark:border-slate-600"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onRename(list)}
              className="min-h-11 rounded border border-slate-300 px-3 dark:border-slate-600"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => onDelete(list)}
              className="min-h-11 rounded border border-slate-300 px-3 dark:border-slate-600"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
