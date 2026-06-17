import React, { useState, useEffect } from 'react';
import { Radio, Shield, HelpCircle } from 'lucide-react';

function StatusBar({ isConnected }) {
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-slate-950/80 border-t border-white/5 backdrop-blur-md px-6 py-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
          <span className={isConnected ? 'text-emerald-400' : 'text-red-400'}>
            {isConnected ? 'Connection: Live' : 'Connection: Disconnected'}
          </span>
        </div>

        {/* Edge mode */}
        <div className="flex items-center gap-1 text-slate-400">
          <Shield className="w-3.5 h-3.5 text-blue-400" />
          <span>Edge Inference Mode (ONNX + Docker)</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span>System Time: {time}</span>
        <span>Build v1.0.0</span>
      </div>
    </div>
  );
}

export default React.memo(StatusBar);
