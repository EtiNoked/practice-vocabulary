import type { SessionRecord } from './types'

/**
 * One run, as history should show it.
 *
 * A run can write several records — one per list it drew from (011 D-3) — and every
 * surface that shows history has to fold them back together, or one fifteen-word test
 * appears three times and drags the average around three times with it. That failure is
 * silent and entirely plausible-looking, which is why the folding lives in one place
 * with an invariant guarding it rather than being done at each call site.
 *
 * Satisfies `Pick<SessionRecord, 'right' | 'total' | 'pct'>` ON PURPOSE, so `scoreBand`
 * and `bandBorder` take a group unchanged — the same structural trick that let
 * `DrillSubject` widen the drill cards for free.
 */
export interface RunGroup {
  /** The group key: the shared `runId`, or the lone record's own id. */
  readonly id: string
  /** In the order given, which is the order the lists were picked in. */
  readonly records: readonly SessionRecord[]
  /** The newest part's. Parts of one run share an instant in practice, but not by rule. */
  readonly finishedAt: number
  readonly listNames: readonly string[]
  readonly right: number
  readonly wrong: number
  readonly total: number
  /** Recomputed from the SUMS — see below. Never an average of the parts. */
  readonly pct: number
  /** 'wrong-only' only when every part is: one full part makes the run a full one. */
  readonly mode: SessionRecord['mode']
  /** True when any part is: the run stopped early, whatever the other parts say. */
  readonly partial: boolean
}

/**
 * The group key.
 *
 * `runId ?? id`, and that fallback is the whole reason this feature needed no migration:
 * every record ever written before 011 has no `runId`, so it is a group of one, keyed by
 * itself. Absent means "this record IS the run" — never "unknown" — which is what makes
 * this a complete rule rather than a guess with a hole in it (011 D-4).
 *
 * The ONLY place `runId` is read. `test/invariants.test.ts` fails the build if a second
 * reader appears, because a second grouping rule is how double counting gets in.
 */
export function groupKey(record: SessionRecord): string {
  return record.runId ?? record.id
}

/**
 * Fold records into runs, newest first.
 *
 * Pure and total: an empty history gives an empty array, and a zero-total group scores 0
 * rather than dividing by it.
 */
export function groupRuns(records: readonly SessionRecord[]): RunGroup[] {
  // A Map preserves insertion order, which is what keeps the parts of a run in the order
  // the user picked the lists in without needing a rule of its own.
  const byKey = new Map<string, SessionRecord[]>()
  for (const record of records) {
    const key = groupKey(record)
    const bucket = byKey.get(key)
    if (bucket) bucket.push(record)
    else byKey.set(key, [record])
  }

  const groups: RunGroup[] = []
  for (const [id, parts] of byKey) {
    const right = parts.reduce((sum, r) => sum + r.right, 0)
    const wrong = parts.reduce((sum, r) => sum + r.wrong, 0)
    const total = parts.reduce((sum, r) => sum + r.total, 0)
    groups.push({
      id,
      records: parts,
      finishedAt: Math.max(...parts.map((r) => r.finishedAt)),
      listNames: parts.map((r) => r.listName),
      right,
      wrong,
      total,
      /*
       * A group of one keeps the percentage its record was WRITTEN with; a real run
       * computes one from the sums.
       *
       * The first half is what makes 011 D-4's promise literal — every record ever
       * written is a group of one and displays exactly what it always displayed, with no
       * second source of truth for a number already stored. (The two agree for any record
       * this app wrote; they differ only for a hand-edited or fixture record, and there
       * the stored value is the one the user has been looking at.)
       *
       * The second half is SUMMED, then rounded — never the average of the parts'
       * percentages. Averaging would weight a two-word list exactly like a twelve-word
       * one: a run of 1/2 and 9/10 is 10 of 12, which is 83%, where the average of 50 and
       * 90 says 70. The same reasoning that makes `score()` partition over the pairs
       * rather than over the shuffle.
       */
      pct: parts.length === 1 ? parts[0]!.pct : total === 0 ? 0 : Math.round((right / total) * 100),
      mode: parts.every((r) => r.mode === 'wrong-only') ? 'wrong-only' : 'full',
      partial: parts.some((r) => r.partial),
    })
  }

  return groups.sort((a, b) => b.finishedAt - a.finishedAt)
}

/**
 * What to call a run in a history row.
 *
 * Shared by the home log and the review screen deliberately: the same run named two ways
 * on two screens reads as two different runs. The rule matches `poolSubject`'s — one list
 * is named by the list, several are named for what they are — so a test called "3 lists"
 * while it runs is still "3 lists" in the history afterwards.
 */
export function runLabel(group: RunGroup): string {
  const unique = [...new Set(group.listNames)]
  return unique.length === 1 ? unique[0]! : `${unique.length} lists`
}
