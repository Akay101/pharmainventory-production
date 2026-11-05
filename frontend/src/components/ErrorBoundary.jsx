import { Component } from "react";

// A page that breaks while drawing shows this instead of a blank screen
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Page failed to draw", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div data-testid="error-boundary" className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-bold text-foreground">Something went wrong on this page</h1>
          <p className="mt-2 text-sm text-muted-foreground">Reload to carry on. If it happens again, contact support and tell them what you were doing.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold cursor-pointer"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
