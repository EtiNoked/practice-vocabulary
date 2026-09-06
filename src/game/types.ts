import type { LangCode } from '../lang/languages'
import type { PoolSpec, PooledWord } from '../state/wordPool'

/**
 * How long one word is on the clock. The ask: "you have 10 seconds for a word".
 */
export const QUESTION_MS = 10_000

/**
 * The most a single word can be worth — and necessarily `QUESTION_MS / 1000`, since the
 * score IS the countdown. scoring.test.ts asserts the two cannot drift apart.
 */
export const MAX_POINTS = 10

/**
 * Words per cloud: the answer plus distractors — or the whole pool, when it has fewer.
 *
 * A CEILING, not a promise. `buildQuestions` fills the cloud to `min(CLOUD_SIZE, what
 * the pool can distinctly supply)`, so a small pool simply yields a smaller cloud and
 * an easier question. It never pads to reach this number: a short cloud is an easy
 * question, a repeated word is a broken one.
 *
 * Ten rather than six drops a blind guess from ~17% to ~10%, so the score reflects
 * knowing rather than luck. The cost is real and lands entirely on the clock: ten words
 * is nearly twice as much to read inside the same ten seconds, and on a narrow phone
 * that is several more rows to scan. If a round starts feeling like a search rather
 * than a recall, this is the number to move.
 */
export const CLOUD_SIZE = 10

/** Below this a cloud is a coin toss rather than a question. */
export const MIN_POOL = 4

/** 50 x 10s is about eight minutes, and it bounds what one GameRecord can weigh. */
export const MAX_GAME_WORDS = 50

/** The offered lengths. Anything else goes through the number box (008 D-2). */
export const COUNT_CHIPS: readonly number[] = [10, 15, 20]

/** How long a verdict stays up before the game moves on. Long enough to read. */
export const VERDICT_MS = 800

/**
 * What the user chose at setup, carried by the Game so a replay can repeat it (008 D-9).
 *
 * WHICH words is delegated to a PoolSpec rather than spelled out here (008 D-13): this
 * type owns "how many, and in what language", never "which words does this select".
 * Adding a misses window later is then a change to PoolSpec alone, and every other
 * caller of the shared module gets it at the same moment.
 */
export interface GameSettings {
  readonly spec: PoolSpec
  /** How many questions to ask. Already clamped to the pool when the game was built. */
  readonly count: number
  /** Fixed by the first list selected. Both are needed: one to speak, one to label. */
  readonly col1Lang: LangCode
  readonly col2Lang: LangCode
}

/**
 * One question.
 *
 * `kind` is here so a second round type — hear-and-spell, read-and-pick — is an added
 * member rather than a refactor of everything that reads a Question. Only one is built.
 */
export interface Question {
  readonly kind: 'hear-pick-meaning'
  readonly word: PooledWord
  /** The tiles, already shuffled, always containing `word`. min(CLOUD_SIZE, pool). */
  readonly options: readonly PooledWord[]
}

export interface Answer {
  /** The tile tapped, or null when the clock ran out. */
  readonly choiceId: string | null
  readonly correct: boolean
  /** 0 … MAX_POINTS, and always 0 unless `correct`. */
  readonly points: number
  /** What was left on the clock. Kept for an honest average-speed stat later. */
  readonly remainingMs: number
}

/**
 * What the screen shows between answering a word and moving to the next.
 *
 * `timeout` is a separate member rather than a wrong answer with a null choice, because
 * the two differ in something that matters: a timeout has no user gesture behind it, so
 * it must not auto-advance (008 FR-20, and see GameCloud for why that is a correctness
 * rule and not a stylistic one).
 */
export type Verdict =
  | { readonly kind: 'right'; readonly points: number }
  | { readonly kind: 'wrong'; readonly chose: PooledWord; readonly answer: PooledWord }
  | { readonly kind: 'timeout'; readonly answer: PooledWord }

/**
 * A game in flight.
 *
 * `pool` is a SNAPSHOT, carried for one reason: replay re-samples from it (008 D-9).
 * Without it "play again" would have to reach for the live lists, and a pool the user
 * was shown a count for would silently change under them when another tab edited a list.
 * Same discipline as `Session.pairs`.
 */
export interface Game {
  readonly settings: GameSettings
  readonly pool: readonly PooledWord[]
  readonly questions: readonly Question[]
  readonly index: number
  /** Filled left to right. Its length is how many questions were answered. */
  readonly answers: readonly Answer[]
  /** Set once the current question is answered, cleared by `advance`. */
  readonly verdict: Verdict | null
}

export interface GameScore {
  readonly correct: number
  readonly asked: number
  readonly points: number
  /** `asked * MAX_POINTS` — what a perfect, instant round would have scored. */
  readonly available: number
}

/**
 * One finished game, written when the results screen is reached.
 *
 * Its OWN type and its own collection, never a SessionRecord (008 D-7). A game spans
 * several lists where `SessionRecord.listId` is one string, and an auto-marked score is
 * not comparable with a self-marked one — letting the two into one average would quietly
 * corrupt the number 001 has been showing since the beginning.
 *
 * A log entry, not a document: nothing rewrites it, which firestore.rules enforces with
 * `allow update: if false`.
 */
export interface GameRecord {
  readonly id: string
  readonly finishedAt: number
  /** Denormalised for the same reason SessionRecord.listName is: lists get deleted. */
  readonly listIds: readonly string[]
  readonly listNames: readonly string[]
  readonly source: PoolSpec['source']
  readonly correct: number
  readonly asked: number
  readonly points: number
  readonly available: number
  /**
   * Every answered word with its verdict and its origin list — the raw material for
   * feeding the drill's missed-words pool (008 FR-29).
   *
   * OPTIONAL, and absent means the detail was shed under storage pressure, never "nothing
   * was answered". `gameMissSources` returns [] for such a record rather than throwing.
   */
  readonly results?: readonly GameResult[]
  /** True when the user quit before the last question. */
  readonly partial: boolean
}

export interface GameResult {
  readonly word: PooledWord
  readonly correct: boolean
}
