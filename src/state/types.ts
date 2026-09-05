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

export interface Session {
  listId: string
  /** A snapshot, not a reference — editing the source list cannot disturb a drill. */
  pairs: WordPair[]
  /** Shuffled pair ids. */
  order: string[]
  index: number
  revealed: boolean
  marks: Record<string, MarkResult>
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
