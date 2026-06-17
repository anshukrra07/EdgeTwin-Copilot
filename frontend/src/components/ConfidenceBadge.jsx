import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';

export default function ConfidenceBadge({ confidence, dataDrift }) {
  const [showDriftDetails, setShowDriftDetails] = useState(false);

  const getBadgeColor = (conf) => {
    if (conf >= 80) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (conf >= 50) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  };

  const isDrifted = dataDrift?.drift_detected ?? false;
  const driftScore = dataDrift?.drift_score ?? 0.0;

  return (
    <div className={`bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-2xl p-4 flex flex-col justify-between transition-all duration-300 card-hover ${showDriftDetails ? 'h-[230px] border-amber-500/25 shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'h-[150px]'}`}>
      <div>
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
          Prediction Confidence
        </span>
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-3xl font-black text-white">{confidence}%</span>
        <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 border rounded-full uppercase ${getBadgeColor(confidence)}`}>
          {confidence >= 80 ? 'High Confidence' : confidence >= 50 ? 'Moderate' : 'Unreliable'}
        </span>
      </div>

      <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-1.5">
        <div 
          className="h-full bg-cyan-500" 
          style={{ width: `${confidence}%` }}
        ></div>
      </div>

      {/* Data Drift Alert Integration */}
      <div className="mt-3 pt-3 border-t border-white/5 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isDrifted ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse animate-pulse-live" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            )}
            <span className={`text-[9px] font-mono font-bold uppercase tracking-wider ${isDrifted ? 'text-amber-400' : 'text-slate-400'}`}>
              {isDrifted ? 'Distribution Shift Detected' : 'Data Dist. Stable'}
            </span>
          </div>
          {dataDrift?.sensors && Object.keys(dataDrift.sensors).length > 0 && (
            <button
              onClick={() => setShowDriftDetails(!showDriftDetails)}
              className="text-[9px] font-mono font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 cursor-pointer"
            >
              {showDriftDetails ? 'HIDE' : 'DETAILS'} {showDriftDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {showDriftDetails && dataDrift?.sensors && (
          <div className="flex-1 overflow-y-auto space-y-1 mt-1 pr-1 max-h-[70px] scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {Object.entries(dataDrift.sensors).map(([sensorId, details]) => (
              <div key={sensorId} className="flex justify-between items-center text-[8px] font-mono text-slate-400 bg-slate-950/40 px-2 py-1 rounded border border-white/5">
                <span className="capitalize">{sensorId.replace('_', ' ')}</span>
                <span className={details.drift_detected ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                  Z-dev: {details.drift_score} {details.drift_detected ? '⚠' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
