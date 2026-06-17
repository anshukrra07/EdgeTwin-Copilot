import React, { useMemo } from 'react';
import { AlertTriangle, Skull, ShieldCheck, AlertCircle } from 'lucide-react';

/**
 * StatusBeacon — Large, animated status indicator visible from across the factory floor.
 *
 * Props:
 *   alertLevel    — 'none' | 'warning' | 'critical'
 *   predictedState — 0 (NORMAL) | 1 (WARNING) | 2 (CRITICAL) | 3 (FAILURE)
 *   healthScore   — 0–100
 */

const STATE_CONFIG = {
  0: {
    label: 'Operating Normally',
    color: '#10b981',          // emerald-500
    bgRing: 'bg-emerald-500',
    textColor: 'text-emerald-400',
    glowColor: 'rgba(16, 185, 129, 0.45)',
    glowColorSoft: 'rgba(16, 185, 129, 0.15)',
    animation: 'beacon-pulse-green',
    Icon: ShieldCheck,
  },
  1: {
    label: 'Warning — Attention Needed',
    color: '#f59e0b',          // amber-500
    bgRing: 'bg-amber-500',
    textColor: 'text-amber-400',
    glowColor: 'rgba(245, 158, 11, 0.5)',
    glowColorSoft: 'rgba(245, 158, 11, 0.15)',
    animation: 'beacon-breathe-amber',
    Icon: AlertTriangle,
  },
  2: {
    label: 'Critical — Action Required',
    color: '#ef4444',          // red-500
    bgRing: 'bg-red-500',
    textColor: 'text-red-400',
    glowColor: 'rgba(239, 68, 68, 0.6)',
    glowColorSoft: 'rgba(239, 68, 68, 0.18)',
    animation: 'beacon-flash-red',
    Icon: AlertCircle,
  },
  3: {
    label: 'Failure — Machine Down',
    color: '#991b1b',          // red-800 (dark red)
    bgRing: 'bg-red-800',
    textColor: 'text-red-500',
    glowColor: 'rgba(153, 27, 27, 0.55)',
    glowColorSoft: 'rgba(153, 27, 27, 0.2)',
    animation: 'beacon-flash-red',
    Icon: Skull,
  },
};

/* Resolve numeric or string predictedState to a 0–3 integer */
function resolveState(predictedState, alertLevel) {
  const num = Number(predictedState);
  if (!isNaN(num) && num >= 0 && num <= 3) return num;
  // Fallback: derive from alertLevel
  if (alertLevel === 'critical') return 2;
  if (alertLevel === 'warning') return 1;
  return 0;
}

function StatusBeacon({ alertLevel = 'none', predictedState = 0, healthScore = 100 }) {
  const state = useMemo(() => resolveState(predictedState, alertLevel), [predictedState, alertLevel]);
  const config = STATE_CONFIG[state] || STATE_CONFIG[0];
  const { label, color, glowColor, glowColorSoft, animation, Icon, textColor } = config;

  const healthDisplay = typeof healthScore === 'number' ? Math.round(healthScore) : '—';

  /* Color for the health sub-label */
  const healthColor =
    healthScore >= 70 ? 'text-emerald-400' :
    healthScore >= 40 ? 'text-amber-400' :
    'text-red-400';

  return (
    <div className="flex items-center gap-5 select-none">
      {/* ─── Animated Beacon Circle ─── */}
      <div className="relative flex-shrink-0" style={{ width: 88, height: 88 }}>
        {/* Outer glow rings */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
            animation: `${animation} 2s ease-in-out infinite`,
          }}
        />
        <span
          className="absolute rounded-full"
          style={{
            inset: 6,
            background: `radial-gradient(circle, ${glowColorSoft} 0%, transparent 65%)`,
            animation: `${animation} 2s ease-in-out infinite 0.3s`,
          }}
        />
        {/* Core circle */}
        <span
          className="absolute rounded-full flex items-center justify-center shadow-lg"
          style={{
            inset: 16,
            backgroundColor: color,
            boxShadow: `0 0 24px ${glowColor}, inset 0 -4px 12px rgba(0,0,0,0.3)`,
            animation: `${animation} 2s ease-in-out infinite`,
          }}
        >
          <Icon className="w-7 h-7 text-white drop-shadow-md" strokeWidth={2.5} />
        </span>
      </div>

      {/* ─── Text Block ─── */}
      <div className="flex flex-col gap-1 min-w-0">
        <span className={`text-[17px] font-extrabold leading-snug tracking-tight ${textColor}`}>
          {label}
        </span>
        <span className={`text-sm font-semibold tabular-nums ${healthColor}`}>
          Health Score: {healthDisplay}
          <span className="text-slate-500 font-normal">%</span>
        </span>
      </div>

      {/* ─── Inline keyframes (scoped to this component) ─── */}
      <style>{`
        @keyframes beacon-pulse-green {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.65; transform: scale(1.06); }
        }
        @keyframes beacon-breathe-amber {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(1.10); }
        }
        @keyframes beacon-flash-red {
          0%, 100% { opacity: 1; transform: scale(1); }
          15%      { opacity: 0.25; transform: scale(1.04); }
          30%      { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.3; transform: scale(1.08); }
          70%      { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

export default React.memo(StatusBeacon);
