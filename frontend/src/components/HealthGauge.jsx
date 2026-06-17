import React, { useState } from 'react';
import { HelpCircle, ShieldCheck, ShieldAlert, Activity } from 'lucide-react';

export default function HealthGauge({ healthScore, baseHealth, penalty, breakdown }) {
  const [showExplanation, setShowExplanation] = useState(false);

  const sensorNames = {
    temp_01: 'Temperature',
    vib_01: 'Vibration',
    pres_01: 'Pressure',
    rpm_01: 'RPM',
    pwr_01: 'Power',
  };

  const getGaugeColor = (score) => {
    if (score >= 70) return '#10b981';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  const getGaugeClass = (score) => {
    if (score >= 70) return 'stroke-emerald-500';
    if (score >= 40) return 'stroke-amber-500';
    return 'stroke-red-500';
  };

  const getHealthBg = (score) => {
    if (score >= 70) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (score >= 40) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  };

  // SVG Gauge computation
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (healthScore / 100) * circumference;
  const color = getGaugeColor(healthScore);

  return (
    <div className="relative bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-2xl p-6 flex flex-col items-center card-hover h-full" aria-label="Machine Health Gauge Panel">
      <div className="w-full flex justify-between items-center mb-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-blue-400" />
          Machine Health
        </h3>
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
          title="Explain this score formula"
          aria-label="Explain health score calculation formula"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      <div className="relative flex items-center justify-center w-44 h-44 my-2" role="progressbar" aria-valuenow={healthScore} aria-valuemin="0" aria-valuemax="100">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
          {/* Background circle */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            className="stroke-slate-800/50"
            strokeWidth="8"
            fill="transparent"
          />
          {/* Glow track */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke={color}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            opacity="0.15"
            style={{ filter: 'blur(8px)' }}
          />
          {/* Active progress */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke={color}
            className="transition-all duration-1000 ease-out"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center" aria-live="polite">
          <span className="text-5xl font-black tracking-tight text-white" style={{ textShadow: `0 0 20px ${color}40` }}>
            {Math.round(healthScore)}%
          </span>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Health</span>
        </div>
      </div>

      <div className={`w-full text-center border rounded-lg py-1.5 px-3 font-semibold text-xs ${getHealthBg(healthScore)}`} role="status" aria-live="polite">
        {healthScore >= 70 ? (
          <span className="flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Operating Normally
          </span>
        ) : (
          <span className="flex items-center justify-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 animate-bounce" /> Maintenance Recommended
          </span>
        )}
      </div>

      {showExplanation && (
        <div className="absolute inset-x-0 bottom-0 top-12 bg-slate-950/95 border-t border-white/10 rounded-b-2xl p-4 overflow-y-auto text-xs z-20 animate-fade-in">
          <h4 className="font-bold text-slate-200 mb-2 border-b border-white/10 pb-1">How is this calculated?</h4>
          <p className="text-slate-400 mb-3 leading-relaxed">
            Health = <span className="text-slate-200">Weighted Sensor Health ({Math.round(baseHealth)}%)</span> 
            {penalty > 0 && <span className="text-red-400"> - Anomaly Penalty ({Math.round(penalty)}%)</span>}.
          </p>
          <h5 className="font-semibold text-slate-300 mb-1.5">Sensor Weights & Contribution:</h5>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {breakdown && Object.entries(breakdown).map(([sid, item]) => (
              <div key={sid} className="flex justify-between items-center bg-slate-900/80 px-2.5 py-1.5 rounded-lg">
                <span className="text-slate-400 font-mono text-[10px]">{sensorNames[sid] || sid}</span>
                <span className="text-slate-600 text-[10px]">w:{(item.weight * 100).toFixed(0)}%</span>
                <span className={`font-bold text-[10px] ${item.health >= 0.7 ? 'text-emerald-400' : item.health >= 0.2 ? 'text-amber-400' : 'text-red-400'}`}>
                  {(item.health * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
          <button 
            onClick={() => setShowExplanation(false)}
            className="w-full mt-3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 rounded-lg text-center transition-colors text-[10px]"
          >
            Close Breakdown
          </button>
        </div>
      )}
    </div>
  );
}
