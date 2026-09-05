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
