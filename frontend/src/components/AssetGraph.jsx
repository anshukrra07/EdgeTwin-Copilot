import React, { useState, useEffect } from 'react';
import { useMachine } from '../context/MachineContext';
import { Activity, AlertTriangle, Zap, Server } from 'lucide-react';
import { API_BASE } from '../config';

export default function AssetGraph({ activeSiteId }) {
  const { selectedMachineId, setSelectedMachineId } = useMachine();
  const [machineStatuses, setMachineStatuses] = useState(null);
  const [error, setError] = useState(null);

  // Poll status of all machines every 1.5 seconds
  useEffect(() => {
    let active = true;
    const fetchStatuses = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/machines/status`);
        if (!res.ok) throw new Error('Failed to fetch status');
        const data = await res.json();
        if (active) {
          setMachineStatuses(data);
          setError(null);
        }
      } catch (err) {
        if (active) setError('Connection lost');
      }
    };

    fetchStatuses();
    const interval = setInterval(fetchStatuses, 1500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Determine machine IDs based on the active site
  const parentId = activeSiteId === 'site_detroit' ? 'AC-002' : 'AC-001';
  const childId = activeSiteId === 'site_detroit' ? 'CNC-002' : 'CNC-001';
  
  const acStatus = machineStatuses?.[parentId];
  const cncStatus = machineStatuses?.[childId];

  // Read pressure from parent compressor sensors
  const pressureValue = acStatus?.sensors?.['pres_01'];
  // Determine if there is cascading starvation: pressure drops below 95 kPa
  const isStarvationActive = pressureValue !== undefined && pressureValue < 95.0;

  return (
    <div className="bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-2xl p-5 flex flex-col h-[280px] w-full animate-fade-in" aria-label="Asset Dependency Topology">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-cyan-400" />
          Plant Asset Dependency ({activeSiteId === 'site_detroit' ? 'Detroit Plant' : 'Chicago HQ'})
        </h3>
        {isStarvationActive ? (
          <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-red-500 animate-pulse uppercase">
            <AlertTriangle className="w-3.5 h-3.5" />
            Cascading Pressure Starvation
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[9px] font-mono text-emerald-400">
            <Zap className="w-3 h-3 animate-pulse" />
            Pneumatic Loop Synchronized
          </div>
        )}
      </div>

      {/* SVG Asset Graph */}
      <div className="flex-1 relative min-h-0 w-full flex items-center justify-center">
        {error && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center text-[10px] text-red-400 font-mono z-10">
            ⚠ {error}
          </div>
        )}
        
        <svg className="w-full h-full min-h-[160px]" viewBox="0 0 500 160">
          <defs>
            {/* Linear Gradients for Flow */}
            <linearGradient id="flowGradNormal" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="flowGradStarved" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.8" />
            </linearGradient>
            {/* Arrow Marker */}
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill={isStarvationActive ? '#ef4444' : '#06b6d4'} />
            </marker>
          </defs>

          {/* Connection Line (Link) */}
          <path
            d="M 175 80 L 325 80"
            stroke={isStarvationActive ? 'url(#flowGradStarved)' : 'url(#flowGradNormal)'}
            strokeWidth="4"
            fill="none"
            strokeDasharray={isStarvationActive ? '5,10' : '8,6'}
            className={isStarvationActive ? 'animate-[dash_1.5s_linear_infinite]' : 'animate-[dash_0.8s_linear_infinite]'}
            style={{
              strokeDashoffset: 100,
              animationName: 'dash',
              animationIterationCount: 'infinite',
              animationTimingFunction: 'linear'
            }}
            markerEnd="url(#arrow)"
          />

          {/* Node 1: Air Compressor (Parent) */}
          <g
            transform="translate(40, 30)"
            className="cursor-pointer group"
            onClick={() => setSelectedMachineId(parentId)}
          >
            {/* Background Container Box */}
            <rect
              width="130"
              height="100"
              rx="12"
              fill="#0b0f19"
              stroke={selectedMachineId === parentId ? '#06b6d4' : '#1e293b'}
              strokeWidth={selectedMachineId === parentId ? 2 : 1}
              className={`transition-all duration-200 ${selectedMachineId === parentId ? 'shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'group-hover:stroke-slate-700'}`}
            />
            {/* Health glow bar at left edge */}
            <path
              d="M 2 12 Q 2 6 8 6 L 12 6 L 12 94 L 8 94 Q 2 94 2 88 Z"
              fill={acStatus?.alert_level === 'critical' ? '#ef4444' : acStatus?.alert_level === 'warning' ? '#f59e0b' : '#10b981'}
            />
            {/* Machine Name & ID */}
            <text x="18" y="24" fill="#ffffff" fontSize="11" fontWeight="bold">{parentId}</text>
            <text x="18" y="38" fill="#64748b" fontSize="8" fontWeight="medium">Compressor Unit</text>

            {/* Metrics */}
            <text x="18" y="62" fill="#94a3b8" fontSize="9" fontWeight="bold">Health Score</text>
            <text x="18" y="80" fill={acStatus?.alert_level === 'critical' ? '#ef4444' : acStatus?.alert_level === 'warning' ? '#f59e0b' : '#10b981'} fontSize="18" fontWeight="black">
              {acStatus?.health_score ?? 100}%
            </text>

            {/* Micro pressure details */}
            <text x="75" y="80" fill="#64748b" fontSize="8" fontFamily="monospace">
              {pressureValue !== undefined ? `${pressureValue.toFixed(1)} kPa` : 'N/A'}
            </text>
          </g>

          {/* Node 2: CNC Mill (Child) */}
          <g
            transform="translate(330, 30)"
            className="cursor-pointer group"
            onClick={() => setSelectedMachineId(childId)}
          >
            {/* Background Container Box */}
            <rect
              width="130"
              height="100"
              rx="12"
              fill="#0b0f19"
              stroke={selectedMachineId === childId ? '#06b6d4' : '#1e293b'}
              strokeWidth={selectedMachineId === childId ? 2 : 1}
              className={`transition-all duration-200 ${selectedMachineId === childId ? 'shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'group-hover:stroke-slate-700'}`}
            />
            {/* Health glow bar at left edge */}
            <path
              d="M 2 12 Q 2 6 8 6 L 12 6 L 12 94 L 8 94 Q 2 94 2 88 Z"
              fill={cncStatus?.alert_level === 'critical' ? '#ef4444' : cncStatus?.alert_level === 'warning' ? '#f59e0b' : '#10b981'}
            />
            {/* Machine Name & ID */}
            <text x="18" y="24" fill="#ffffff" fontSize="11" fontWeight="bold">{childId}</text>
            <text x="18" y="38" fill="#64748b" fontSize="8" fontWeight="medium">CNC Milling Mill</text>

            {/* Metrics */}
            <text x="18" y="62" fill="#94a3b8" fontSize="9" fontWeight="bold">Health Score</text>
            <text x="18" y="80" fill={cncStatus?.alert_level === 'critical' ? '#ef4444' : cncStatus?.alert_level === 'warning' ? '#f59e0b' : '#10b981'} fontSize="18" fontWeight="black">
              {cncStatus?.health_score ?? 100}%
            </text>

            {/* Micro wear/speed details */}
            <text x="75" y="80" fill="#64748b" fontSize="8" fontFamily="monospace">
              {cncStatus?.sensors?.['spindle_01'] ? `${Math.round(cncStatus.sensors['spindle_01'])} RPM` : 'N/A'}
            </text>
          </g>

          {/* Cascading Connection Starvation Text Overlay */}
          {isStarvationActive && (
            <g transform="translate(180, 65)">
              <rect x="0" y="0" width="140" height="15" rx="4" fill="#7f1d1d" opacity="0.9" />
              <text x="70" y="10" fill="#fecaca" fontSize="7" fontWeight="bold" fontFamily="monospace" textAnchor="middle" className="animate-pulse">
                PRESSURE DEPLETION CASCADING
              </text>
            </g>
          )}

          {/* Energy flow label */}
          <text x="250" y="50" fill="#64748b" fontSize="8" fontWeight="bold" textAnchor="middle" letterSpacing="1">
            PNEUMATIC LINE
          </text>
        </svg>

        {/* Global dash animation style injection */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes dash {
            to {
              stroke-dashoffset: 0;
            }
          }
        `}} />
      </div>

      {/* Footer Info */}
      <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-mono border-t border-white/5 pt-3 mt-1">
        <Activity className="w-3.5 h-3.5 text-cyan-500" />
        <span>Click nodes to inspect asset models. Energy/pressure flows downstream from {parentId}.</span>
      </div>
    </div>
  );
}
