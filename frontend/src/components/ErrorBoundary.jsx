import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Sleek fallback UI matching the dark glassmorphic styling
      return (
        <div className="glass rounded-2xl p-5 border border-red-500/20 bg-red-950/5 flex flex-col justify-center items-center text-center gap-3 h-full min-h-[140px]">
          <div className="bg-red-500/10 p-2.5 rounded-xl border border-red-500/20 text-red-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-mono tracking-wider text-red-400 font-bold uppercase">
              {this.props.title || "Widget Suspended"}
            </h3>
            <p className="text-[10px] text-slate-500 max-w-[220px] line-clamp-2 leading-relaxed">
              {this.state.error?.message || "An unexpected rendering error occurred."}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold font-mono rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 active:scale-95 transition-all duration-200"
          >
            <RefreshCw className="w-3 h-3" />
            RESET WIDGET
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
