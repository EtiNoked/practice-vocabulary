import { foldText } from '../state/missedWords'
import { shuffle, type Rng } from '../state/session'
import type { PooledWord } from '../state/wordPool'
import { CLOUD_SIZE, type Question } from './types'

/**
 * Turn a pool into a round of questions.
 *
 * Sampling lives HERE and never in `wordPool` (008 NFR-11): "which words does this
 * setting select" and "take fifteen of them at random" are different questions, and the
 * shared selector has other callers who want all of them, or the oldest twenty, or them
 * in list order.
 *
 * `rng` is injected so a draw can be pinned in a test — and so `replay` can produce a
 * genuinely different round from the same pool by passing a fresh one.
 */
export function buildQuestions(
  pool: readonly PooledWord[],
  count: number,
  rng: Rng,
): Question[] {
  // Shuffle then slice: sampling WITHOUT replacement, so no word is asked twice.
  return shuffle(pool, rng)
    .slice(0, Math.max(0, Math.min(count, pool.length)))
    .map((word) => ({
      kind: 'hear-pick-meaning' as const,
      word,
      // Answer and distractors shuffled TOGETHER, or the answer would sit in slot 0
      // every time and the game could be played without listening to it.
      options: shuffle([word, ...pickDistractors(pool, word, rng)], rng),
    }))
}

/**
 * The wrong answers for one question.
 *
 * Candidates are excluded by what they DISPLAY, not by their id (008 FR-13). Two pool
 * entries can legitimately share a `col1` — "bank" the money place and "bank" the river
 * edge are two words with one English spelling — and offering both as tiles asks a
 * question with two answers that look right, one of which is then scored wrong. The user
 * has no way to know they were unlucky rather than mistaken.
 *
 * Returns FEWER than CLOUD_SIZE - 1 when the pool cannot supply distinct-looking options,
 * and never pads with a duplicate: a short cloud is an easy question, a repeated tile is
 * a broken one.
 */
export function pickDistractors(
  pool: readonly PooledWord[],
  answer: PooledWord,
  rng: Rng,
): PooledWord[] {
  const taken = new Set([foldText(answer.col1)])
  const out: PooledWord[] = []

  for (const candidate of shuffle(pool, rng)) {
    if (out.length >= CLOUD_SIZE - 1) break
    if (candidate.id === answer.id) continue
    const shown = foldText(candidate.col1)
    if (taken.has(shown)) continue
    taken.add(shown)
    out.push(candidate)
  }

  return out
}
