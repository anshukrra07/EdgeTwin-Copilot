import React from 'react';
import { Hourglass, Info } from 'lucide-react';

export default function RULIndicator({ rulDays, rulDaysLower = 24.0, rulDaysUpper = 36.0, method, trend }) {
  const getProgressColor = (days) => {
    if (days >= 14) return 'bg-emerald-500';
    if (days >= 3) return 'bg-amber-500';
    return 'bg-red-500 animate-pulse';
  };

  const getTextColor = (days) => {
    if (days >= 14) return 'text-emerald-400';
    if (days >= 3) return 'text-amber-400';
    return 'text-red-400';
  };

  // Math to get percentage out of 30 days max
  const pct = Math.min((rulDays / 30) * 100, 100);

  return (
    <div className="bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-2xl p-5 flex flex-col justify-between h-[130px]" aria-label="Remaining Useful Life Indicator">
      <div className="flex justify-between items-start">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Hourglass className="w-3.5 h-3.5 text-blue-400" />
          Time Until Service
        </h3>
        <span className={`text-xs font-bold ${getTextColor(rulDays)}`} aria-live="polite">
          {trend}
        </span>
      </div>

      <div className="my-2">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-3xl font-black text-white" aria-live="polite">{rulDays} Days</span>
          <span className="text-[10px] text-slate-500 font-mono" title="95% Confidence Interval">
            CI: [{rulDaysLower} - {rulDaysUpper}]d
          </span>
        </div>
        
        {/* RUL Bar */}
        <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
          <div 
            className={`h-full transition-all duration-1000 ease-out ${getProgressColor(rulDays)}`}
            style={{ width: `${pct}%` }}
          ></div>
        </div>
      </div>

      <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono">
        <Info className="w-3.5 h-3.5" />
        <span className="truncate">Method: <span className="text-slate-400" title={method}>{method || "Exponential Model"}</span></span>
      </div>
    </div>
  );
}
