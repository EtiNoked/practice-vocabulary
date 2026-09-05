import type { ReactNode } from 'react'
import type { SessionRecord, WordList } from '../state/types'
import { SavedLists } from './SavedLists'

interface Props {
  lists: WordList[]
  /** True while we do not yet know whose lists to show. */
  loading?: boolean
  /** Slot for account-level notices, e.g. the migration offer. */
  banner?: ReactNode
  /** Slot for the score history list. */
  history?: ReactNode
  /** Optional route into the full review screen. Rendered only when supplied. */
  onSeeAllHistory?: () => void
  /** Where the lists live, which changes what the empty state can promise. */
  scope?: 'device' | 'account'
  /** Most recent comparable run per list id, for the standing on each row. */
  scores?: Map<string, SessionRecord>
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
  onSeeAllHistory,
  scope = 'device',
  scores,
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
        <SavedLists
          lists={lists}
          loading={loading}
          scope={scope}
          {...(scores ? { scores } : {})}
          {...listActions}
        />
      </div>

      {history && (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">Recent practice</h2>
            {/* The menu is the primary route to review; this is the discoverable one. */}
            {onSeeAllHistory && (
              <button
                type="button"
                onClick={onSeeAllHistory}
                className="text-sm text-primary underline"
              >
                See all →
              </button>
            )}
          </div>
          {history}
        </div>
      )}
    </section>
  )
}
