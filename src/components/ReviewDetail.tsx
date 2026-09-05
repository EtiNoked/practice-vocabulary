import type { SessionRecord, WordList, WordPair } from '../state/types'

interface Props {
  /** Resolved at render time from the live records — null when it is gone. */
  record: SessionRecord | null
  /** The live list, when it still exists. Gates re-practising the misses. */
  list: WordList | null
  onPractiseMisses: () => void
  onBack: () => void
}

const formatWhen = (ms: number) =>
  `${new Date(ms).toLocaleDateString('en-GB')} · ${new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`

export function ReviewDetail({ record, list, onPractiseMisses, onBack }: Props) {
  const back = (
    <button type="button" onClick={onBack} className="min-h-11 rounded border border-line-strong">
      Back to review
    </button>
  )

  /*
   * The record can vanish under an open screen — account deletion, or history
   * trimmed under MAX_RECORDS. State holds the id rather than a copy precisely
   * so this is detectable instead of showing a stale drill forever.
   */
  if (!record) {
    return (
      <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
        <h1 className="text-2xl font-semibold">Review</h1>
        <p className="text-ink-muted">That drill is no longer available.</p>
        {back}
      </section>
    )
  }

  const misses = record.wrongPairs
  const deleted = list === null

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{record.listName}</h1>
        <p className="text-sm text-ink-muted">
          {formatWhen(record.finishedAt)}
          {record.mode === 'wrong-only' && ' · missed words only'}
          {record.partial && ' · stopped early'}
        </p>
      </header>

      <p className="text-3xl font-bold">
        {record.right} / {record.total}{' '}
        <span className="text-2xl font-normal text-ink-muted">({record.pct}%)</span>
      </p>

      {/* Wrong first: the misses are why anyone opens this screen. */}
      <WordSection title="Wrong" pairs={misses} glyph="✗" tone="text-incorrect" />

      {record.rightPairs === undefined ? (
        /*
         * Not an empty "Right (0)". Absent means the drill predates right-answer
         * recording — a gap in the data — while an empty array means the user
         * genuinely got none right. Conflating them would tell someone they
         * scored zero on a drill they may have aced.
         */
        <p className="rounded-lg bg-surface-sunken p-3 text-sm text-ink-muted">
          This drill was recorded before right answers were saved, so only the misses are listed.
        </p>
      ) : (
        <WordSection title="Right" pairs={record.rightPairs} glyph="✓" tone="text-correct" />
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onPractiseMisses}
          disabled={misses.length === 0 || deleted}
          className="btn btn-primary btn-lg"
        >
          Practise these {misses.length} missed {misses.length === 1 ? 'word' : 'words'}
        </button>
        {deleted && (
          <p className="text-sm text-ink-muted">
            This list has been deleted, so its words cannot be practised again.
          </p>
        )}
        {back}
      </div>
    </section>
  )
}

/**
 * One half of the answer sheet.
 *
 * The glyph is not decoration: colour must never be the sole carrier of meaning,
 * and forced-colors mode strips the tone class entirely.
 */
function WordSection({
  title,
  pairs,
  glyph,
  tone,
}: {
  title: string
  pairs: WordPair[]
  glyph: string
  tone: string
}) {
  return (
    <div>
      <h2 className="font-semibold">
        {title} ({pairs.length})
      </h2>
      {pairs.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">None.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {pairs.map((pair) => (
            <li
              key={pair.id}
              className="flex items-baseline justify-between gap-3 rounded bg-surface-sunken px-3 py-2"
            >
              <span>
                <span aria-hidden="true" className={`mr-2 ${tone}`}>
                  {glyph}
                </span>
                {pair.col2}
              </span>
              <span className="text-ink-muted">{pair.col1}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
