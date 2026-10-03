import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Short description of what crashed, e.g. "The 3D view". */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one crashing component (a bad model, a WebGL context loss, …) from
 * taking the whole app down. "Try again" re-renders the subtree; the model in
 * the store is untouched.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error boundary caught an error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-3 overflow-auto p-6 text-center">
        <h2 className="text-base font-semibold text-neutral-200">
          {this.props.label ?? "This view"} stopped working
        </h2>
        <p className="max-w-md text-xs leading-5 text-neutral-400">
          Your model is still in memory. Try again, or keep working in the other panels.
        </p>
        <pre className="max-h-40 max-w-full overflow-auto rounded border border-border bg-panel p-3 text-left text-[11px] text-red-300">
          {error.message}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-black transition-[filter] hover:brightness-110"
        >
          Try again
        </button>
      </div>
    );
  }
}
