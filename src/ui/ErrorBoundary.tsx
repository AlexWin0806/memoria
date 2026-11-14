import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearSavedData } from '@/state/storage';

interface State {
  failed: boolean;
  /** "Reset saved data" was pressed: ask before deleting anything. */
  asking: boolean;
}

/**
 * The last line of defence: whatever goes wrong while the app draws, the learner gets a
 * page with a way out instead of a blank one. It is styled from src/index.css alone and
 * reads no store, because the stores or the theme may be what failed.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, asking: false };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Memoria stopped drawing:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const reload = () => location.reload();
    const reset = () => {
      clearSavedData();
      location.reload();
    };
    return (
      <main className="fault" role="alert" data-testid="fault">
        <h1 className="fault__name">Memoria</h1>
        <p className="fault__what">Something went wrong while this page was being drawn, and it had to stop.</p>
        <p className="fault__how">
          Reloading usually brings it back, and your palaces are kept. If it does not, the saved data on this device may be the cause.
        </p>
        {this.state.asking ? (
          <div className="fault__ask" data-testid="fault-ask">
            <p>This deletes the palaces, review history, drafts and settings saved in this browser. It cannot be undone.</p>
            <div className="fault__actions">
              <button type="button" className="fault__btn" autoFocus onClick={() => this.setState({ asking: false })} data-testid="fault-reset-no">
                Keep my data
              </button>
              <button type="button" className="fault__btn fault__btn--danger" onClick={reset} data-testid="fault-reset-yes">
                Delete it and reload
              </button>
            </div>
          </div>
        ) : (
          <div className="fault__actions">
            <button type="button" className="fault__btn fault__btn--primary" autoFocus onClick={reload} data-testid="fault-reload">
              Reload
            </button>
            <button type="button" className="fault__btn" onClick={() => this.setState({ asking: true })} data-testid="fault-reset">
              Reset saved data and reload
            </button>
          </div>
        )}
      </main>
    );
  }
}
