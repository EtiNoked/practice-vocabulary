import type { LangCode } from '../lang/languages'
import type { LangSource } from '../parse/types'

export interface WordPair {
  id: string
  col1: string
  col2: string
}

export interface WordList {
  id: string
  name: string
  col1Lang: LangCode
  col2Lang: LangCode
  langSource: LangSource
  pairs: WordPair[]
  createdAt: number
  updatedAt: number
  /** How the list was created. v2 adds 'photo'. */
  origin: 'manual'
}

export type MarkResult = 'right' | 'wrong'

/**
 * How a drill is being run.
 *
 * `test` is 001's behaviour: shuffled, answer hidden, self-marked, scored.
 * `practice` is study: list order, word and answer both shown, no marking.
 *
 * A property of the RUN, not of the list — nothing mode-related is ever written
 * to a stored WordList, so listRepo's schema version stays untouched.
 *
 * NOT to be confused with `SessionRecord.mode` below, which is a different axis
 * entirely ('full' vs 'wrong-only' — which pairs the drill covered). The two are
 * orthogonal: only test-mode drills produce a SessionRecord at all.
 */
export type DrillMode = 'practice' | 'test'

export interface Session {
  mode: DrillMode
  listId: string
  /** A snapshot, not a reference — editing the source list cannot disturb a drill. */
  pairs: WordPair[]
  /** Pair ids in drill order: shuffled for test, list order for practice. */
  order: string[]
  index: number
  revealed: boolean
  /**
   * Practice mode's "answers are uncovered", for the whole run.
   *
   * NOT `revealed` above, and the distinction is the reason this is a second
   * field rather than a reuse. `revealed` is per CARD — test mode sets it with
   * REVEAL and `mark()` clears it on every advance. This is per RUN: opening the
   * answer on card 3 leaves it open on card 4, and only the user closes it again
   * (009 FR-4).
   *
   * Meaningless in test mode, where it stays false, exactly as `marks` stays
   * empty in practice.
   */
  answersOpen: boolean
  /**
   * Both stay at their initial values in practice mode rather than being split
   * off into a union member. `score()` on a practice session therefore reports
   * `total: 0`, which is correct and is never displayed.
   */
  marks: Record<string, MarkResult>
}

/**
 * An in-progress drill, parked in localStorage so a reload cannot lose it.
 *
 * The `list` is stored INSIDE the payload rather than referenced by id: a drill
 * has to survive its source list being deleted mid-run, exactly as the
 * in-memory pair snapshot already does (`session.ts`).
 */
export interface PersistedDrill {
  schemaVersion: number
  savedAt: number
  screen: 'practising'
  list: WordList
  session: Session
  /**
   * Which kind of test run is in flight, mirroring `SessionRecord.mode`.
   *
   * Persisted even though it lives outside `Session`, because it is the label
   * the finished drill gets logged under. Without it, reloading during a
   * wrong-only re-run would record that run as 'full' — flattering the average,
   * which is the one thing SessionRecord.mode exists to prevent.
   */
  runKind: SessionRecord['mode']
}

export interface Score {
  right: number
  wrong: number
  total: number
  pct: number
  wrongPairs: WordPair[]
}

/**
 * One finished drill, written when the app reaches the results screen.
 *
 * A log entry, not a document: nothing rewrites it after the fact, which the
 * security rules enforce with `allow update: if false`.
 */
export interface SessionRecord {
  id: string
  listId: string
  /**
   * Denormalised on purpose. History has to survive deleting the list, so the
   * name is captured at drill time rather than looked up later.
   */
  listName: string
  right: number
  wrong: number
  total: number
  pct: number
  /**
   * Snapshot of the missed pairs. Also the raw material for a future per-word
   * mastery feature — capturing it now avoids needing a backfill later.
   */
  wrongPairs: WordPair[]
  finishedAt: number
  /** A wrong-only re-run is real practice, but must not flatter the average. */
  mode: 'full' | 'wrong-only'
  /** True when the user quit before the last card. */
  partial: boolean
}
