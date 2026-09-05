import type { MarkResult, Score, Session, WordPair } from './types'

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
 */
export function createSession(pairs: readonly WordPair[], rng: Rng, listId = ''): Session {
  return {
    listId,
    pairs: pairs.map((p) => ({ ...p })),
    order: shuffle(
      pairs.map((p) => p.id),
      rng,
    ),
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
  const wrongIds = marked.filter(([, r]) => r === 'wrong').map(([id]) => id)
  return {
    right,
    wrong,
    total: marked.length,
    pct: marked.length === 0 ? 0 : Math.round((right / marked.length) * 100),
    wrongPairs: session.pairs.filter((p) => wrongIds.includes(p.id)),
  }
}

export function restartShuffled(session: Session, rng: Rng): Session {
  return createSession(session.pairs, rng, session.listId)
}

/** A fresh drill over only the pairs missed in `session`. */
export function restartWrongOnly(session: Session, rng: Rng): Session {
  return createSession(score(session).wrongPairs, rng, session.listId)
}
