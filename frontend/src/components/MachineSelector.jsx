import React from 'react';
import { Cpu } from 'lucide-react';

function MachineSelector({ machines, selectedMachineId, setSelectedMachineId, alertLevel, predictedState }) {

  const getStatusColor = (level) => {
    if (level === 'critical') return 'bg-red-500 shadow-red-500/50';
    if (level === 'warning') return 'bg-amber-500 shadow-amber-500/50';
    return 'bg-emerald-500 shadow-emerald-500/50';
  };

  const getPredictedStateLabel = (state) => {
    if (state === undefined || state === null) return 'INITIALIZING';
    const labels = ['NORMAL', 'WARNING', 'CRITICAL', 'FAILURE'];
    if (typeof state === 'number') {
      return labels[state] || 'UNKNOWN';
    }
    return String(state).toUpperCase();
  };

  return (
    <div className="flex items-center gap-3 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2">
      <Cpu className="w-5 h-5 text-blue-400" />
      <span className="text-sm font-semibold text-slate-400">Monitoring Asset:</span>
      <select
        value={selectedMachineId}
        onChange={(e) => setSelectedMachineId(e.target.value)}
        className="bg-transparent text-white font-bold outline-none cursor-pointer pr-4 focus:ring-0"
        aria-label="Select monitoring asset"
      >
        {machines.map((machine) => (
          <option key={machine.machine_id} value={machine.machine_id} className="bg-slate-950 text-white">
            {machine.display_name} ({machine.machine_id})
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1.5 ml-2" role="status" aria-live="polite">
        <span className={`w-3 h-3 rounded-full animate-pulse ${getStatusColor(alertLevel)}`} aria-label={`Asset status level ${alertLevel}`}></span>
        <span className="text-xs font-semibold text-slate-300">
          {getPredictedStateLabel(predictedState)}
        </span>
      </div>
    </div>
  );
}

export default React.memo(MachineSelector);
