import { describeTest, isRunnable, type SavedTest } from '../state/testPlan'
import type { DrillMode, WordList } from '../state/types'
import type { PoolSpec } from '../state/wordPool'

interface Props {
  tests: SavedTest[]
  lists: WordList[]
  /**
   * How many words a spec selects right now.
   *
   * Supplied by `App` against ONE `now`, so eight rows cannot disagree about which
   * millisecond they were counted at (011 NFR-4). Deliberately not stored on the test: a
   * saved count would be wrong by the next drill, and wrong in the direction that
   * matters — claiming words the user has since learned.
   */
  count: (spec: PoolSpec) => number
  loading?: boolean
  onRun: (test: SavedTest, mode: DrillMode) => void
  onEdit: (test: SavedTest) => void
  onRename: (test: SavedTest) => void
  onDelete: (test: SavedTest) => void
}

/**
 * Tests you have kept, with what each one is set up to do.
 *
 * Shaped on `SavedLists` down to the button row, because it is the same kind of thing in
 * the same place: a named object you own, with the actions you would expect on it. Two
 * lists on one screen that behaved differently would be the surprising choice.
 */
export function SavedTests({
  tests,
  lists,
  count,
  loading = false,
  onRun,
  onEdit,
  onRename,
  onDelete,
}: Props) {
  // "No saved tests yet" shown to a signed-in user whose tests are still arriving reads
  // as data loss. Say nothing definite until we know — the same rule SavedLists follows.
  if (loading) {
    return (
      <p className="text-ink-muted" role="status">
        Loading your tests…
      </p>
    )
  }

  if (tests.length === 0) {
    return (
      <p className="text-ink-muted">
        No saved tests yet. Build one and it will appear here, ready to run again.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {tests.map((test) => {
        const available = count(test.spec)
        const runnable = isRunnable(available)
        return (
          <li key={test.id} className="rounded-lg border border-line-strong p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-semibold">{test.name}</span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {describeTest(test, lists, available)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {/*
                Practice first, matching the ready screen's order: the gentler of the two
                is the primary action everywhere else in this app.
              */}
              <button
                type="button"
                disabled={!runnable}
                onClick={() => onRun(test, 'practice')}
                className="btn btn-primary"
              >
                Practice
              </button>
              <button
                type="button"
                disabled={!runnable}
                onClick={() => onRun(test, 'test')}
                className="btn btn-quiet"
              >
                Test
              </button>
              <button type="button" onClick={() => onEdit(test)} className="btn btn-quiet">
                Edit
              </button>
              <button type="button" onClick={() => onRename(test)} className="btn btn-quiet">
                Rename
              </button>
              {/*
                Never disabled, even for a test that cannot run. A broken test is not
                auto-deleted (FR-17), so this is the only way to clear one out.
              */}
              <button type="button" onClick={() => onDelete(test)} className="btn btn-quiet">
                Delete
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
