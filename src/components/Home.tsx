import type { ReactNode } from 'react'
import type { WordList } from '../state/types'
import { AuthPanel } from './AuthPanel'
import { SavedLists } from './SavedLists'

interface Props {
  lists: WordList[]
  /** True while we do not yet know whose lists to show. */
  loading?: boolean
  /** Slot for account-level notices, e.g. the migration offer. */
  banner?: ReactNode
  onNewList: () => void
  onPractise: (list: WordList) => void
  onEdit: (list: WordList) => void
  onRename: (list: WordList) => void
  onDelete: (list: WordList) => void
}

export function Home({ lists, loading = false, banner, onNewList, ...listActions }: Props) {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Vocabulary Trainer</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Hear a word, say the answer, mark yourself.
        </p>
      </header>

      <AuthPanel />

      {banner}

      <button
        type="button"
        onClick={onNewList}
        className="min-h-14 rounded-lg bg-emerald-700 text-lg text-white"
      >
        New list
      </button>

      <div>
        <h2 className="mb-2 font-semibold">Saved lists</h2>
        <SavedLists lists={lists} loading={loading} {...listActions} />
      </div>
    </section>
  )
}
