import { useState } from 'react'
import type { MigrationResult } from '../storage/migrate'

interface Props {
  /** How many lists are on this device and would be copied. */
  count: number
  onCopy: () => Promise<MigrationResult>
  onDismiss: () => void
}

/**
 * Offers to copy this device's lists into the account that just signed in.
 *
 * Opt-in, never silent (Story 3). The count is stated up front so the user knows
 * exactly what they are agreeing to, and declining leaves the device untouched.
 */
export function MigratePrompt({ count, onCopy, onDismiss }: Props) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MigrationResult | null>(null)

  if (count === 0) return null

  const noun = count === 1 ? 'list' : 'lists'

  if (result && result.failed.length > 0) {
    return (
      <section
        role="alert"
        className="rounded-lg border border-amber-400 bg-amber-50 p-3 dark:border-amber-600 dark:bg-amber-900/30"
      >
        <p className="text-sm">
          Copied {result.copied} of {count} {noun}. {result.failed.length} didn&rsquo;t make it —
          you may have lost connection.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              // Safe to re-run: ids are preserved, so this finishes the job
              // rather than duplicating what already arrived.
              setResult(await onCopy())
              setBusy(false)
            }}
            className="min-h-11 rounded bg-emerald-700 px-3 text-white disabled:opacity-60"
          >
            {busy ? 'Copying…' : 'Try again'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-11 rounded border border-slate-300 px-3 dark:border-slate-600"
          >
            Not now
          </button>
        </div>
      </section>
    )
  }

  if (result) return null

  return (
    <section className="rounded-lg border border-slate-300 p-3 dark:border-slate-600">
      <p className="text-sm">
        You have {count} {noun} saved on this device. Copy {count === 1 ? 'it' : 'them'} to your
        account so you can use {count === 1 ? 'it' : 'them'} on your other devices?
      </p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {count === 1 ? 'It stays' : 'They stay'} on this device either way.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const outcome = await onCopy()
            setResult(outcome)
            setBusy(false)
          }}
          className="min-h-11 rounded bg-emerald-700 px-3 text-white disabled:opacity-60"
        >
          {busy ? 'Copying…' : `Copy to my account`}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 rounded border border-slate-300 px-3 dark:border-slate-600"
        >
          Not now
        </button>
      </div>
    </section>
  )
}
