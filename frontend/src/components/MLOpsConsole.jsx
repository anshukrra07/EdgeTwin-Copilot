import React, { useState, useEffect } from 'react';
import { BrainCircuit, X, RefreshCw, Activity, Cpu, AlertTriangle, ShieldCheck, Terminal } from 'lucide-react';
import { API_BASE } from '../config';

export default function MLOpsConsole({ isOpen, onClose }) {
  const [mlopsStatus, setMlopsStatus] = useState(null);
  const [selectedMachineLogs, setSelectedMachineLogs] = useState('AC-001');
  const [actionLoading, setActionLoading] = useState({});
  const [error, setError] = useState(null);

  // Poll MLOps status endpoint every 1.0 second while the panel is open
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/mlops/status`);
        if (!res.ok) throw new Error('Failed to fetch MLOps status');
        const data = await res.json();
        if (active) {
          setMlopsStatus(data);
          setError(null);
        }
      } catch (err) {
        if (active) setError('Could not reach MLOps edge registry');
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isOpen]);

  const handleManualRetrain = async (machineId) => {
    setActionLoading(prev => ({ ...prev, [machineId]: true }));
    try {
      const token = localStorage.getItem('edgetwin_token') || 'operator-session-token-secret-1234';
      const res = await fetch(`${API_BASE}/api/mlops/retrain/${machineId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Trigger failed');
      }
      setSelectedMachineLogs(machineId);
    } catch (err) {
      alert(`MLOps Retrain Trigger Failed: ${err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [machineId]: false }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-labelledby="mlops-console-title">
      <div className="bg-slate-900 border border-cyan-500/20 w-full max-w-4xl h-[85vh] rounded-3xl overflow-hidden flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.15)] relative">
        {/* Glow Line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>

        {/* Top Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="bg-cyan-500/10 border border-cyan-500/30 p-2 rounded-xl">
              <BrainCircuit className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 id="mlops-console-title" className="text-sm font-black uppercase tracking-wider text-white">MLOps Edge Model Registry</h2>
              <p className="text-[10px] text-slate-500 font-mono">Real-time Drift Detection & Auto-Retraining Loop</p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Close MLOps Console"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Content Layout */}
        <div className="flex-1 flex min-h-0 overflow-hidden divide-x divide-white/5">
          
          {/* Left panel: Models Overview */}
          <div className="w-[45%] p-6 overflow-y-auto scrollbar-thin flex flex-col gap-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              Active Models Status
            </h3>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold p-3 rounded-xl uppercase tracking-wider font-mono text-center">
                ⚠ {error}
              </div>
            )}

            {mlopsStatus && Object.entries(mlopsStatus).map(([mId, state]) => {
              const driftPercent = Math.min((state.drift_score / 2.5) * 100, 100);
              const driftThresholdPercent = (1.8 / 2.5) * 100;
              const isHighDrift = state.drift_score >= 1.8;

              return (
                <div 
                  key={mId} 
                  className={`p-4 rounded-2xl border transition-all duration-200 ${
                    state.is_training 
                      ? 'bg-amber-500/5 border-amber-500/30' 
                      : isHighDrift 
                        ? 'bg-red-500/5 border-red-500/30'
                        : 'bg-slate-950/40 border-white/5 hover:border-cyan-500/20'
                  }`}
                >
                  {/* Header Row */}
                  <div className="flex justify-between items-start mb-2.5">
                    <div>
                      <h4 className="text-xs font-bold text-white">{mId === 'AC-001' ? 'Air Compressor Unit 1' : 'CNC Milling Machine 1'}</h4>
                      <p className="text-[9px] text-slate-500 font-mono uppercase">{mId}</p>
                    </div>
                    {state.is_training ? (
                      <span className="text-[9px] font-bold px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        RETRAINING
                      </span>
                    ) : isHighDrift ? (
                      <span className="text-[9px] font-bold px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 animate-pulse" />
                        HIGH DRIFT
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        ACTIVE
                      </span>
                    )}
                  </div>

                  {/* Metadata info */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mb-3 bg-slate-950/80 p-2.5 rounded-xl border border-white/5">
                    <div>
                      <span className="text-slate-500 block">VERSION</span>
                      <span className="text-slate-300 font-bold">{state.model_version}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">LAST TRAINED</span>
                      <span className="text-slate-300 truncate block" title={state.last_trained}>
                        {state.last_trained ? state.last_trained.split(' ')[0] : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Drift Indicator */}
                  <div className="space-y-1 mb-4">
                    <div className="flex justify-between items-center text-[9px] font-mono">
                      <span className="text-slate-500">DRIFT SCORE</span>
                      <span className={`${isHighDrift ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
                        {state.drift_score.toFixed(3)} <span className="text-slate-500">/ 1.800 limit</span>
                      </span>
                    </div>
                    {/* Drift Score Progress Bar */}
                    <div className="w-full bg-slate-950 h-2 rounded-full relative overflow-hidden border border-white/5">
                      {/* Retraining Threshold Indicator Pin */}
                      <div 
                        className="absolute top-0 bottom-0 w-[1px] bg-red-500/50 z-10" 
                        style={{ left: `${driftThresholdPercent}%` }}
                        title="Auto-retraining threshold (1.800)"
                      ></div>
                      <div 
                        className={`h-full transition-all duration-500 ease-out ${
                          isHighDrift ? 'bg-gradient-to-r from-red-500 to-rose-500 animate-pulse' : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                        }`}
                        style={{ width: `${driftPercent}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleManualRetrain(mId)}
                      disabled={state.is_training || actionLoading[mId]}
                      className="flex-1 bg-cyan-600/10 border border-cyan-500/20 hover:border-cyan-500/40 text-cyan-400 hover:text-cyan-300 disabled:bg-slate-950 disabled:text-slate-600 disabled:border-white/5 rounded-xl py-2 px-3 text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 leading-none"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${state.is_training || actionLoading[mId] ? 'animate-spin' : ''}`} />
                      RETRAIN NOW
                    </button>
                    
                    <button
                      onClick={() => setSelectedMachineLogs(mId)}
                      className={`px-3 py-2 text-[10px] font-bold font-mono rounded-xl border transition-all cursor-pointer active:scale-95 leading-none ${
                        selectedMachineLogs === mId 
                          ? 'bg-slate-950 border-cyan-500/30 text-cyan-400' 
                          : 'bg-transparent border-white/5 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      VIEW LOGS
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right panel: Terminal logs */}
          <div className="flex-1 flex flex-col p-6 min-w-0 bg-slate-950/20">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                Pipeline Output Logs: <span className="text-cyan-400 font-mono">{selectedMachineLogs}</span>
              </h3>
              <span className="text-[8px] font-mono bg-emerald-950/30 text-emerald-500 border border-emerald-500/10 px-2 py-0.5 rounded animate-pulse">
                EDGE STREAM ACTIVE
              </span>
            </div>

            {/* Terminal View */}
            <div 
              className="flex-1 bg-black/80 border border-white/5 rounded-2xl p-4 font-mono text-[10px] leading-relaxed text-emerald-400/90 overflow-y-auto scrollbar-thin shadow-inner"
              aria-live="polite"
            >
              {mlopsStatus?.[selectedMachineLogs]?.training_logs?.map((log, idx) => (
                <div key={idx} className="flex gap-2 mb-1 items-start">
                  <span className="text-slate-600 select-none">[{idx + 1}]</span>
                  <span className="break-all">{log}</span>
                </div>
              ))}
              {mlopsStatus?.[selectedMachineLogs]?.is_training && (
                <div className="flex items-center gap-1.5 text-amber-400 animate-pulse mt-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                  <span>Compiling temporal rolling window weights...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-slate-950/80 border-t border-white/5 flex items-center justify-between text-[9px] text-slate-500 font-mono">
          <span>Target Edge Model Platform: ONNX Runtime (WASM Version)</span>
          <span>Automatic triggering daemon running in simulator thread (interval: 15s persistent drift)</span>
        </div>
      </div>
    </div>
  );
}
