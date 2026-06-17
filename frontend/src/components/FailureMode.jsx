import React from 'react';
import { AlertCircle, Clock, ShieldAlert } from 'lucide-react';

function FailureMode({ failureModes }) {
  const getSeverityStyle = (severity) => {
    if (severity === 'critical') return 'bg-red-500/10 text-red-400 border-red-500/25';
    if (severity === 'high') return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
    return 'bg-blue-500/10 text-blue-400 border-blue-500/25';
  };

  const getMatchBarColor = (pct) => {
    if (pct >= 80) return 'bg-red-500';
    if (pct >= 60) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  if (!failureModes || failureModes.length === 0) {
    return (
      <div className="bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-2xl p-5 flex flex-col justify-center items-center h-full text-slate-500">
        <AlertCircle className="w-8 h-8 opacity-20 mb-2" />
        <span className="text-xs">No issues detected</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-2xl p-4 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-slate-400 flex items-center gap-1.5 mb-3">
        <ShieldAlert className="w-4 h-4 text-blue-400" />
        Detected Issues
      </h3>

      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {failureModes.map((fm) => (
          <div key={fm.failure_mode} className="bg-slate-950/40 border border-white/5 rounded-xl p-3">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="text-sm font-bold text-white leading-none">{fm.display_name}</h4>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 border rounded-full ${getSeverityStyle(fm.severity)}`}>
                    {fm.severity}
                  </span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {fm.estimated_repair_hours} hrs to repair
                  </span>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-300">{fm.match_percentage}% Match</span>
            </div>

            {/* Pattern match progress bar */}
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2.5">
              <div 
                className={`h-full transition-all duration-500 ${getMatchBarColor(fm.match_percentage)}`}
                style={{ width: `${fm.match_percentage}%` }}
              ></div>
            </div>

            <div className="text-xs text-slate-400 bg-slate-900/50 border border-white/5 border-l-4 border-l-cyan-500/60 rounded-lg p-3 font-mono">
              <span className="font-bold text-slate-300">Action:</span> {fm.recommended_action}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default React.memo(FailureMode, (prevProps, nextProps) => {
  return JSON.stringify(prevProps.failureModes) === JSON.stringify(nextProps.failureModes);
});
