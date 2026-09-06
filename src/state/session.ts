import type { DrillMode, MarkResult, Score, Session, WordPair } from './types'

/** A random source in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number

/**
 * Small deterministic PRNG (mulberry32). Used by tests and by "shuffle & restart",
 * which wants a fresh order each time but no cryptographic quality.
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randomRng: Rng = Math.random

/** Fisher-Yates. Returns a new array; never mutates the input. */
function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = out[i]!
    const b = out[j]!
    out[i] = b
    out[j] = a
  }
  return out
}

/**
 * Start a drill over `pairs`.
 *
 * The pairs are copied rather than referenced: a session must survive its source
 * list being edited or deleted while the drill is running.
 *
 * `mode` decides the ordering, and nothing else here: test shuffles, practice
 * keeps the order the list was written in (spec A3). `rng` stays in the
 * signature for both — it is simply unused for practice — so that callers can
 * stay mode-agnostic rather than each having to know which arguments apply.
 *
 * Defaults to 'test' because that is 001's behaviour, which every call site
 * predating modes was written to expect.
 */
export function createSession(
  pairs: readonly WordPair[],
  rng: Rng,
  listId = '',
  mode: DrillMode = 'test',
): Session {
  const ids = pairs.map((p) => p.id)
  return {
    mode,
    listId,
    pairs: pairs.map((p) => ({ ...p })),
    order: mode === 'test' ? shuffle(ids, rng) : ids,
    index: 0,
    revealed: false,
    marks: {},
  }
}

export function currentPair(session: Session): WordPair | null {
  const id = session.order[session.index]
  if (id === undefined) return null
  return session.pairs.find((p) => p.id === id) ?? null
}

export function isFinished(session: Session): boolean {
  return session.index >= session.order.length
}

export function reveal(session: Session): Session {
  return { ...session, revealed: true }
}

/**
 * Move to the next card without recording anything — practice mode's advance.
 *
 * Not clamped: stepping past the last card leaves `index === order.length`,
 * which `isFinished` already recognises. Clamping would make a completed
 * practice run indistinguishable from resting on the final card, and there
 * would be no way to reach the results screen.
 */
export function nextCard(session: Session): Session {
  return { ...session, index: session.index + 1, revealed: false }
}

/** Move back one card, floored at the first. Practice mode only. */
export function prevCard(session: Session): Session {
  return { ...session, index: Math.max(0, session.index - 1), revealed: false }
}

/** Record a result for the current card and advance. */
export function mark(session: Session, result: MarkResult): Session {
  const id = session.order[session.index]
  if (id === undefined) return session
  return {
    ...session,
    marks: { ...session.marks, [id]: result },
    index: session.index + 1,
    revealed: false,
  }
}

/**
 * Score what has been answered so far. `total` counts marked cards, not the whole
 * list, so quitting early still yields a meaningful score.
 */
export function score(session: Session): Score {
  const marked = Object.entries(session.marks)
  const right = marked.filter(([, r]) => r === 'right').length
  const wrong = marked.length - right
  // Sets, not arrays: score() now walks the pairs twice, and a 500-word list
  // makes the O(n^2) of a repeated `includes` measurable.
  const wrongIds = new Set(marked.filter(([, r]) => r === 'wrong').map(([id]) => id))
  const rightIds = new Set(marked.filter(([, r]) => r === 'right').map(([id]) => id))
  return {
    right,
    wrong,
    total: marked.length,
    pct: marked.length === 0 ? 0 : Math.round((right / marked.length) * 100),
    /*
     * Both partitioned over `session.pairs`, so they come back in the LIST's
     * order rather than the shuffle's. The review screen reads them top to
     * bottom, and a drill's dealing order means nothing to the person reading it.
     */
    wrongPairs: session.pairs.filter((p) => wrongIds.has(p.id)),
    rightPairs: session.pairs.filter((p) => rightIds.has(p.id)),
  }
}

/**
 * Run the same pairs again.
 *
 * The mode carries through, which is why this is not literally "shuffled" for a
 * practice session: the mode owns the ordering rule, so a practice re-run is
 * still list order. Renaming it is left alone deliberately — it is 001's public
 * name and the action that drives it.
 */
export function restartShuffled(session: Session, rng: Rng): Session {
  return createSession(session.pairs, rng, session.listId, session.mode)
}

/** A fresh drill over only the pairs missed in `session`. */
export function restartWrongOnly(session: Session, rng: Rng): Session {
  return createSession(score(session).wrongPairs, rng, session.listId, session.mode)
}

/**
 * The mode a "switch to the other mode" action lands on.
 *
 * Deliberately just this, and not a `switchMode(session)` that builds the new
 * session: the switch must start from the LIST's pairs, not the finished
 * session's, or switching mode after a wrong-only re-run would quietly drop
 * every pair the user got right. Only the caller holds the list.
 */
export function otherMode(mode: DrillMode): DrillMode {
  return mode === 'test' ? 'practice' : 'test'
}
