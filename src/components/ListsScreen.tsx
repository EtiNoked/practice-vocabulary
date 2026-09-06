import type { ComponentProps } from 'react'
import { SavedLists } from './SavedLists'

/**
 * Everything `SavedLists` takes, plus the verb that adds to it.
 *
 * Spread rather than re-declared so a prop added to the collection reaches this screen
 * without an edit here — and, more to the point, so this screen cannot quietly diverge
 * from the collection it wraps.
 */
type Props = ComponentProps<typeof SavedLists> & {
  onNewList: () => void
}

/**
 * My lists.
 *
 * Deliberately thin: a heading, a verb, and a collection that owns its own behaviour and
 * its own test suite. Nothing is derived here — the practice counts and the loading flag
 * arrive already computed, because they have to agree with the same numbers on other
 * screens and only `App` holds the one `now` that makes that true (012 NFR-4).
 *
 * `New list` lives here rather than on home since 012 D-1: a verb belongs beside the
 * collection it adds to, which is where someone looking for it already is.
 */
export function ListsScreen({ onNewList, ...listProps }: Props) {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">My lists</h1>

      <button type="button" onClick={onNewList} className="btn btn-primary btn-lg">
        New list
      </button>

      <SavedLists {...listProps} />
    </section>
  )
}
