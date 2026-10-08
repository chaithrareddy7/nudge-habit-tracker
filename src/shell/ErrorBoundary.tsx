import { Component, type ReactNode } from 'react'

// Keeps one broken screen from blanking the whole app. Data is untouched:
// everything is already saved locally, so reloading is always safe.

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Screen crashed:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card crash" role="alert">
        <h2>Something went wrong on this screen</h2>
        <p className="muted">Your data is safe — it’s saved on this device{' '}and synced if you’re signed in. Try again, or go back to Today.</p>
        <pre>{this.state.error.message}</pre>
        <div className="row wrap">
          <button className="btn primary" onClick={() => this.setState({ error: null })}>Try again</button>
          <a className="btn" href="/today">Go to Today</a>
          <button className="btn ghost" onClick={() => window.location.reload()}>Reload app</button>
        </div>
      </div>
    )
  }
}
