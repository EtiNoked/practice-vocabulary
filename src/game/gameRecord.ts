import { scoreGame } from './scoring'
import type { Game, GameRecord, GameResult } from './types'
import type { MissSource } from '../state/missedWords'
import type { WordPair } from '../state/types'

/**
 * Shape a finished game into its log entry.
 *
 * Pure, and kept out of the reducer for the reason `buildSessionRecord` is: the reducer
 * must stay free of side effects, and the write itself belongs to whoever owns the store.
 * This is only the shaping step, so it stays unit-testable.
 *
 * Returns null when nothing was answered — an empty entry is noise, and it would put a
 * 0-of-0 game into a history the user never really played.
 */
export function buildGameRecord(
  game: Game,
  options: { partial: boolean; now?: number; id?: string },
): GameRecord | null {
  const score = scoreGame(game)
  if (score.asked === 0) return null

  const finishedAt = options.now ?? Date.now()

  /*
   * One result per ANSWERED question, paired with the question it answered.
   *
   * `answers` is filled left to right alongside `questions`, so index i of one belongs
   * to index i of the other — which is what makes a quit game line up correctly rather
   * than needing the answers to carry their own question back.
   */
  const results: GameResult[] = game.answers.map((a, i) => ({
    word: game.questions[i]!.word,
    correct: a.correct,
  }))

  /*
   * Only the lists actually ASKED about, in first-seen order — not `spec.listIds`.
   * A three-question game off a five-list pool may never touch three of them, and naming
   * a list the user was not tested on would misreport what they practised.
   */
  const listIds: string[] = []
  const listNames: string[] = []
  for (const { word } of results) {
    if (listIds.includes(word.listId)) continue
    listIds.push(word.listId)
    listNames.push(word.listName)
  }

  return {
    id: options.id ?? `${finishedAt}-${Math.random().toString(36).slice(2, 10)}`,
    finishedAt,
    listIds,
    listNames,
    source: game.settings.spec.source,
    correct: score.correct,
    asked: score.asked,
    points: score.points,
    available: score.available,
    results,
    partial: options.partial,
  }
}

/**
 * Project a game into the drill's world: one miss source per contributing list.
 *
 * This is the whole of 008 D-3 — a game's misses have to reach the same "words you got
 * wrong" pool the drill fills, or the game teaches the rest of the app nothing. A game
 * spans lists where a `SessionRecord` covers one, so rather than bending that type (or
 * writing a second still-missed rule), a game splits itself into the structural minimum
 * `collectMissed` reads and arrives there indistinguishable from a drill.
 *
 * `rightPairs` is ALWAYS defined, never omitted. Absent means "recorded before right
 * answers were saved" to 006, which would raise the `degraded` warning on a screen where
 * it is simply false. It is also what lets a correct answer CLEAR a word again (008 D-10)
 * rather than the missed pool only ever growing.
 *
 * Returns [] for a record whose `results` were shed under storage pressure: the score
 * survives, the detail does not, and there is nothing to file.
 */
export function gameMissSources(record: GameRecord): MissSource[] {
  const byList = new Map<string, { wrongPairs: WordPair[]; rightPairs: WordPair[] }>()

  for (const { word, correct } of record.results ?? []) {
    const entry = byList.get(word.listId) ?? { wrongPairs: [], rightPairs: [] }
    const pair: WordPair = { id: word.id, col1: word.col1, col2: word.col2 }
    if (correct) entry.rightPairs.push(pair)
    else entry.wrongPairs.push(pair)
    byList.set(word.listId, entry)
  }

  return [...byList.entries()].map(([listId, pairs]) => ({
    listId,
    // Every source shares the game's instant, so ordering against drill records — which
    // is how "most recent verdict wins" works — stays coherent.
    finishedAt: record.finishedAt,
    ...pairs,
  }))
}

/**
 * What a finished round is called.
 *
 * Beside the record rather than inside a component because two surfaces name rounds — the
 * game log and the home brief — and two independent answers to "what is a two-list game
 * called" would drift apart with nothing to catch it.
 *
 * The rule is `runLabel`'s, deliberately: one list by name, otherwise a count, so the game
 * log and the practice log read the same way.
 *
 * DISTINCT names, because `listNames` mirrors `listIds` positionally and two chapters of
 * the same book can share a name.
 */
export function gameLabel(record: GameRecord): string {
  const unique = [...new Set(record.listNames)]
  return unique.length === 1 ? unique[0]! : `${unique.length} lists`
}
