import type { GameRecord } from '../../game/types'
import type { SessionRecord, WordList, WordPair } from '../../state/types'

/**
 * Builders for the three shapes nearly every suite needs: a list, a drill record and a
 * game record.
 *
 * THE SHAPE LIVES HERE; the flavour stays in the suite. Thirty-odd test files each carried
 * their own copy of these literals under eight different names (`makeList`, `list`,
 * `aList`, `baseList`, `rec`, `record`, …), which meant adding one field to `WordList` was
 * thirty-odd edits and the copies had already drifted apart on their defaults. A suite that
 * wants different defaults still says so — it just spreads them over these rather than
 * restating all nine keys.
 *
 * Every builder takes a `Partial` and spreads it LAST, so a test overrides exactly the
 * field it has an opinion about and nothing else. The defaults themselves are deliberately
 * boring and deliberately not meaningful: a test that depends on `name` being 'Lesson 3'
 * should say so at its own call site.
 */

/** A pair, positionally — `col2` is the word being learnt, `col1` its meaning (017). */
export const pair = (id: string, col1: string, col2: string): WordPair => ({ id, col1, col2 })

export const makeList = (over: Partial<WordList> = {}): WordList => ({
  id: 'a',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [pair('p1', 'daughter', 'dochter')],
  createdAt: 1000,
  updatedAt: 1000,
  origin: 'manual',
  ...over,
})

/**
 * A finished drill, as history stores it.
 *
 * `rightPairs` is absent by default, not empty: absent means "recorded before right
 * answers were kept", which is a real and distinct state the review screens render
 * differently. A suite that wants the other one passes `rightPairs: []`.
 */
export const makeRecord = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1',
  listId: 'a',
  listName: 'Lesson 3',
  right: 1,
  wrong: 0,
  total: 1,
  pct: 100,
  wrongPairs: [],
  finishedAt: 2000,
  mode: 'full',
  partial: false,
  ...over,
})

/**
 * A finished game.
 *
 * `results` is absent by default for the same reason `rightPairs` is above: absent means
 * the per-word detail was shed under storage pressure, which is a state `gameMissSources`
 * and the history screens handle on purpose. A suite that wants "played, nothing to
 * report" passes `results: []`.
 */
export const makeGameRecord = (over: Partial<GameRecord> = {}): GameRecord => ({
  id: 'g1',
  finishedAt: 1000,
  listIds: ['l1'],
  listNames: ['Food'],
  source: 'all',
  correct: 7,
  asked: 10,
  points: 52,
  available: 100,
  partial: false,
  ...over,
})
