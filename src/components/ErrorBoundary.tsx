import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /**
   * Injected so the recovery path is testable — jsdom has no navigation. In the
   * app the default is what you want: a reload re-runs the restore in App's
   * useState initialiser, so an in-progress drill comes back rather than being
   * lost to the crash.
   */
  onReset?: () => void
}

interface State {
  message: string | null
}

/**
 * The last line of defence.
 *
 * Without one, any render-time throw unmounts the whole tree to a blank white
 * page — both a dead end for the user and a diagnostic dead end for exactly the
 * class of "the app just went away" report this feature exists to fix.
 *
 * A class component is not a style choice: React 19 still ships no hook
 * equivalent of componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The component stack is the part that actually locates the fault; the bare
    // message rarely does.
    console.error('Unhandled render error:', error, info.componentStack)
  }

  override render(): ReactNode {
    const { message } = this.state
    if (message === null) return this.props.children

    return (
      <main className="min-h-dvh bg-ground text-ink">
        <section role="alert" className="mx-auto flex max-w-xl flex-col gap-4 p-4">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-ink-muted">
            The app hit an error and stopped. Starting over reloads it — a drill in progress is
            saved, so you should land back on the card you were on.
          </p>
          <p className="rounded-lg bg-surface-sunken p-3 font-mono text-sm break-words">
            {message}
          </p>
          <button
            type="button"
            onClick={this.props.onReset ?? (() => window.location.reload())}
            className="btn btn-primary btn-lg"
          >
            Start over
          </button>
        </section>
      </main>
    )
  }
}
