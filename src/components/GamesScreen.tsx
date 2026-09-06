import type { ComponentProps } from 'react'
import { GameHistory } from './GameHistory'

type Props = ComponentProps<typeof GameHistory> & {
  onPlayGame: () => void
}

/**
 * My games.
 *
 * The one section that shows something the app has never shown before. `GameRecord`s have
 * been written since 008 and read back for exactly one purpose — feeding the drill's
 * missed-words pool — so a round the user played has been, until now, invisible to them
 * (012 D-3).
 *
 * Shaped on the other two sections so "My games" means what "My lists" and "My tests"
 * mean: a collection you own, with the verb that adds to it at the top.
 */
export function GamesScreen({ onPlayGame, ...historyProps }: Props) {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">My games</h1>

      <button type="button" onClick={onPlayGame} className="btn btn-primary btn-lg">
        Play a game
      </button>

      <GameHistory {...historyProps} />
    </section>
  )
}
