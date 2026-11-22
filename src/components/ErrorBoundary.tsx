import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('NOVA ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendly = `Database access error (${parsed.operationType || 'operation'}): ${parsed.error}`;
        }
      } catch {
        // non-JSON error
      }

      return (
        <div className="min-h-screen bg-[#060D1E] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#0D1B38] border border-rose-400/25 p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-300">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h1 className="font-display text-lg font-semibold">Something went wrong</h1>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-sm font-medium text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
