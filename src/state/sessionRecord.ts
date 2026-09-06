import { runFromList, type DrillRun } from './drillRun'
import { score } from './session'
import type { Session, SessionRecord, WordList, WordPair } from './types'

/**
 * Above this many right answers, a record stores its misses only.
 *
 * A record is a log entry, not an archive. 300 right answers is already a longer
 * drill than this app is built for, and the cap is what stops MAX_RECORDS (200)
 * multiplied by a 500-word list from turning history into megabytes of
 * localStorage. The misses are never capped — they are the half a re-drill is
 * built from.
 */
export const MAX_RIGHT_PAIRS = 300

/**
 * Build the log entry for a finished drill.
 *
 * A pure function, kept OUT of appMachine.ts on purpose: the reducer must stay
 * free of side effects, and the write itself belongs to the component that owns
 * the store. This is just the shaping step, so it stays unit-testable.
 *
 * Returns null when nothing was answered — an empty log entry is noise, and it
 * would drag a user's average around for a drill they never really took.
 */
export function buildSessionRecord(
  list: WordList,
  session: Session,
  options: { mode: SessionRecord['mode']; partial: boolean; now?: number; id?: string },
): SessionRecord | null {
  /*
   * The ONE-LIST case of `buildRunRecords`, not a second implementation of it.
   *
   * Kept because 002, 006 and 008 all call it, and because its existing suite is the
   * proof that splitting a run into per-list records did not change what a plain drill
   * stores. If that suite goes red, the split is wrong.
   *
   * `session.pairs` rather than `list.pairs`: after a wrong-only re-run the session holds
   * only the pairs it drilled, and those are the ones being recorded.
   */
  return buildRunRecords(runFromList(list, session.pairs), session, options)[0] ?? null
}

/** A freshly minted record id. Kept in one place so both builders below read the same. */
function mintId(finishedAt: number): string {
  return `${finishedAt}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * The log entries for a finished run — ONE PER CONTRIBUTING LIST (011 D-3).
 *
 * A run can span several lists where `SessionRecord.listId` is one string. Rather than
 * widen that field — and with it `collectMissed`, the review screen's filter, the
 * Firestore query and the security rules — a run SPLITS itself into the records those
 * readers already understand. The same move `gameMissSources` makes for a game, one
 * layer earlier: project into the shape the engine reads rather than teaching the engine
 * a second shape.
 *
 * `runId` is written ONLY when there is more than one record. A single-list drill
 * therefore stores exactly what it has stored since 001, key for key — which is what
 * makes the existing history suites the regression net for this whole change, and what
 * makes `runId ?? id` a complete grouping rule (see `runGroup.ts`).
 *
 * Pure, and kept OUT of the reducer for the reason `buildSessionRecord` always was: the
 * reducer must stay free of side effects, and the write belongs to whoever owns the
 * store. This is only the shaping step.
 *
 * Returns [] when nothing was answered — an empty entry is noise, and it would drag the
 * average around for a drill nobody really took.
 */
export function buildRunRecords(
  run: DrillRun,
  session: Session,
  options: {
    mode: SessionRecord['mode']
    partial: boolean
    now?: number
    /** The id for the FIRST record. Injected so a test can pin it; minted otherwise. */
    id?: string
    /** Shared by every record when there is more than one. Minted otherwise. */
    runId?: string
  },
): SessionRecord[] {
  const result = score(session)
  if (result.total === 0) return []

  const finishedAt = options.now ?? Date.now()

  interface Group {
    listId: string
    listName: string
    wrongPairs: WordPair[]
    rightPairs: WordPair[]
  }

  /*
   * Seeded by walking `run.words`, NOT by walking the answers.
   *
   * `run.words` is in pool order, which is the order the user picked the lists in, so the
   * records come out in that order too. Seeding from the answers instead would order them
   * by whichever list happened to contain the first wrong answer.
   */
  const groups: Group[] = []
  const byList = new Map<string, Group>()
  for (const word of run.words) {
    if (byList.has(word.listId)) continue
    const group: Group = {
      listId: word.listId,
      // Denormalised at drill time, exactly as it always has been: history has to still
      // read sensibly after the list is renamed or deleted.
      listName: word.listName,
      wrongPairs: [],
      rightPairs: [],
    }
    byList.set(word.listId, group)
    groups.push(group)
  }

  /*
   * Origin by pair ID, not by text.
   *
   * `wordKey` is for comparing words ACROSS records; using it here would fold two lists
   * that legitimately share a word into one group, when the pool has already decided
   * which list owns it. Ids are safe precisely here: `createSession` copies pairs and
   * both re-runs preserve them, so the map stays correct for every re-run of this run.
   */
  const origin = new Map(run.words.map((w) => [w.id, w] as const))
  const file = (pairs: readonly WordPair[], into: (g: Group) => WordPair[]) => {
    for (const pair of pairs) {
      const word = origin.get(pair.id)
      // Cannot happen: the session was built from these words. Dropped rather than
      // thrown on, because every reader in this codebase degrades rather than throws.
      if (!word) continue
      const group = byList.get(word.listId)
      if (group) into(group).push(pair)
    }
  }
  file(result.wrongPairs, (g) => g.wrongPairs)
  file(result.rightPairs, (g) => g.rightPairs)

  // A list nobody reached is not part of this run's history.
  const answered = groups.filter((g) => g.wrongPairs.length + g.rightPairs.length > 0)

  // One record is its own run, so there is nothing to point at and no field to write.
  const runId = answered.length > 1 ? (options.runId ?? mintId(finishedAt)) : null

  return answered.map((group, i) => {
    const right = group.rightPairs.length
    const total = right + group.wrongPairs.length
    return {
      id: i === 0 && options.id !== undefined ? options.id : mintId(finishedAt),
      listId: group.listId,
      listName: group.listName,
      right,
      wrong: group.wrongPairs.length,
      total,
      // This list's OWN percentage. The run's is recomputed from the sums at grouping
      // time — averaging these would weight a two-word list like a twelve-word one.
      pct: total === 0 ? 0 : Math.round((right / total) * 100),
      wrongPairs: group.wrongPairs,
      // A CONDITIONAL SPREAD, not `rightPairs: undefined`: exactOptionalPropertyTypes is
      // on, and a present-but-undefined key would read back as "recorded, nothing right"
      // instead of "not recorded at all". The cap applies per record.
      ...(right <= MAX_RIGHT_PAIRS ? { rightPairs: group.rightPairs } : {}),
      finishedAt,
      // Same spread rule, same reason: absent means "this record IS the run".
      ...(runId !== null ? { runId } : {}),
      mode: options.mode,
      partial: options.partial,
    }
  })
}
