import type { ReactNode } from 'react'
import type { WordList } from '../state/types'
import { SavedLists } from './SavedLists'

interface Props {
  lists: WordList[]
  /** True while we do not yet know whose lists to show. */
  loading?: boolean
  /** Slot for account-level notices, e.g. the migration offer. */
  banner?: ReactNode
  /** Slot for the score history list. */
  history?: ReactNode
  /** Where the lists live, which changes what the empty state can promise. */
  scope?: 'device' | 'account'
  onNewList: () => void
  onPractise: (list: WordList) => void
  onEdit: (list: WordList) => void
  onRename: (list: WordList) => void
  onDelete: (list: WordList) => void
}

export function Home({
  lists,
  loading = false,
  banner,
  history,
  scope = 'device',
  onNewList,
  ...listActions
}: Props) {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Vocabulary Trainer</h1>
        <p className="mt-1 text-ink-muted">
          Hear a word, say the answer, mark yourself.
        </p>
      </header>

      {banner}

      <button
        type="button"
        onClick={onNewList}
        className="btn btn-primary btn-lg"
      >
        New list
      </button>

      <div>
        <h2 className="mb-2 font-semibold">Saved lists</h2>
        <SavedLists lists={lists} loading={loading} scope={scope} {...listActions} />
      </div>

      {history && (
        <div>
          <h2 className="mb-2 font-semibold">Recent practice</h2>
          {history}
        </div>
      )}
    </section>
  )
}
