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
  /** Optional route into the full review screen. Rendered only when supplied. */
  onSeeAllHistory?: () => void
  /** Where the lists live, which changes what the empty state can promise. */
  scope?: 'device' | 'account'
  onNewList: () => void
  /**
   * Optional, and the button renders only when supplied — several tests render Home
   * directly, and the same rule `onSeeAllHistory` follows.
   */
  onPlayGame?: () => void
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
  onNewList,
  onPlayGame,
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

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onNewList}
          className="btn btn-primary btn-lg"
        >
          New list
        </button>
        {onPlayGame && (
          <button type="button" onClick={onPlayGame} className="btn btn-quiet btn-lg">
            Play a game
          </button>
        )}
      </div>

      <div>
        <h2 className="mb-2 font-semibold">Saved lists</h2>
        <SavedLists lists={lists} loading={loading} scope={scope} {...listActions} />
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
