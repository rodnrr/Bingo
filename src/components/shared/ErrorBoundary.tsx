import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Last line of defence. A render crash anywhere below this shows a
 * recoverable screen instead of a white page — which matters most on
 * the checkout return route, where a blank page reads as "my money
 * vanished".
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold">Something broke</h1>
        <p className="max-w-md text-sm text-fg-muted">
          The page hit an error it could not recover from. Reloading usually clears it. If you
          were in the middle of a purchase, check <strong>Purchases</strong> before trying again —
          the order may already exist.
        </p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
