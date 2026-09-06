import type { ComponentProps } from 'react'
import { SavedTests } from './SavedTests'

type Props = ComponentProps<typeof SavedTests> & {
  onBuildTest: () => void
}

/**
 * My tests.
 *
 * Shaped on `ListsScreen`, because it is the same kind of thing in the same place — the
 * reason `SavedTests` was shaped on `SavedLists` in the first place. Two sections on one
 * menu that behaved differently would be the surprising choice.
 *
 * `count` travels straight through to `SavedTests`, which renders how many words each
 * test selects RIGHT NOW. Dropping it would leave a stale number on screen with no
 * visible symptom (011 NFR-4), which is why the test file pins it.
 */
export function TestsScreen({ onBuildTest, ...testProps }: Props) {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">My tests</h1>

      <button type="button" onClick={onBuildTest} className="btn btn-primary btn-lg">
        Build a test
      </button>

      <SavedTests {...testProps} />
    </section>
  )
}
